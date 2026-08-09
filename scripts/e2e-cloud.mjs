// Cloud-features test: opens an existing project and exercises the Cloud tab
// (Database, Auth, Deploy), screenshotting each so we can report what actually happens.
// Run: CM_TEST_EMAIL=.. CM_TEST_PASSWORD=.. node scripts/e2e-cloud.mjs
import { chromium } from 'playwright'

const BASE = 'https://codemineapp.com'
const EMAIL = process.env.CM_TEST_EMAIL
const PASSWORD = process.env.CM_TEST_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('Set CM_TEST_EMAIL / CM_TEST_PASSWORD'); process.exit(1) }

const t0 = Date.now()
const secs = () => ((Date.now() - t0) / 1000).toFixed(0)
const log = (...a) => console.log(`[${secs()}s]`, ...a)
const consoleErrors = []

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await ctx.addCookies([{ name: 'banner-hidden', value: 'true', domain: 'codemineapp.com', path: '/' }])
  let page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })

  const shot = async (name) => { await page.screenshot({ path: `scripts/cloud-${name}.png` }).catch(() => {}) }
  const clickText = async (txt, ms = 1500) => {
    const el = page.locator(`text=${txt}`).first()
    if (await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); await page.waitForTimeout(ms); return true }
    return false
  }

  try {
    log('login…')
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.fill('#email', EMAIL); await page.fill('#password', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(4000)

    // Open the most recent project from the dashboard
    log('opening dashboard…')
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
    await shot('dashboard')
    // Open the first project via its "Open" button — may open a new tab.
    const openBtn = page.locator('button:has-text("Open"), a:has-text("Open")').first()
    if (!(await openBtn.isVisible().catch(() => false))) { log('no Open button found'); }
    const [popup] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null),
      openBtn.click().catch(() => {}),
    ])
    if (popup) { page = popup; log('project opened in new tab'); await page.waitForLoadState('domcontentloaded').catch(() => {}) }
    else log('project opened in same tab')
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
    await page.waitForTimeout(10000)
    await shot('project-opened')
    log('project view loaded')

    // Open the Cloud tab
    if (!(await clickText('Cloud', 3000))) log('⚠️ Cloud tab not found')
    else log('opened Cloud tab')
    await shot('cloud-overview')

    // ── Database ──
    await clickText('Database', 2500)
    await shot('cloud-database')
    log('database panel captured')
    // Attempt provision if the button is present
    if (await clickText('Add database', 2000) || await clickText('Create database', 2000) || await clickText('Set up', 2000)) {
      log('clicked provision — waiting up to 40s…')
      await page.waitForTimeout(40000)
      await shot('cloud-database-after')
      const txt = (await page.evaluate(() => document.body.innerText)).toLowerCase()
      if (/connected|provisioned|table/.test(txt)) log('DATABASE: provisioned ✅')
      else if (/limit|failed|error|try again/.test(txt)) log('DATABASE: failed (likely plan/limit) ⚠️')
      else log('DATABASE: state unclear')
    } else log('DATABASE: no provision button (maybe already provisioned)')

    // ── Auth ──
    if (await clickText('Auth', 2500)) { await shot('cloud-auth'); log('auth panel captured') }
    else log('⚠️ Auth panel not found')

    // ── Deploy ──
    if (await clickText('Deploy', 2500)) { await shot('cloud-deploy'); log('deploy panel captured') }
    else log('⚠️ Deploy panel not found')

    console.log('\n=== CLOUD TEST DONE ===')
    console.log('console errors:', consoleErrors.length)
    consoleErrors.slice(0, 8).forEach((e) => console.log('   •', e))
  } catch (e) {
    console.log('CLOUD TEST ERROR:', e.message)
    await shot('error')
  } finally {
    await browser.close()
  }
})()
