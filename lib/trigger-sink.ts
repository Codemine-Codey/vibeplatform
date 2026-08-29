// Bridge between the (Vercel-agnostic) pipeline writer and the Trigger.dev Realtime
// stream. The Trigger task sets `sink` before running buildProject; makeStepWriter calls
// emitToTrigger(part) for every event, which mirrors it to the Realtime stream. Under the
// Vercel Workflow path `sink` is never set → emitToTrigger is a no-op. Kept as a plain
// function ref so build-pipeline.ts NEVER imports the Trigger SDK (which must not enter the
// Vercel/Next bundle). One build per task invocation (isolated process) → a module-level
// ref is safe (no cross-run bleed).
let sink: ((part: unknown) => void) | null = null

export function setTriggerSink(fn: ((part: unknown) => void) | null): void {
  sink = fn
}

export function emitToTrigger(part: unknown): void {
  if (sink) {
    try { sink(part) } catch { /* never let telemetry mirroring break a build */ }
  }
}
