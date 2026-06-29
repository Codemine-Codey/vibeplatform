import { NextResponse } from 'next/server'
import { getProject } from '@/lib/projects-db'

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? ''
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? ''
const AUTH_D1_ID = process.env.CM_AUTH_D1_ID ?? ''

// List an app's users — server-side ONLY, double-scoped: (1) RLS-verify the caller
// OWNS the project (getProject), then (2) query the shared D1 with WHERE app_id = ?.
// Never a public endpoint; one app can never read another's users.
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  if (!CF_API_TOKEN || !AUTH_D1_ID) return NextResponse.json({ users: [] })

  // Ownership gate (RLS) — only the project's owner can list its users.
  const project = await getProject(projectId)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${AUTH_D1_ID}/raw`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: 'SELECT id, email, created_at FROM users WHERE app_id = ? ORDER BY created_at DESC LIMIT 200',
        params: [projectId],
      }),
    })
    const data = (await res.json()) as { result?: Array<{ results?: { columns: string[]; rows: unknown[][] } }> }
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
