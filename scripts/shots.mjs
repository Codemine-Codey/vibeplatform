import { chromium } from 'playwright'
const URL = process.argv[2]
const b = await chromium.launch({ headless: true })
const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
await p.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }).catch(()=>{})
await p.waitForTimeout(2500)
await p.screenshot({ path: 'scripts/_hero.png' })
await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(1200)
await p.screenshot({ path: 'scripts/_below.png' })
console.log('shots saved')
await b.close()
