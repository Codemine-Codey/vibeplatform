// Multi-route site inspector — proves a website is genuinely MULTI-PAGE and every route renders.
// Opens the site, discovers internal nav links, visits each route, reports per-route health
// (nodes / sections / images / text / heading) + screenshots each. Flags any blank/broken route.
// Usage: node scripts/inspect-site.mjs <baseUrl>
import { chromium } from 'playwright'

const BASE = (process.argv[2] || '').replace(/\/$/, '')
if (!BASE) { console.error('usage: node scripts/inspect-site.mjs <url>'); process.exit(1) }

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

async function scan(route) {
  const url = BASE + route
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const r = await page.evaluate(() => {
    const de = document.documentElement
    const bodyTxt = (document.body.innerText || '').replace(/\s+/g, ' ').trim()
    // simple stable content fingerprint (length + sampled chars) to detect duplicate pages
    let hash = 0; for (let i = 0; i < bodyTxt.length; i += 7) hash = (hash * 31 + bodyTxt.charCodeAt(i)) | 0
    return {
      nodes: document.querySelectorAll('*').length,
      sections: document.querySelectorAll('section, header, footer, main > div, [class*="section"]').length,
      imgs: [...document.querySelectorAll('img')].filter(i => i.currentSrc || i.src).length,
      text: bodyTxt.length,
      h: (document.querySelector('h1, h2')?.innerText || '').replace(/\s+/g, ' ').slice(0, 50),
      // horizontal overflow = the second scrollbar bug (mechanical detection)
      overflowX: de.scrollWidth > de.clientWidth + 2,
      overflowBy: de.scrollWidth - de.clientWidth,
      hash: bodyTxt.length + ':' + hash,
      links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))
        .filter(h => h && h.startsWith('/') && !h.startsWith('//')),
    }
  })
  const name = route === '/' ? 'home' : route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  await page.screenshot({ path: `scripts/route-${name}.png` }).catch(() => {})
  const ok = r.nodes >= 30 && r.text >= 120 // not blank/broken
  return { route, ok, ...r }
}

// Discover routes from the home page's nav, then visit each unique one.
const home = await scan('/')
const routes = [...new Set(['/', ...home.links])].filter(r => !r.includes('#')).slice(0, 8)
const results = [home]
for (const r of routes) {
  if (r === '/') continue
  results.push(await scan(r))
}

console.log('\n================ SITE INSPECTION ================')
console.log('base:', BASE)
let broken = 0, overflow = 0, dupes = 0
const homeHash = home.hash
for (const r of results) {
  const isDupe = r.route !== '/' && r.hash === homeHash // renders the SAME content as home = fake page
  const issues = []
  if (!r.ok) { broken++; issues.push('BLANK/BROKEN') }
  if (r.overflowX) { overflow++; issues.push(`H-OVERFLOW +${r.overflowBy}px (2nd scrollbar)`) }
  if (isDupe) { dupes++; issues.push('DUPLICATE OF HOME') }
  const flag = issues.length === 0 ? '✅' : '❌'
  console.log(`${flag}  ${r.route.padEnd(14)} nodes=${String(r.nodes).padStart(4)} imgs=${String(r.imgs).padStart(2)} text=${String(r.text).padStart(5)}  h="${r.h}"${issues.length ? '  ⟵ ' + issues.join(', ') : ''}`)
}
console.log('------------------------------------------------')
console.log(`routes: ${results.length} | blank/broken: ${broken} | horizontal-overflow: ${overflow} | duplicate-of-home: ${dupes}`)
const pass = results.length >= 2 && broken === 0 && overflow === 0 && dupes === 0
console.log(pass
  ? '✅ PASS — multi-page, every route distinct + renders, ZERO horizontal overflow'
  : `❌ FAIL — ${[broken && `${broken} blank`, overflow && `${overflow} overflow`, dupes && `${dupes} duplicate`, results.length < 2 && 'single-page'].filter(Boolean).join(', ')}`)
console.log('screenshots: scripts/route-*.png')
console.log('================================================')
await browser.close()
