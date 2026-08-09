// HONEST cloud verification: builds a FRESH project (live sandbox), then exercises
// Database / Auth / Deploy — capturing the ACTUAL API response bodies so we report the
// real result (works / exact error), not guesses. Run:
//   CM_TEST_EMAIL=.. CM_TEST_PASSWORD=.. node scripts/e2e-cloud-full.mjs
import { chromium } from 'playwright'
import { writeFileSync, appendFileSync } from 'node:fs'

const BASE = 'https://codemineapp.com'
const EMAIL = process.env.CM_TEST_EMAIL
const PASSWORD = process.env.CM_TEST_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('Set CM_TEST_EMAIL / CM_TEST_PASSWORD'); process.exit(1) }

const OUT = 'scripts/cloud-result.log'
writeFileSync(OUT, '')

const t0 = Date.now()
const secs = () => ((Date.now() - t0) / 1000).toFixed(0)
const log = (...a) => {
  const line = `[${secs()}s] ${a.join(' ')}`
  console.log(line)
  try { appendFileSync(OUT, line + '\n') } catch {}
}

// Every /api/ response we saw (status + body), and the filtered target-endpoint hits.
const allApi = []
const apiResults = []

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
await ctx.addCookies([{ name: 'banner-hidden', value: 'true', domain: 'codemineapp.com', path: '/' }])
const page = await ctx.newPage()

// Capture the REAL response bodies of ALL /api calls, and flag the ones we care about.
const TARGET = /\/api\/(cloud\/neon|auth\/setup|deploy)(\b|\/|\?|$)/
page.on('response', async (r) => {
  const u = r.url()
  if (!/\/api\//.test(u)) return
  const path = u.split('/api/')[1]?.split('?')[0] ?? u
  const isTarget = TARGET.test(u)
  let body = ''
  try { body = await r.text() } catch {}
  const rec = { t: secs(), status: r.status(), path, url: u, body: body.slice(0, 2000) }
  allApi.push(rec)
  if (isTarget) {
    apiResults.push(rec)
    log(`>> API ${r.status()} ${path} -> ${body.slice(0, 400).replace(/\s+/g, ' ')}`)
  }
})

const shot = (n) => page.screenshot({ path: `scripts/cf-${n}.png` }).catch(() => {})

// Click a nav/panel button by its EXACT (trimmed) visible text.
const clickBtn = async (txt, waitMs = 2500) => {
  // Prefer a real <button>/role=button with that accessible name; fall back to any visible node.
  let el = page.getByRole('button', { name: txt, exact: true }).first()
  if (!(await el.isVisible().catch(() => false))) {
    el = page.getByRole('button', { name: new RegExp(`^\\s*${txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') }).first()
  }
  if (!(await el.isVisible().catch(() => false))) {
    el = page.locator(`text="${txt}"`).first()
  }
  if (await el.isVisible().catch(() => false)) {
    await el.click().catch(() => {})
    await page.waitForTimeout(waitMs)
    return true
  }
  log(`  (button "${txt}" not found/visible)`)
  return false
}

const bodyText = () => page.evaluate(() => document.body.innerText).catch(() => '')

const summary = { database: 'UNVERIFIED', auth: 'UNVERIFIED', deploy: 'UNVERIFIED' }

try {
  log('login...')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.fill('#email', EMAIL); await page.fill('#password', PASSWORD)
  await page.click('button[type="submit"]')

  const chatInput = page.locator('input[placeholder*="message" i]:visible').first()
  await chatInput.waitFor({ state: 'visible', timeout: 60000 })
  log('logged in; building a fresh project...')
  await chatInput.fill('build a simple guestbook web app where visitors leave a name and message')
  await chatInput.press('Enter')

  // skip clarify + wait for build to finish (input re-enabled AND a live preview iframe exists)
  const DEADLINE = Date.now() + 11 * 60 * 1000
  let ready = false
  while (Date.now() < DEADLINE) {
    const skip = page.locator('text=just build it').first()
    if (await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); log('clicked "just build it"') }
    const state = await page.evaluate(() => {
      const i = [...document.querySelectorAll('input[placeholder]')].find(x => /message/i.test(x.getAttribute('placeholder') || ''))
      const iframe = [...document.querySelectorAll('iframe')].find(f => /vercel\.run|sb-|\.workers\.dev|preview/.test(f.getAttribute('src') || ''))
      return { enabled: !!(i && !i.disabled), hasPreview: !!iframe, src: iframe?.getAttribute('src') || '' }
    })
    if (state.enabled && state.hasPreview) { ready = true; log('preview src: ' + state.src); break }
    await page.waitForTimeout(4000)
  }
  log(ready ? 'build finished with a live preview OK' : 'build did NOT finish in time (continuing to cloud anyway)')
  await shot('built')

  // Open the Cloud tab (top-level tab strip button labelled "Cloud").
  await clickBtn('Cloud', 2500)
  await shot('cloud-open')

  // ── Database ──────────────────────────────────────────────────────────────
  log('--- DATABASE ---')
  await clickBtn('Database', 2500)   // sub-nav
  await shot('database')
  const clickedDb = await clickBtn('Connect Database', 3000)
  log('clicked Connect Database: ' + clickedDb)
  // provision can take a while (Neon project create); poll DOM up to 90s
  {
    const dbDeadline = Date.now() + 90000
    while (Date.now() < dbDeadline) {
      const txt = (await bodyText()).toLowerCase()
      if (/connected|query browser|no tables yet|host/.test(txt)) break
      // provisionError renders in a destructive box; catch common phrases
      if (/failed|error|limit|couldn|try again/.test(txt) && !/connect database/.test(txt)) break
      await page.waitForTimeout(4000)
    }
  }
  await shot('database-after')
  {
    const dbTxt = (await bodyText()).toLowerCase()
    const neonHits = apiResults.filter(r => r.path.startsWith('cloud/neon'))
    const provisionResp = neonHits.reverse().find(r => /provision/.test(r.body) || r.body.includes('"host"') || r.body.includes('"error"'))
    if (/connected|query browser|no tables yet/.test(dbTxt) && !/connect database/.test(dbTxt)) summary.database = 'WORKS'
    else if (provisionResp && /"error"/.test(provisionResp.body)) summary.database = 'FAILS'
    else if (/failed|couldn|try again/.test(dbTxt)) summary.database = 'FAILS'
    else summary.database = 'UNVERIFIED'
    log('DATABASE => ' + summary.database)
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  log('--- AUTH ---')
  await clickBtn('Auth', 2500)   // sub-nav
  await shot('auth')
  const clickedAuth = await clickBtn('Enable Auth', 3000)
  log('clicked Enable Auth: ' + clickedAuth)
  {
    const authDeadline = Date.now() + 60000
    while (Date.now() < authDeadline) {
      const txt = (await bodyText()).toLowerCase()
      if (/login & signup is active|signed-up users/.test(txt)) break
      if (/setup failed|auth setup failed|error/.test(txt) && !/enable auth/.test(txt)) break
      await page.waitForTimeout(3000)
    }
  }
  await shot('auth-after')
  {
    const authTxt = (await bodyText()).toLowerCase()
    const authResp = apiResults.filter(r => r.path.startsWith('auth/setup')).pop()
    if (/login & signup is active|signed-up users/.test(authTxt)) summary.auth = 'WORKS'
    else if (authResp && (/"error"/.test(authResp.body) || authResp.status >= 400)) summary.auth = 'FAILS'
    else if (authResp && /"authUrl"/.test(authResp.body)) summary.auth = 'WORKS'
    else summary.auth = 'UNVERIFIED'
    log('AUTH => ' + summary.auth)
  }

  // ── Deploy ────────────────────────────────────────────────────────────────
  log('--- DEPLOY ---')
  await clickBtn('Deploy', 2500)   // sub-nav
  await shot('deploy')
  const clickedDep = await clickBtn('Publish Live', 3000)
  log('clicked Publish Live: ' + clickedDep)
  {
    const depDeadline = Date.now() + 150000  // build+publish can take a couple minutes
    while (Date.now() < depDeadline) {
      const txt = (await bodyText()).toLowerCase()
      if (/live!|\.pages\.dev|open\s*redeploy|custom domain/.test(txt)) break
      if (/hit a snag|failed|error/.test(txt)) break
      await page.waitForTimeout(4000)
    }
  }
  await shot('deploy-after')
  {
    const depTxt = (await bodyText()).toLowerCase()
    const depResp = apiResults.filter(r => r.path === 'deploy' || r.path.startsWith('deploy?')).pop()
    if (/live!|\.pages\.dev|custom domain/.test(depTxt)) summary.deploy = 'WORKS'
    else if (depResp && (/"error"/.test(depResp.body) || depResp.status >= 400)) summary.deploy = 'FAILS'
    else if (depResp && /"url"/.test(depResp.body)) summary.deploy = 'WORKS'
    else if (/hit a snag|failed/.test(depTxt)) summary.deploy = 'FAILS'
    else summary.deploy = 'UNVERIFIED'
    log('DEPLOY => ' + summary.deploy)
  }

  log('=== TARGET API RESPONSES ===')
  apiResults.forEach((r) => log(`  ${r.status} ${r.path} -> ${r.body.slice(0, 500).replace(/\s+/g, ' ')}`))
  log('=== SUMMARY ===')
  log(`  Database: ${summary.database}`)
  log(`  Auth:     ${summary.auth}`)
  log(`  Deploy:   ${summary.deploy}`)
} catch (e) {
  log('SCRIPT ERROR: ' + e.message)
  await shot('error')
} finally {
  // Dump the full API log for forensic detail.
  try { writeFileSync('scripts/cloud-api-dump.json', JSON.stringify({ summary, apiResults, allApi }, null, 2)) } catch {}
  log('DONE. Full dump: scripts/cloud-api-dump.json')
  await browser.close()
}
