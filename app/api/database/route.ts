import { NextResponse } from 'next/server'
import { updateProjectBySandboxId, currentUserOwnsDatabase, currentUserOwnsSandbox } from '@/lib/projects-db'
import { getCurrentUser } from '@/lib/supabase/server'

const CF_API_TOKEN = process.env.CF_API_TOKEN
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID

function cfHeaders() {
  return { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' }
}

export async function POST(req: Request) {
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    console.error('[database] Missing CF_API_TOKEN or CF_ACCOUNT_ID')
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 })
  }

  const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`
  const body = await req.json() as { action: string; databaseName?: string; databaseId?: string; sql?: string; projectName?: string; sandboxId?: string }

  // AUTH GATE — every action requires a signed-in user, and any databaseId/sandboxId
  // must belong to a project THIS user owns (RLS-scoped). Without this, the route ran
  // arbitrary SQL on any tenant's D1 for anyone on the internet.
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((body.action === 'query' || body.action === 'tables')) {
    if (!body.databaseId || !(await currentUserOwnsDatabase(body.databaseId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }
  if (body.action === 'create' && body.sandboxId && !(await currentUserOwnsSandbox(body.sandboxId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (body.action === 'create') {
    const res = await fetch(`${CF_BASE}/d1/database`, {
      method: 'POST',
      headers: cfHeaders(),
      body: JSON.stringify({ name: body.databaseName }),
    })
    const raw = await res.text()
    let data: { success: boolean; result?: { uuid: string; name: string }; errors?: { message: string }[] }
    try { data = JSON.parse(raw) } catch { data = { success: false } }

    if (!data.success) {
      console.error('[database] create failed:', raw)
      const msg = data.errors?.[0]?.message ?? 'Failed to create database'
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    // Bind to Pages project if provided
    if (body.projectName && data.result) {
      const bindRes = await fetch(`${CF_BASE}/pages/projects/${body.projectName}`, {
        method: 'PATCH',
        headers: cfHeaders(),
        body: JSON.stringify({
          deployment_configs: {
            production: { d1_databases: { DB: { id: data.result.uuid } } },
            preview: { d1_databases: { DB: { id: data.result.uuid } } },
          },
        }),
      })
      if (!bindRes.ok) {
        console.warn('[database] bind to project failed:', await bindRes.text())
      }
    }

    // Persist DB state so the Cloud panel shows it instantly on reopen.
    if (body.sandboxId && data.result) {
      await updateProjectBySandboxId(body.sandboxId, {
        database_id: data.result.uuid,
        database_name: data.result.name,
      }).catch(() => {})
    }

    return NextResponse.json({ databaseId: data.result?.uuid, databaseName: data.result?.name })
  }

  if (body.action === 'query') {
    const res = await fetch(`${CF_BASE}/d1/database/${body.databaseId}/raw`, {
      method: 'POST',
      headers: cfHeaders(),
      body: JSON.stringify({ sql: body.sql, params: [] }),
    })
    const raw = await res.text()
    let data: { success: boolean; result?: Array<{ results: { columns: string[]; rows: unknown[][] } }>; errors?: { message: string }[] }
    try { data = JSON.parse(raw) } catch { data = { success: false } }

    if (!data.success) {
      console.error('[database] query failed:', raw)
      const msg = data.errors?.[0]?.message ?? 'Query failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    const result = data.result?.[0]?.results
    return NextResponse.json({ columns: result?.columns ?? [], rows: result?.rows ?? [] })
  }

  if (body.action === 'tables') {
    const res = await fetch(`${CF_BASE}/d1/database/${body.databaseId}/raw`, {
      method: 'POST',
      headers: cfHeaders(),
      body: JSON.stringify({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name", params: [] }),
    })
    const raw = await res.text()
    let data: { success: boolean; result?: Array<{ results: { columns: string[]; rows: unknown[][] } }>; errors?: { message: string }[] }
    try { data = JSON.parse(raw) } catch { data = { success: false } }

    if (!data.success) {
      console.error('[database] tables failed:', raw)
      return NextResponse.json({ error: 'Failed to list tables' }, { status: 500 })
    }
    const rows = data.result?.[0]?.results?.rows ?? []
    return NextResponse.json({ tables: rows.map(r => (r as string[])[0]) })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
