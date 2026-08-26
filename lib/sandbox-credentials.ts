/**
 * Returns explicit Vercel Sandbox credentials when running outside Vercel (e.g. Trigger.dev).
 * In Vercel functions VERCEL_OIDC_TOKEN is auto-injected and these vars are NOT set,
 * so spreading {} falls back to OIDC auth as before.
 * In Trigger: set CM_VERCEL_TOKEN, CM_VERCEL_TEAM_ID, CM_VERCEL_PROJECT_ID in Trigger env vars.
 */
export function getSandboxCredentials(): { token?: string; teamId?: string; projectId?: string } {
  const token = process.env.CM_VERCEL_TOKEN
  const teamId = process.env.CM_VERCEL_TEAM_ID
  const projectId = process.env.CM_VERCEL_PROJECT_ID
  if (token && teamId && projectId) return { token, teamId, projectId }
  return {}
}
