import { configure } from '@trigger.dev/sdk/v3'
import type { BuildPipelineParams } from '@/app/workflows/build-pipeline'

configure({
  secretKey: process.env.TRIGGER_ACCESS_TOKEN ?? '',
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
