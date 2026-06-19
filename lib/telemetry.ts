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
  | 'auto-install'      // missing-module install (any checkpoint)
  | 'dev-500'           // dev server returning 500 after start
  | 'runtime-check'     // headless browser DOM/console check
  | 'visual-verdict'    // vision model judged screenshot broken
  | 'checkpoint'        // snapshot saved / restored
  | 'deploy'            // CF Pages publish

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
