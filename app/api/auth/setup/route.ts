import { NextResponse } from 'next/server'
import { getProjectBySandboxId, updateProjectBySandboxId, currentUserOwnsSandbox } from '@/lib/projects-db'
import { getCurrentUser } from '@/lib/supabase/server'

export const maxDuration = 30

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? ''
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? ''
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`
const AUTH_D1_ID = process.env.CM_AUTH_D1_ID ?? ''
const AUTH_WORKER_URL = process.env.CM_AUTH_WORKER_URL ?? ''

// ── Enable auth = REGISTER the project on the shared multi-tenant auth worker ──
// No per-project worker deploy anymore. We insert one row into the shared auth_apps
// table (app_id = the stable project id, plus a unique per-app JWT secret). All
// isolation is enforced in the worker: per-app secret, every query scoped by app_id,
// JWT aud=appId check. One worker serves every app; nothing can leak across apps.
export async function POST(req: Request) {
  const { sandboxId } = (await req.json()) as { sandboxId?: string }
  if (!sandboxId) return NextResponse.json({ error: 'sandboxId required' }, { status: 400 })
  // AUTH + OWNERSHIP — only the owner may enable auth on their own project.
  const caller = await getCurrentUser()
  if (!caller || !(await currentUserOwnsSandbox(sandboxId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!CF_API_TOKEN || !AUTH_D1_ID || !AUTH_WORKER_URL) {
    return NextResponse.json({ error: 'Auth service not configured' }, { status: 500 })
  }

  // Stable appId = the project id — survives sandbox restarts, so logins keep working
  // across reopens. Auth therefore requires a saved (signed-in) project.
  const project = await getProjectBySandboxId(sandboxId)
  if (!project) {
    return NextResponse.json({ error: 'Sign in and let your project save first, then enable auth.' }, { status: 400 })
  }
  const appId = project.id

  // Unique per-app secret → a token minted for one app can NEVER verify on another.
  const jwtSecret = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')

  // Idempotent: INSERT OR IGNORE keeps an existing app's secret on re-setup so live
  // user sessions don't break.
  const res = await fetch(`${CF_BASE}/d1/database/${AUTH_D1_ID}/raw`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: 'INSERT OR IGNORE INTO auth_apps (app_id, jwt_secret, origins, created_at) VALUES (?,?,?,?)',
      params: [appId, jwtSecret, '["*"]', new Date().toISOString()],
    }),
  })
  if (!res.ok) {
    console.error('[auth/setup] register failed:', (await res.text()).slice(0, 200))
    return NextResponse.json({ error: 'Failed to enable auth' }, { status: 500 })
  }

  // Persist so the Cloud panel shows auth instantly on reopen.
  await updateProjectBySandboxId(sandboxId, { auth_enabled: true, auth_worker_url: AUTH_WORKER_URL }).catch(() => {})

  // The generated app calls: `${authUrl}/${appId}/(signup|login|me)`.
  return NextResponse.json({ authUrl: AUTH_WORKER_URL, appId, workerUrl: AUTH_WORKER_URL })
}
