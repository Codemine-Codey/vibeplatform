// Full end-to-end build test against production. Logs in with the test account,
// submits a website prompt, and captures EVERYTHING: time-to-preview, console errors,
// failed requests (404s), and any leaked infra/tech words in the visible chat.
//
// Run: node scripts/e2e-build.mjs [website|webapp|game]
import { chromium } from 'playwright'

const BASE = process.env.CM_TEST_BASE || 'https://codemineapp.com'
// Credentials come from env only — never hardcode the test account in the repo.
//   CM_TEST_EMAIL=... CM_TEST_PASSWORD=... node scripts/e2e-build.mjs website
const EMAIL = process.env.CM_TEST_EMAIL
const PASSWORD = process.env.CM_TEST_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('Set CM_TEST_EMAIL and CM_TEST_PASSWORD env vars before running.')
  process.exit(1)
}
const KIND = process.argv[2] || 'website'
const PROMPTS = {
  website: 'create a website for a specialty coffee shop called Ember and Ground with a menu and about page',
  webapp: 'build an expense tracker app where I can add, edit and delete expenses with a running total',
  game: 'make a snake game with keyboard controls, score, and a game over screen',
}
const PROMPT = PROMPTS[KIND] || PROMPTS.website

// Words that must NEVER appear in user-visible text. High-signal only — excludes
// terms that legitimately appear elsewhere: "tsx" (Code tab shows Home.tsx filenames),
// "neon"/"vite" (design/color words), "tailwind" (a real CSS word users may type).
const BANNED = ['sandbox', 'vercel.run', 'cloudflare', 'deepseek',
  'pnpm install', 'npm install', 'truncated', 'supabase', 'anthropic', 'openai',
  'http://localhost']

const t0 = Date.now()
const secs = () => ((Date.now() - t0) / 1000).toFixed(0)
const log = (...a) => console.log(`[${secs()}s]`, ...a)

const consoleErrors = []
const failedRequests = []
const leakHits = new Set()

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300))
})
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)))
page.on('requestfailed', (r) => {
  const u = r.url()
  if (!u.includes('/api/') && !u.endsWith('.map')) return
  failedRequests.push(`${r.failure()?.errorText || 'failed'} ${u.slice(0, 140)}`)
})
page.on('response', (r) => {
  if (r.status() === 404 && r.url().includes('/api/')) failedRequests.push(`404 ${r.url().slice(0, 140)}`)
})

try {
  // Pre-set the first-run flag cookie so the welcome modal NEVER renders (it blocks the UI).
  await ctx.addCookies([{ name: 'banner-hidden', value: 'true', domain: 'codemineapp.com', path: '/' }])
  log('login…')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.click('button[type="submit"]')

  // Fallback: if the modal still shows (cookie not honored), click its "Start building"
  // button and confirm it detaches before proceeding.
  await page.waitForTimeout(3000)
  const startBtn = page.locator('button:has-text("Start building")').first()
  if (await startBtn.isVisible().catch(() => false)) {
    await startBtn.click().catch(() => {})
    await startBtn.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
    log('welcome modal dismissed via button')
  } else {
    log('no welcome modal (cookie worked)')
  }

  // Wait for the app to load (VISIBLE chat input appears) — up to 60s.
  // Two inputs match (hidden duplicate + real one), so target :visible explicitly.
  const chatInput = page.locator('input[placeholder*="message" i]:visible, input[placeholder*="building" i]:visible').first()
  await chatInput.waitFor({ state: 'visible', timeout: 60000 })
  log('logged in, chat ready')

  // Submit the build prompt
  await chatInput.fill(PROMPT)
  await chatInput.press('Enter')

  // Single loop (up to 90s): the platform may ask up to 3 clarifying questions
  // ("QUESTION 1 OF 3 …") which appear a few seconds apart. Click "Skip — just build it"
  // whenever it shows, and detect build-start (input goes busy). No body-text scan.
  let started = false, skipped = false
  for (let i = 0; i < 60; i++) {
    started = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input[placeholder]')]
      return inputs.some((i) => i.disabled || /building|publishing/i.test(i.getAttribute('placeholder') || ''))
    })
    if (started) break
    const skip = page.locator('text=just build it').first()
    if (await skip.isVisible().catch(() => false)) {
      await skip.click().catch(() => {})
      if (!skipped) { log('clarify → clicked "Skip — just build it"'); skipped = true }
    }
    await page.waitForTimeout(1500)
  }
  if (!started) throw new Error('build never started — input never went busy (clarify not skipped / prompt not accepted)')
  log(`submitted ${KIND} prompt — BUILD STARTED (input busy) ✅`)

  // Poll for the preview iframe URL + scan chat for leaks, up to 14 min
  const DEADLINE = Date.now() + 14 * 60 * 1000
  let previewAt = null
  let lastChatLen = 0
  let lastPhase = null
  while (Date.now() < DEADLINE) {
    // preview iframe with a real sandbox URL
    if (!previewAt) {
      const src = await page.evaluate(() => {
        const iframes = [...document.querySelectorAll('iframe')]
        for (const f of iframes) {
          const s = f.getAttribute('src') || ''
          if (/vercel\.run|sb-|https?:\/\//.test(s) && !s.includes('about:blank')) return s
        }
        return null
      })
      if (src) {
        previewAt = secs()
        log(`PREVIEW LIVE at ${previewAt}s — ${src.slice(0, 60)}…`)
      }
    }
    // capture the build phase label (Thinking / Planning / Building / …) as it changes
    const phase = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((n) =>
        /thinking|planning your|building your|installing|starting preview|almost finishing/i.test(n.textContent || '') &&
        (n.textContent || '').length < 80)
      return el ? el.textContent.trim() : null
    })
    if (phase && phase !== lastPhase) { lastPhase = phase; log(`phase → "${phase}"`) }

    // scan visible chat text for banned words
    const chatText = (await page.evaluate(() => document.body.innerText || '')).toLowerCase()
    if (chatText.length !== lastChatLen) {
      lastChatLen = chatText.length
      for (const w of BANNED) {
        if (chatText.includes(w) && !leakHits.has(w)) {
          leakHits.add(w)
          log(`⚠️ LEAK: "${w}" appeared in visible text`)
        }
      }
    }
    // done? preview live AND stream idle (input re-enabled)
    if (previewAt) {
      const enabled = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll('input[placeholder]')]
          .filter((i) => /message|building/i.test(i.getAttribute('placeholder') || ''))
        // any visible, non-disabled message input means the stream finished
        return inputs.some((i) => !i.disabled && i.offsetParent !== null)
      })
      if (enabled) { log('build complete (input re-enabled)'); break }
    }
    await page.waitForTimeout(4000)
  }

  await page.screenshot({ path: 'scripts/e2e-result.png', fullPage: false }).catch(() => {})

  console.log('\n================ E2E REPORT ================')
  console.log('kind:', KIND)
  console.log('time-to-preview:', previewAt ? previewAt + 's' : 'NO PREVIEW (timed out)')
  console.log('total elapsed:', secs() + 's')
  console.log('leaked words:', leakHits.size ? [...leakHits].join(', ') : 'NONE ✅')
  console.log('console errors:', consoleErrors.length)
  consoleErrors.slice(0, 15).forEach((e) => console.log('   •', e))
  console.log('failed/404 API requests:', failedRequests.length)
  failedRequests.slice(0, 15).forEach((e) => console.log('   •', e))
  console.log('===========================================')
} catch (e) {
  console.log('\nE2E ERROR:', e.message)
  await page.screenshot({ path: 'scripts/e2e-error.png' }).catch(() => {})
} finally {
  await browser.close()
}
