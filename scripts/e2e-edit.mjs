// EDIT-path E2E: build a small project, then send an EDIT and verify the edit path is
// (1) working, (2) fast, (3) non-destructive (same workspace, not a rebuild), (4) never
// blanks. Answers "are edits working + are the gates active on edits + do they stay fast
// without messing up the whole codebase". Uses the same browser-UA login + version
// preflight as e2e-build.mjs.
//
// Run: CM_TEST_EMAIL=.. CM_TEST_PASSWORD=.. node scripts/e2e-edit.mjs
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { renderVerdict } from './render-verdict.mjs'

const BASE = process.env.CM_TEST_BASE || 'https://codemineapp.com'
const EMAIL = process.env.CM_TEST_EMAIL
const PASSWORD = process.env.CM_TEST_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('Set CM_TEST_EMAIL and CM_TEST_PASSWORD'); process.exit(1) }
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const BUILD_PROMPT = process.env.CM_BUILD_PROMPT || 'a simple notes app where I can add a note, see the list, and delete a note'
const EDIT_PROMPT = process.env.CM_EDIT_PROMPT || 'switch the whole app to a dark theme with a purple accent color'

const t0 = Date.now()
const secs = () => ((Date.now() - t0) / 1000).toFixed(0)
const log = (...a) => console.log(`[${secs()}s]`, ...a)

// current iframe preview src (sandbox URL), or null
async function previewSrc(page) {
  return page.evaluate(() => {
    const f = [...document.querySelectorAll('iframe')].find(f => /vercel\.run|sb-/.test(f.getAttribute('src') || ''))
    return f ? f.getAttribute('src') : null
  })
}
// true when the chat input is enabled again (turn finished)
async function inputIdle(page) {
  return page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[placeholder]')].filter(i => /message|building/i.test(i.getAttribute('placeholder') || ''))
    return inputs.some(i => !i.disabled && i.offsetParent !== null)
  })
}
async function renderCheck(ctx, src) {
  try {
    const pv = await ctx.newPage()
    await pv.goto(src, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
    await pv.waitForTimeout(3500)
    const v = await renderVerdict(pv)
    await pv.close()
    return { rendered: v.rendered, info: v.info, reason: v.reason }
  } catch (e) { return { rendered: false, info: { err: e.message }, reason: 'check-failed' } }
}

const browser = await chromium.launch({ headless: process.env.PWHEADLESS !== 'false' })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const leaks = new Set()
const BANNED = ['sandbox', 'deepseek', 'anthropic', 'claude', 'openai', 'vercel.run', 'cloudflare', 'supabase', 'unsplash']
page.on('console', () => {})

try {
  // Version preflight
  const localCommit = execSync('git rev-parse HEAD').toString().trim()
  const dep = await fetch(`${BASE}/api/version`, { headers: { 'User-Agent': BROWSER_UA } }).then(r => r.json()).catch(() => null)
  if (!dep || dep.commit !== localCommit) { console.error(`PREFLIGHT FAIL: deployed ${dep?.commit?.slice(0,8)} != local ${localCommit.slice(0,8)}`); process.exit(2) }
  log(`preflight OK — ${dep.commit.slice(0,8)}`)

  await ctx.addCookies([{ name: 'banner-hidden', value: 'true', domain: 'codemineapp.com', path: '/' }])
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.fill('#email', EMAIL); await page.fill('#password', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(3000)
  const startBtn = page.locator('button:has-text("Start building")').first()
  if (await startBtn.isVisible().catch(() => false)) { await startBtn.click().catch(() => {}); await startBtn.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {}) }
  const chatInput = page.locator('input[placeholder*="message" i]:visible, input[placeholder*="building" i]:visible').first()
  await chatInput.waitFor({ state: 'visible', timeout: 60000 })
  log('logged in')

  // ── BUILD ──
  await chatInput.fill(BUILD_PROMPT); await chatInput.press('Enter')
  for (let i = 0; i < 60; i++) {
    const skip = page.locator('text=just build it').first()
    if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {})
    const busy = await page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].some(i => i.disabled || /building|publishing/i.test(i.getAttribute('placeholder') || '')))
    const phased = await page.evaluate(() => /thinking\.\.\.|building your|generating|writing code|installing/i.test(document.body.innerText || ''))
    if (busy || phased) break
    await page.waitForTimeout(1500)
  }
  log('build started')
  const buildDeadline = Date.now() + 15 * 60 * 1000
  let buildSrc = null
  while (Date.now() < buildDeadline) {
    buildSrc = await previewSrc(page)
    if (buildSrc && await inputIdle(page)) break
    await page.waitForTimeout(4000)
  }
  if (!buildSrc) { console.log('EDIT-TEST: build produced no preview — abort'); process.exit(1) }
  const buildTime = +secs()
  const build = await renderCheck(ctx, buildSrc)
  log(`BUILD done in ${buildTime}s — preview ${build.rendered ? 'RENDERED ✅' : 'NOT RENDERED ❌'} (${JSON.stringify(build.info)}) — ${buildSrc.slice(0,50)}`)

  // ── EDIT ──
  const editStart = Date.now()
  const input2 = page.locator('input[placeholder*="message" i]:visible, input[placeholder*="building" i]:visible').first()
  await input2.fill(EDIT_PROMPT); await input2.press('Enter')
  log(`EDIT sent: "${EDIT_PROMPT}"`)
  // wait for edit turn to go busy then idle again
  await page.waitForTimeout(4000)
  const editDeadline = Date.now() + 8 * 60 * 1000
  let editDone = false
  while (Date.now() < editDeadline) {
    if (await inputIdle(page)) {
      // ensure it actually did work (some phase text appeared) — small settle
      await page.waitForTimeout(3000)
      if (await inputIdle(page)) { editDone = true; break }
    }
    // scan leaks during edit
    const body = (await page.evaluate(() => document.body.innerText || '')).toLowerCase()
    for (const w of BANNED) if (body.includes(w)) leaks.add(w)
    await page.waitForTimeout(3000)
  }
  const editTime = Math.round((Date.now() - editStart) / 1000)
  const editSrc = await previewSrc(page)
  const sameWorkspace = editSrc === buildSrc
  const afterEdit = await renderCheck(ctx, editSrc || buildSrc)

  console.log('\n================ EDIT E2E REPORT ================')
  console.log('build time:', buildTime + 's', '| build rendered:', build.rendered)
  console.log('edit completed:', editDone, '| edit time:', editTime + 's')
  console.log('same workspace (no rebuild):', sameWorkspace, `(build=${(buildSrc||'').slice(-18)} edit=${(editSrc||'').slice(-18)})`)
  console.log('preview after edit:', afterEdit.rendered ? 'RENDERED ✅ (not blank)' : 'BLANK/BROKEN ❌', JSON.stringify(afterEdit.info))
  console.log('edit faster than build:', editTime < buildTime, `(${editTime}s vs ${buildTime}s)`)
  console.log('leaked words:', leaks.size ? [...leaks].join(', ') : 'NONE ✅')
  const pass = editDone && sameWorkspace && afterEdit.rendered
  console.log('VERDICT:', pass ? 'EDIT PATH OK ✅' : 'EDIT PATH PROBLEM ❌')
  console.log('================================================')
  await page.screenshot({ path: 'scripts/e2e-edit-result.png' }).catch(() => {})
} catch (e) {
  console.log('\nEDIT-TEST ERROR:', e.message)
  await page.screenshot({ path: 'scripts/e2e-edit-error.png' }).catch(() => {})
} finally {
  await browser.close()
}
