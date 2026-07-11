// Server-side failure/repair telemetry.
//
// Every self-healing layer logs ONE structured line when it fires. This makes
// real-world error classes visible without users reporting them:
//
//   vercel logs <deployment> | grep cm-telemetry
//
// Format is a single JSON line with a stable prefix so it is trivially
// grep-able and machine-parseable. No external store, no latency, no PII.
export type RepairLayer =
  | 'css-sanity'        // Step 4.5 CSS fix before dev server
  | 'build-verify'      // Step 4.7 vite build + repair rounds
  | 'type-check'        // Step 4.8 filtered tsc contract-error gate
  | 'auto-install'      // missing-module install (any checkpoint)
  | 'dev-500'           // dev server returning 500 after start
  | 'runtime-check'     // headless browser DOM/console check
  | 'fallback-terminal' // P0-B terminal state: swapped a page to the baked __fallback
  | 'visual-verdict'    // vision model judged screenshot broken
  | 'checkpoint'        // snapshot saved / restored
  | 'deploy'            // CF Pages publish
  | 'phase-gate'        // STEP 2 progressive enrichment: phase build gate / rollback
  | 'silent-repair'     // client-triggered silent repair via /api/silent-repair

export function logRepair(event: {
  layer: RepairLayer
  action: string            // e.g. 'fired', 'repaired', 'installed', 'gave-up', 'restored'
  detail?: string           // short context — error class, package names, file paths
  sandboxId?: string
}): void {
  try {
    console.log(
      '[cm-telemetry]',
      JSON.stringify({
        ts: new Date().toISOString(),
        layer: event.layer,
        action: event.action,
        detail: (event.detail ?? '').slice(0, 400),
        sandboxId: event.sandboxId ?? null,
      })
    )
  } catch {
    /* telemetry must never break the pipeline */
  }
}

// ── Phase 1: per-model-call metrics ──────────────────────────────────────────
// One [cm-metrics] line per LLM call (logged centrally by the gateway middleware,
// so every call is covered without touching call sites). Reveals the real split
// between time-to-first-token, output-streaming time, and cache effectiveness:
//
//   vercel logs <deployment> | grep cm-metrics
//
// tokPerSec exposes the output-token wall (initial-gen cost); cacheHit verifies
// prompt caching is actually landing (and that Phase 4 history-trimming doesn't
// silently bust it).
export function logModelCall(event: {
  modelId: string
  kind: 'generate' | 'stream'
  ttftMs: number | null
  totalMs: number
  usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number }
}): void {
  try {
    const inTok = event.usage?.inputTokens ?? 0
    const outTok = event.usage?.outputTokens ?? 0
    const cachedTok = event.usage?.cachedInputTokens ?? 0
    const tokPerSec = outTok > 0 && event.totalMs > 0 ? Math.round(outTok / (event.totalMs / 1000)) : 0
    const cacheHit = inTok + cachedTok > 0 ? Number((cachedTok / (inTok + cachedTok)).toFixed(2)) : 0
    console.log(
      '[cm-metrics]',
      JSON.stringify({
        ts: new Date().toISOString(),
        model: event.modelId,
        kind: event.kind,
        ttftMs: event.ttftMs,
        totalMs: event.totalMs,
        inTok,
        outTok,
        cachedTok,
        tokPerSec,
        cacheHit,
      })
    )
  } catch {
    /* never break a generation for a log line */
  }
}

// ── Phase 3: patch-ratio tracking ────────────────────────────────────────────
// One [cm-patch] line per patchFile. patchRatio = replaced region ÷ file size.
// A ratio near 1.0 means the "diff" was really a whole-file rewrite — the silent
// regression that makes diff-only edits creep back into full-file output (slow +
// error-prone). Surfacing it makes that regression visible in the metrics.
export function logPatch(event: { path: string; patchRatio: number; rewrite: boolean }): void {
  try {
    console.log(
      '[cm-patch]',
      JSON.stringify({
        ts: new Date().toISOString(),
        path: event.path,
        patchRatio: Number(event.patchRatio.toFixed(2)),
        rewrite: event.rewrite,
      })
    )
  } catch {
    /* non-fatal */
  }
}

// ── Stage 6: design-quality score ────────────────────────────────────────────
// One [cm-design] line per generation — the vision model's 1-10 score of the
// rendered result (distinctiveness, hierarchy, contrast, polish) plus a one-line
// critique. Makes design quality measurable over time, so we can confirm the
// brief/token work actually lifted it before paying for a corrective loop.
export function logDesign(event: { score: number; note: string; sandboxId?: string }): void {
  try {
    console.log(
      '[cm-design]',
      JSON.stringify({
        ts: new Date().toISOString(),
        score: event.score,
        note: (event.note ?? '').slice(0, 240),
        sandboxId: event.sandboxId ?? null,
      })
    )
  } catch {
    /* non-fatal */
  }
}

// ── Phase 1: read round-trip tracking ────────────────────────────────────────
// One [cm-read] line per readFile / readFiles call. Aggregating these per turn
// (and computing p50/p90 of the count) tells us how often edits pay the serial-
// read tax — the data that sets the Phase 2 hard-cap threshold.
export function logRead(event: {
  kind: 'readFile' | 'readFiles'
  count: number            // files fetched in this call (1 for readFile, N for readFiles)
  sandboxId?: string
}): void {
  try {
    console.log(
      '[cm-read]',
      JSON.stringify({
        ts: new Date().toISOString(),
        kind: event.kind,
        count: event.count,
        sandboxId: event.sandboxId ?? null,
      })
    )
  } catch {
    /* non-fatal */
  }
}
