// Shared render verdict for the E2E scripts — kept in sync with the production headless
// gate (lib/pipeline-helpers.ts headlessRuntimeCheck) so the harness and the platform
// agree on what "broken" means. Two rules that matter beyond node-count:
//   - [data-cm-notfound] present at "/" = the NotFound/404 is showing = WRONG page = broken
//     (the notes-app failure — renders content, but the wrong content).
//   - node/text thresholds are a floor for "blank", not the primary signal.
export async function renderVerdict(pvPage) {
  const info = await pvPage.evaluate(() => ({
    textLen: (document.body?.innerText || '').trim().length,
    hasCanvas: !!document.querySelector('canvas'),
    nodes: document.querySelectorAll('body *').length,
    notFound: !!document.querySelector('[data-cm-notfound]'),
  }))
  if (info.notFound) return { rendered: false, reason: 'NOTFOUND-404 (home route shows the 404 page — wrong/missing Home)', info }
  const rendered = info.hasCanvas || info.nodes >= 40 || info.textLen >= 300
  return { rendered, reason: rendered ? 'rendered' : 'blank/near-empty', info }
}
