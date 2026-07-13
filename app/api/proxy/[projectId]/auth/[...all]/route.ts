/**
 * Better Auth shared proxy — one endpoint serves auth for every user project.
 * Path: /api/proxy/{projectId}/auth/[...anything]
 *
 * User apps (Vite SPAs on Cloudflare Pages) call this proxy.
 * Better Auth uses the project's Neon DB + per-project secret.
 * Bearer plugin is ON so cross-origin SPAs can use Authorization headers.
 */
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/crypto/secrets'
import { getAuthInstance } from '@/lib/better-auth-factory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

async function getProjectAuth(projectId: string) {
  const sb = getAdminSupabase()

  // Verify auth is enabled for this project
  const { data: proj } = await sb
    .from('projects')
    .select('auth_enabled, neon_provisioned')
    .eq('id', projectId)
    .single()

  if (!proj?.auth_enabled || !proj?.neon_provisioned) return null

  // Get Neon connection string
  const { data: neonSecret } = await sb
    .from('project_secrets')
    .select('value_encrypted')
    .eq('project_id', projectId)
    .eq('name', 'NEON_DATABASE_URL')
    .single()

  if (!neonSecret?.value_encrypted) return null
  const databaseUrl = decryptSecret(neonSecret.value_encrypted as string)

  // Get per-project Better Auth secret
  const { data: authSecret } = await sb
    .from('project_secrets')
    .select('value_encrypted')
    .eq('project_id', projectId)
    .eq('name', 'BETTER_AUTH_SECRET')
    .single()

  const secret = authSecret?.value_encrypted
    ? decryptSecret(authSecret.value_encrypted as string)
    : (process.env.BETTER_AUTH_SECRET ?? 'fallback-secret-change-me-in-prod')

  return getAuthInstance(projectId, databaseUrl, secret)
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const auth = await getProjectAuth(projectId)
  if (!auth) {
    return NextResponse.json({ error: 'Auth not enabled for this project' }, {
      status: 404,
      headers: CORS_HEADERS,
    })
  }
  const res = await auth.handler(request)
  // Inject CORS headers onto Better Auth's response
  const headers = new Headers(res.headers)
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v))
  return new Response(res.body, { status: res.status, headers })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const auth = await getProjectAuth(projectId)
  if (!auth) {
    return NextResponse.json({ error: 'Auth not enabled for this project' }, {
      status: 404,
      headers: CORS_HEADERS,
    })
  }
  const res = await auth.handler(request)
  const headers = new Headers(res.headers)
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v))
  return new Response(res.body, { status: res.status, headers })
}
