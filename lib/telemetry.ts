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
