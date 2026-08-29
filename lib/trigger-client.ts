import { configure } from '@trigger.dev/sdk/v3'
import type { BuildPipelineParams } from '@/app/workflows/build-pipeline'

// Triggering a task requires the project's ENVIRONMENT SECRET KEY (tr_prod_… / tr_dev_…),
// NOT the Personal Access Token (tr_pat_…, which is for deploy/management only). Using the
// PAT — or an unset var — makes buildTask.trigger() auth-fail silently → the task never
// fires → the build shows nothing. (If secretKey is omitted the SDK auto-reads
// process.env.TRIGGER_SECRET_KEY; we pass it explicitly to be unambiguous.)
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY ?? '',
})

/**
 * Trigger a build via Trigger.dev (used when CM_ORCHESTRATOR=worker).
 * Returns the run id + a publicAccessToken scoped to this run so the browser can subscribe
 * to the 'cm-ui' Realtime stream directly (no Vercel function in the path → no 740s cap).
 */
export async function triggerBuild(
  params: BuildPipelineParams
): Promise<{ id: string; publicAccessToken: string }> {
  // Dynamic import to avoid bundling trigger SDK into the main chunk
  const { buildTask } = await import('@/src/trigger/build-task')
  const handle = await buildTask.trigger(params)
  return { id: handle.id, publicAccessToken: handle.publicAccessToken }
}
