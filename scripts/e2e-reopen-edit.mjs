// Reopen the MOST RECENT project from the dashboard and apply ONE edit — measures edit time +
// cost on an EXISTING site (no wasteful rebuild). Proves the real "come back and edit" flow.
// Run: CM_EDIT="add a Private Events section" node scripts/e2e-reopen-edit.mjs
import { chromium } from 'playwright'
import { remainingUsd } from './or-balance.mjs'
import { renderVerdict as getRenderVerdict } from './render-verdict.mjs'

const BASE = process.env.CM_TEST_BASE || 'https://codemineapp.com'
const EMAIL = process.env.CM_TEST_EMAIL, PASSWORD = process.env.CM_TEST_PASSWORD
const EDIT = process.env.CM_EDIT || 'add a short FAQ section to the bottom of the home page with 3 questions'
if (!EMAIL || !PASSWORD) { console.error('set CM_TEST_EMAIL / CM_TEST_PASSWORD'); process.exit(1) }
const t0 = Date.now(); const secs = () => ((Date.now() - t0) / 1000).toFixed(0)
const log = (...a) => console.log(`[${secs()}s]`, ...a)
const consoleErrors = []

const startRemaining = await remainingUsd()
const browser = await chromium.launch({ headless: process.env.PWHEADLESS !== 'false' })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)))

try {
  await ctx.addCookies([{ name: 'banner-hidden', value: 'true', domain: 'codemineapp.com', path: '/' }])
  log('login…')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.fill('#email', EMAIL); await page.fill('#password', PASSWORD)
  await page.click('button[type="submit"]'); await page.waitForTimeout(3000)

  log('open dashboard…')
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3500)
  const openBtn = page.locator('button:has-text("Open")').first()
  if (await openBtn.isVisible().catch(() => false) && await openBtn.isEnabled().catch(() => false)) {
    log('reopening most-recent project…'); await openBtn.click().catch(() => {})
  } else {
    throw new Error('no reopenable project (Open button disabled — no snapshot?)')
  }

  const chatInput = page.locator('input[placeholder*="message" i]:visible, input[placeholder*="building" i]:visible').first()
  await chatInput.waitFor({ state: 'visible', timeout: 90000 })
  log('builder loaded — waiting for preview…')
  let src = null
  for (let i = 0; i < 90 && !src; i++) {
    src = await page.evaluate(() => { const f = [...document.querySelectorAll('iframe')].find(f => /vercel\.run|sb-/.test(f.getAttribute('src') || '')); return f ? f.getAttribute('src') : null })
    if (!src) await page.waitForTimeout(4000)
  }
  log(src ? `preview live — ${src.slice(0, 50)}…` : 'no preview iframe yet (editing anyway)')

  const remBeforeEdit = await remainingUsd()
  const editStart = Date.now()
  log(`EDIT — "${EDIT}"`)
  await chatInput.fill(EDIT); await chatInput.press('Enter')
  let sawBusy = false, done = false, lastPhase = null
  for (let i = 0; i < 200; i++) {
    const st = await page.evaluate(() => {
      const ins = [...document.querySelectorAll('input[placeholder]')].filter(i => /message|building/i.test(i.getAttribute('placeholder') || ''))
      const ph = [...document.querySelectorAll('*')].find(n => /thinking|editing|updating|applying|building|starting preview/i.test(n.textContent || '') && (n.textContent || '').length < 70)
      return { busy: ins.some(i => i.disabled || /building|publishing/i.test(i.getAttribute('placeholder') || '')), enabled: ins.some(i => !i.disabled && i.offsetParent !== null), phase: ph ? ph.textContent.trim() : null }
    })
    if (st.busy) sawBusy = true
    if (st.phase && st.phase !== lastPhase) { lastPhase = st.phase; log(`  step → "${st.phase}"`) }
    if (sawBusy && st.enabled) { done = true; break }
    await page.waitForTimeout(3000)
  }
  const editSecs = ((Date.now() - editStart) / 1000).toFixed(0)
  const remAfter = await remainingUsd()
  const editCost = (remBeforeEdit != null && remAfter != null) ? (remBeforeEdit - remAfter).toFixed(3) : '?'

  let verdict = 'not checked'
  const finalSrc = await page.evaluate(() => { const f = [...document.querySelectorAll('iframe')].find(f => /vercel\.run|sb-/.test(f.getAttribute('src') || '')); return f ? f.getAttribute('src') : null })
  if (finalSrc) { try { const pv = await ctx.newPage(); await pv.goto(finalSrc, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {}); await pv.waitForTimeout(3000); const v = await getRenderVerdict(pv); await pv.screenshot({ path: 'scripts/edit-preview.png' }).catch(() => {}); verdict = v.rendered ? `RENDERED ✅ (${v.reason})` : `NOT RENDERED ❌ (${v.reason})`; await pv.close() } catch (e) { verdict = 'check failed: ' + e.message } }

  console.log('\n================ EDIT REPORT ================')
  console.log('edit:', EDIT)
  console.log('result:', done ? 'APPLIED ✅ (stream completed)' : (sawBusy ? 'UNCLEAR ⚠️ (timed out)' : 'NOT STARTED ❌'))
  console.log('edit time:', editSecs + 's')
  console.log('edit cost:', '$' + editCost)
  console.log('edited preview:', verdict)
  console.log('preview URL:', finalSrc || 'none')
  console.log('console errors:', consoleErrors.length)
  consoleErrors.slice(0, 8).forEach(e => console.log('   •', e))
  console.log('============================================')
} catch (e) {
  console.log('\nEDIT E2E ERROR:', e.message)
  await page.screenshot({ path: 'scripts/edit-error.png' }).catch(() => {})
} finally {
  await browser.close()
}
