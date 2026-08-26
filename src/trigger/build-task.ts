import { task } from '@trigger.dev/sdk/v3'
import { buildProject, type BuildPipelineParams } from '@/app/workflows/build-pipeline'

/**
 * Durable build task — runs the exact same pipeline as the Vercel Workflow but
 * with no time cap. Sandboxes use getSandboxCredentials() (set CM_VERCEL_TOKEN,
 * CM_VERCEL_TEAM_ID, CM_VERCEL_PROJECT_ID in Trigger env vars). Streaming goes
 * entirely through Supabase run_events (getWritable() gracefully degrades to no-op).
 *
 * Enabled when CM_ORCHESTRATOR=worker in Vercel env vars.
 * Disable (revert) by setting CM_ORCHESTRATOR=vercel.
 */
export const buildTask = task({
  id: 'build-project',
  maxDuration: 3600,
  retry: { maxAttempts: 1 }, // NEVER retry — billing safety (retry-storm lesson)
  run: async (payload: BuildPipelineParams) => {
    await buildProject(payload)
    return { ok: true }
  },
})
