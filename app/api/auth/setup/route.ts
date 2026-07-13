import { NextResponse } from 'next/server'
import { getProjectBySandboxId, updateProjectBySandboxId, currentUserOwnsSandbox } from '@/lib/projects-db'
import { getCurrentUser } from '@/lib/supabase/server'
import { getAdminSupabase } from '@/lib/supabase/server'
import { encryptSecret } from '@/lib/crypto/secrets'
import { neon } from '@neondatabase/serverless'
import { evictAuthInstance, BETTER_AUTH_MIGRATION_SQL } from '@/lib/better-auth-factory'

export const maxDuration = 60

// ── Path A: Better Auth on Neon (preferred) ──────────────────────────────────
// If the project already has a Neon DB provisioned, use Better Auth as the
// auth engine — no Cloudflare Worker needed. One shared proxy at
// /api/proxy/{projectId}/auth serves all user projects.

const PLATFORM_BASE =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ??
  'https://vibeplatform.vercel.app'

async function enableBetterAuth(projectId: string): Promise<{ authUrl: string }> {
  const sb = getAdminSupabase()

  // Get the Neon connection string
  const { data: neonRow } = await sb
    .from('project_secrets')
    .select('value_encrypted')
    .eq('project_id', projectId)
    .eq('name', 'NEON_DATABASE_URL')
    .single()

  if (!neonRow?.value_encrypted) {
    throw new Error('Database not provisioned. Add a database first, then enable auth.')
  }

  // Import here to avoid circular dep at module level
  const { decryptSecret } = await import('@/lib/crypto/secrets')
  const databaseUrl = decryptSecret(neonRow.value_encrypted as string)

  // Generate a per-project Better Auth secret (idempotent: skip if exists)
  const { data: existingSecret } = await sb
    .from('project_secrets')
    .select('value_encrypted')
    .eq('project_id', projectId)
    .eq('name', 'BETTER_AUTH_SECRET')
    .single()

  let authSecret: string
  if (existingSecret?.value_encrypted) {
    authSecret = decryptSecret(existingSecret.value_encrypted as string)
  } else {
    authSecret = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
    await sb.from('project_secrets').insert({
      project_id: projectId,
      name: 'BETTER_AUTH_SECRET',
      value_encrypted: encryptSecret(authSecret),
    })
  }

  // Run Better Auth migrations against the Neon DB (idempotent — IF NOT EXISTS)
  try {
    const sql = neon(databaseUrl)
    // Run each statement separately (neon tagged template doesn't support multi-statement)
    const statements = BETTER_AUTH_MIGRATION_SQL
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      await sql(stmt)
    }
  } catch (err) {
    console.error('[auth/setup] migration error:', err instanceof Error ? err.message : err)
    throw new Error('Failed to create auth tables. Check your database connection.')
  }

  // Evict any stale cached auth instance so the new secret takes effect
  evictAuthInstance(projectId)

  const authUrl = `${PLATFORM_BASE}/api/proxy/${projectId}/auth`
  return { authUrl }
}

// ── Path B: Legacy Cloudflare Worker (fallback if Neon not provisioned) ──────
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? ''
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? ''
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`
const AUTH_D1_ID = process.env.CM_AUTH_D1_ID ?? ''
const AUTH_WORKER_URL = process.env.CM_AUTH_WORKER_URL ?? ''

async function enableCFWorkerAuth(
  projectId: string,
  sandboxId: string
): Promise<{ authUrl: string; appId: string }> {
  if (!CF_API_TOKEN || !AUTH_D1_ID || !AUTH_WORKER_URL) {
    throw new Error(
      'Auth service not configured. Add a database to your project first to enable Better Auth.'
    )
  }
  const jwtSecret = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
  const res = await fetch(`${CF_BASE}/d1/database/${AUTH_D1_ID}/raw`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: 'INSERT OR IGNORE INTO auth_apps (app_id, jwt_secret, origins, created_at) VALUES (?,?,?,?)',
      params: [projectId, jwtSecret, '["*"]', new Date().toISOString()],
    }),
  })
  if (!res.ok) throw new Error('Failed to enable auth')
  void sandboxId // used only for row association above
  return { authUrl: AUTH_WORKER_URL, appId: projectId }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const { sandboxId } = (await req.json()) as { sandboxId?: string }
  if (!sandboxId) return NextResponse.json({ error: 'sandboxId required' }, { status: 400 })

  const caller = await getCurrentUser()
  if (!caller || !(await currentUserOwnsSandbox(sandboxId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const project = await getProjectBySandboxId(sandboxId)
  if (!project) {
    return NextResponse.json(
      { error: 'Sign in and save your project first, then enable auth.' },
      { status: 400 }
    )
  }

  const projectId = project.id

  try {
    if (project.neon_provisioned) {
      // ── Better Auth on Neon (preferred) ───────────────────────────────────
      const { authUrl } = await enableBetterAuth(projectId)
      await updateProjectBySandboxId(sandboxId, {
        auth_enabled: true,
        auth_worker_url: authUrl,
      }).catch(() => {})
      return NextResponse.json({ authUrl, appId: projectId, provider: 'better-auth' })
    } else {
      // ── Fallback: CF Worker ────────────────────────────────────────────────
      const { authUrl, appId } = await enableCFWorkerAuth(projectId, sandboxId)
      await updateProjectBySandboxId(sandboxId, {
        auth_enabled: true,
        auth_worker_url: authUrl,
      }).catch(() => {})
      return NextResponse.json({ authUrl, appId, provider: 'cf-worker' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Auth setup failed'
    console.error('[auth/setup] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
