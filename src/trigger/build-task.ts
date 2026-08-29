import { task } from '@trigger.dev/sdk'
import type { BuildPipelineParams } from '@/app/workflows/build-pipeline'
import { setTriggerSink } from '@/lib/trigger-sink'
import { uiStream } from './streams'

/**
 * Durable build task — runs the exact same pipeline as the Vercel Workflow but with no time
 * cap (maxDuration 3600 = 1 hour). Progress streams to the browser via the Trigger Realtime
 * stream 'cm-ui' AND is written to Supabase run_events (durable fallback the client polls).
 *
 * Enabled when CM_ORCHESTRATOR=worker in Vercel env vars; revert with =vercel.
 */

// Self-report to Supabase run_events via a RAW REST call — deliberately bypasses
// getAdminSupabase()/lib so a failure in THAT layer (the exact class of bug we're chasing)
// can still surface where we can read it. Never throws.
async function diag(runId: string | null, text: string): Promise<void> {
  if (!runId) return
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    await fetch(`${url}/rest/v1/run_events`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ run_id: runId, type: 'data-diag', payload: { type: 'data-diag', data: { text } } }),
    }).catch(() => {})
  } catch { /* diag must never throw */ }
}

export const buildTask = task({
  id: 'build-project',
  maxDuration: 3600,
  retry: { maxAttempts: 1 }, // NEVER retry — billing safety
  run: async (payload: BuildPipelineParams) => {
    const runId = payload.runId
    await diag(runId, 'TASK ENTERED run()')
    try {
      await diag(runId, 'importing buildProject…')
      const { buildProject } = await import('@/app/workflows/build-pipeline')
      await diag(runId, 'buildProject IMPORTED ok — starting')

      let chain: Promise<unknown> = Promise.resolve()
      setTriggerSink((part) => {
        chain = chain.then(() => uiStream.append(part as never)).catch(() => {})
      })
      try {
        await buildProject(payload)
      } finally {
        setTriggerSink(null)
        await chain.catch(() => {})
      }
      await diag(runId, 'buildProject RETURNED ok')
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${(e.stack || '').slice(0, 400)}` : String(e)
      await diag(runId, `TASK ERROR: ${msg.slice(0, 600)}`)
      throw e
    }
  },
})
