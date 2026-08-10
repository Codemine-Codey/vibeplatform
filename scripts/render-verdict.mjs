// Shared render verdict for the E2E scripts — kept in sync with the production headless
// gate (lib/pipeline-helpers.ts headlessRuntimeCheck) so the harness and the platform
// agree on what "broken" means. Two rules that matter beyond node-count:
//   - [data-cm-notfound] present at "/" = the NotFound/404 is showing = WRONG page = broken
//     (the notes-app failure — renders content, but the wrong content).
//   - node/text thresholds are a floor for "blank", not the primary signal.
export async function renderVerdict(pvPage) {
  // STEP-SCROLL first (mirrors the prod gate): sections mount/animate on scroll-into-view
  // via IntersectionObserver — an instant jump skips the middle so scroll-triggered crashes
  // (e.g. a stat counter on undefined) never fire. Walk down in steps so they do.
  await pvPage.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.75))
    let y = 0
    for (let i = 0; i < 40; i++) {
      window.scrollTo(0, y)
      await new Promise(r => setTimeout(r, 200))
      if (y >= document.body.scrollHeight) break
      y += step
    }
    window.scrollTo(0, document.body.scrollHeight)
  }).catch(() => {})
  await new Promise(r => setTimeout(r, 400))
  const info = await pvPage.evaluate(() => {
    const bodyText = (document.body?.innerText || '').trim()
    return {
      textLen: bodyText.length,
      hasCanvas: !!document.querySelector('canvas'),
      nodes: document.querySelectorAll('body *').length,
      notFound: !!document.querySelector('[data-cm-notfound]'),
      // error-boundary fallback showing at any scroll position = a section threw
      boundaryHit: bodyText.length < 400 &&
        /putting the final touches|something went wrong|this section (couldn'?t|could not) load|an error occurred/i.test(bodyText),
    }
  })
  if (info.boundaryHit) return { rendered: false, reason: 'ERROR-BOUNDARY (a section threw on scroll-into-view)', info }
  if (info.notFound) return { rendered: false, reason: 'NOTFOUND-404 (home route shows the 404 page — wrong/missing Home)', info }
  const rendered = info.hasCanvas || info.nodes >= 40 || info.textLen >= 300
  return { rendered, reason: rendered ? 'rendered' : 'blank/near-empty', info }
}
