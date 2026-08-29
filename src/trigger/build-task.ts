import { task } from '@trigger.dev/sdk'
import { buildProject, type BuildPipelineParams } from '@/app/workflows/build-pipeline'
import { setTriggerSink } from '@/lib/trigger-sink'
import { uiStream } from './streams'

/**
 * Durable build task — runs the exact same pipeline as the Vercel Workflow but with no time
 * cap (maxDuration 3600 = 1 hour). Progress is streamed to the browser via the Trigger
 * Realtime stream 'cm-ui' (browser ↔ Trigger direct — no Vercel 740s cap, no reconnection).
 * Events are ALSO written to Supabase run_events (makeStepWriter) as the durable fallback the
 * client polls via /api/runs/[id]/events if a Realtime connection ever drops.
 *
 * Enabled when CM_ORCHESTRATOR=worker in Vercel env vars; revert with =vercel.
 * Sandbox auth uses CM_VERCEL_TOKEN / CM_VERCEL_TEAM_ID / CM_VERCEL_PROJECT_ID (Trigger env).
 */
export const buildTask = task({
  id: 'build-project',
  maxDuration: 3600,
  retry: { maxAttempts: 1 }, // NEVER retry — billing safety (retry-storm lesson)
  run: async (payload: BuildPipelineParams) => {
    // Serialize appends so the Realtime stream preserves emission order (append is async);
    // fire-and-chain so writer.write() never blocks the build on network I/O.
    let chain: Promise<unknown> = Promise.resolve()
    setTriggerSink((part) => {
      chain = chain.then(() => uiStream.append(part as never)).catch(() => {})
    })
    try {
      await buildProject(payload)
    } finally {
      setTriggerSink(null)
      await chain.catch(() => {}) // flush any pending appends before the task ends
    }
    return { ok: true }
  },
})
