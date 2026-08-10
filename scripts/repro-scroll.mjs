import { chromium } from 'playwright'
const URL = process.argv[2]
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 400)))
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(2000)
// step-scroll down the whole page, pausing so IntersectionObserver/animations fire
const h = await page.evaluate(() => document.body.scrollHeight)
for (let y = 0; y <= h; y += 400) {
  await page.evaluate(sy => window.scrollTo(0, sy), y)
  await page.waitForTimeout(500)
  const boundary = await page.evaluate(() => /Putting the final touches|updates automatically/i.test(document.body.innerText || ''))
  if (boundary) { console.log(`BOUNDARY HIT at scrollY=${y} (page height ${h})`); break }
}
await page.waitForTimeout(1000)
console.log('=== ERRORS CAPTURED ===')
for (const e of [...new Set(errors)].slice(0, 12)) console.log(e)
if (errors.length === 0) console.log('(no console errors captured — may need real scroll/interaction)')
await browser.close()
