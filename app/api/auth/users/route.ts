import { NextResponse } from 'next/server'
import { getProject } from '@/lib/projects-db'
import { getAdminSupabase } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/crypto/secrets'
import { neon } from '@neondatabase/serverless'

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? ''
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? ''
const AUTH_D1_ID = process.env.CM_AUTH_D1_ID ?? ''

// List an app's users — server-side ONLY, double-scoped: (1) RLS-verify the caller
// OWNS the project (getProject), then (2) query the DB scoped by project.
// Path A: Better Auth on Neon → query the "user" table.
// Path B: CF Worker → query the shared D1 auth_users table.
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  // Ownership gate (RLS) — only the project's owner can list its users.
  const project = await getProject(projectId)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Path A: Better Auth on Neon ────────────────────────────────────────────
  if (project.neon_provisioned && project.auth_enabled) {
    try {
      const sb = getAdminSupabase()
      const { data: neonRow } = await sb
        .from('project_secrets')
        .select('value_encrypted')
        .eq('project_id', projectId)
        .eq('name', 'NEON_DATABASE_URL')
        .single()

      if (neonRow?.value_encrypted) {
        const databaseUrl = decryptSecret(neonRow.value_encrypted as string)
        const sql = neon(databaseUrl)
        const rows = await sql`
          SELECT id, name, email, "createdAt" as created_at
          FROM "user"
          ORDER BY "createdAt" DESC
          LIMIT 200
        `
        const users = (rows as Array<{ id: string; name: string; email: string; created_at: string }>).map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          created_at: new Date(r.created_at).getTime(),
        }))
        return NextResponse.json({ users })
      }
    } catch (err) {
      console.warn('[auth/users] Neon query failed:', err instanceof Error ? err.message : err)
    }
    return NextResponse.json({ users: [] })
  }

  // ── Path B: Legacy CF Worker ────────────────────────────────────────────────
  if (!CF_API_TOKEN || !AUTH_D1_ID) return NextResponse.json({ users: [] })

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${AUTH_D1_ID}/raw`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: 'SELECT id, email, created_at FROM users WHERE app_id = ? ORDER BY created_at DESC LIMIT 200',
          params: [projectId],
        }),
      }
    )
    const data = (await res.json()) as {
      result?: Array<{ results?: { columns: string[]; rows: unknown[][] } }>
    }
    const r = data.result?.[0]?.results
    if (!r) return NextResponse.json({ users: [] })
    const users = r.rows.map((row) => {
      const o: Record<string, unknown> = {}
      r.columns.forEach((c, i) => (o[c] = row[i]))
      return o
    })
    return NextResponse.json({ users })
  } catch {
    return NextResponse.json({ users: [] })
  }
}
