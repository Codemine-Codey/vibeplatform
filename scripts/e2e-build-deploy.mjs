// Build a project on Codemine, wait for it to render, then deploy via Cloud → Deploy tab.
// Returns the permanent Cloudflare Pages URL.
//
// Usage:
//   CM_TEST_EMAIL=.. CM_TEST_PASSWORD=.. CM_TEST_PROMPT="..." node scripts/e2e-build-deploy.mjs website
//   CM_TEST_EMAIL=.. CM_TEST_PASSWORD=.. CM_TEST_PROMPT="..." node scripts/e2e-build-deploy.mjs webapp
//   CM_TEST_EMAIL=.. CM_TEST_PASSWORD=.. CM_TEST_PROMPT="..." node scripts/e2e-build-deploy.mjs game
import { chromium } from 'playwright'

const BASE = process.env.CM_TEST_BASE || 'https://codemineapp.com'
const EMAIL = process.env.CM_TEST_EMAIL
const PASSWORD = process.env.CM_TEST_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('Set CM_TEST_EMAIL and CM_TEST_PASSWORD'); process.exit(1) }
const KIND = process.argv[2] || 'website'
const PROMPTS = {
  website: 'Build a multi-page website for a luxury skincare brand called Lumière — editorial hero with full-viewport imagery, ingredient science section with animated cards, product grid, founder story, press mentions, and newsletter signup',
  webapp:  'Build a habit tracker app where I can create daily habits, check them off each day, see a streak counter and monthly completion heatmap, and get a weekly summary of my best and worst habits',
  game:    'Build a Phaser.js space shooter game — player ship moves left/right and shoots bullets upward, enemies fly down in formations, explosions on hit, score counter, 3 lives, game over and restart screen',
}
const PROMPT = process.env.CM_TEST_PROMPT || PROMPTS[KIND] || PROMPTS.website

const t0 = Date.now()
const secs = () => ((Date.now() - t0) / 1000).toFixed(0)
const log = (...a) => console.log(`[${secs()}s]`, ...a)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
await ctx.addCookies([{ name: 'banner-hidden', value: 'true', domain: 'codemineapp.com', path: '/' }])
let page = await ctx.newPage()
const shot = async (n) => page.screenshot({ path: `scripts/deploy-${n}.png` }).catch(() => {})

try {
  // ── LOGIN ────────────────────────────────────────────────────────────────────
  log('login…')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(3000)
  const startBtn = page.locator('button:has-text("Start building")').first()
  if (await startBtn.isVisible().catch(() => false)) {
    await startBtn.click().catch(() => {})
    await startBtn.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  }
  const chatInput = page.locator('input[placeholder*="message" i]:visible, input[placeholder*="building" i]:visible').first()
  await chatInput.waitFor({ state: 'visible', timeout: 60000 })
  log('logged in')

  // ── BUILD ────────────────────────────────────────────────────────────────────
  await chatInput.fill(PROMPT)
  await chatInput.press('Enter')
  let started = false
  for (let i = 0; i < 60; i++) {
    started = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input[placeholder]')]
      return inputs.some((i) => i.disabled || /building|publishing/i.test(i.getAttribute('placeholder') || ''))
    })
    if (started) break
    const skip = page.locator('text=just build it').first()
    if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {})
    await page.waitForTimeout(1500)
  }
  if (!started) throw new Error('build never started')
  log(`BUILD STARTED (${KIND})`)

  // Poll until preview iframe appears AND input re-enables (build complete)
  const DEADLINE = Date.now() + 20 * 60 * 1000
  let previewUrl = null
  let lastPhase = null
  while (Date.now() < DEADLINE) {
    if (!previewUrl) {
      const src = await page.evaluate(() => {
        const f = [...document.querySelectorAll('iframe')].find(f => /vercel\.run|sb-/.test(f.getAttribute('src') || ''))
        return f ? f.getAttribute('src') : null
      })
      if (src) { previewUrl = src; log(`preview live at ${secs()}s — ${src.slice(0, 55)}…`) }
    }
    const phase = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find(n =>
        /thinking|planning|building your|installing|finishing/i.test(n.textContent || '') && (n.textContent || '').length < 80)
      return el ? el.textContent.trim() : null
    })
    if (phase && phase !== lastPhase) { lastPhase = phase; log(`phase → "${phase}"`) }
    if (previewUrl) {
      const enabled = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll('input[placeholder]')]
          .filter(i => /message|building/i.test(i.getAttribute('placeholder') || ''))
        return inputs.some(i => !i.disabled && i.offsetParent !== null)
      })
      if (enabled) { log('build complete'); break }
    }
    await page.waitForTimeout(4000)
  }

  if (!previewUrl) throw new Error('build timed out — no preview URL appeared')

  // Quick render check on the preview
  const pv = await ctx.newPage()
  await pv.goto(previewUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
  await pv.waitForTimeout(4000)
  const info = await pv.evaluate(() => ({
    textLen: (document.body?.innerText || '').trim().length,
    nodes: document.querySelectorAll('body *').length,
    hasCanvas: !!document.querySelector('canvas'),
  })).catch(() => ({ textLen: 0, nodes: 0, hasCanvas: false }))
  await pv.close()

  const rendered = info.hasCanvas || (info.nodes >= 50 && info.textLen >= 400)
  if (!rendered) {
    log(`⚠️  preview looks like fallback (nodes=${info.nodes}, text=${info.textLen}) — aborting deploy`)
    throw new Error(`project rendered as fallback/blank (nodes=${info.nodes}, text=${info.textLen})`)
  }
  log(`render confirmed ✅ (nodes=${info.nodes}, text=${info.textLen}, canvas=${info.hasCanvas})`)
  await shot('render-ok')

  // ── CLOUD DEPLOY ─────────────────────────────────────────────────────────────
  log('opening Cloud tab…')

  // Click the Cloud tab in the right panel
  const cloudTab = page.locator('[role="tab"]:has-text("Cloud"), button:has-text("Cloud")').first()
  if (!(await cloudTab.isVisible().catch(() => false))) {
    // Try the tab by text anywhere visible
    const anyCloud = page.locator('text=Cloud').first()
    if (await anyCloud.isVisible().catch(() => false)) await anyCloud.click()
    else throw new Error('Cloud tab not found in UI')
  } else {
    await cloudTab.click()
  }
  await page.waitForTimeout(2000)
  await shot('cloud-tab')

  // Click Deploy section
  const deployBtn = page.locator('button:has-text("Deploy"), [role="tab"]:has-text("Deploy"), text=Deploy').first()
  if (await deployBtn.isVisible().catch(() => false)) {
    await deployBtn.click()
    await page.waitForTimeout(2000)
  }
  await shot('deploy-panel')
  log('deploy panel open')

  // Click the actual deploy/publish button
  const publishBtn = page.locator(
    'button:has-text("Deploy to Cloudflare"), button:has-text("Publish"), button:has-text("Deploy"), button:has-text("Launch")'
  ).first()
  if (!(await publishBtn.isVisible().catch(() => false))) {
    log('⚠️  no deploy button found — taking screenshot for inspection')
    await shot('no-deploy-btn')
    throw new Error('Deploy button not found in Cloud panel')
  }
  await publishBtn.click()
  log('deploy triggered — waiting for Cloudflare Pages URL…')
  await shot('deploy-triggered')

  // Wait up to 5 min for a *.pages.dev URL to appear in the page text
  let deployedUrl = null
  const deployDeadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deployDeadline) {
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '')
    const match = bodyText.match(/https?:\/\/[\w-]+\.pages\.dev[^\s]*/i)
    if (match) { deployedUrl = match[0].trim(); break }
    // Also check for URL in any anchor or input value
    const urlEl = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll('a[href*=".pages.dev"]')]
      if (anchors.length) return anchors[0].href
      const inputs = [...document.querySelectorAll('input[value*=".pages.dev"]')]
      if (inputs.length) return inputs[0].value
      return null
    }).catch(() => null)
    if (urlEl) { deployedUrl = urlEl; break }
    log(`waiting for deploy… (${Math.round((deployDeadline - Date.now()) / 1000)}s left)`)
    await page.waitForTimeout(8000)
  }

  await shot('deploy-result')

  if (deployedUrl) {
    log(`\n🚀 DEPLOYED SUCCESSFULLY`)
    log(`   Kind:   ${KIND}`)
    log(`   URL:    ${deployedUrl}`)
    log(`   Time:   ${secs()}s total`)
  } else {
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => '')
    log(`deploy did not return a *.pages.dev URL within 5 min. Page text:\n${txt}`)
    throw new Error('deploy URL not captured — check deploy-result.png')
  }

  console.log('\n================ DEPLOY REPORT ================')
  console.log('kind:', KIND)
  console.log('preview (sandbox):', previewUrl)
  console.log('deployed (permanent):', deployedUrl || 'NOT CAPTURED')
  console.log('render:', `nodes=${info.nodes}, text=${info.textLen}, canvas=${info.hasCanvas}`)
  console.log('total elapsed:', secs() + 's')
  console.log('=================================================')

} catch (e) {
  log('ERROR:', e.message)
  await shot('error')
  console.log('\n================ DEPLOY REPORT ================')
  console.log('kind:', KIND)
  console.log('STATUS: FAILED —', e.message)
  console.log('total elapsed:', secs() + 's')
  console.log('=================================================')
} finally {
  await browser.close()
}
