import { NextResponse } from 'next/server'

const CF_API_TOKEN = process.env.CF_API_TOKEN!
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID!

const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`
const headers = () => ({ Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' })

export async function POST(req: Request) {
  const body = await req.json() as { action: string; databaseName?: string; databaseId?: string; sql?: string; projectName?: string }

  if (body.action === 'create') {
    const res = await fetch(`${CF_BASE}/d1/database`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name: body.databaseName }),
    })
    const data = await res.json() as { success: boolean; result?: { uuid: string; name: string } }
    if (!data.success) return NextResponse.json({ error: 'Failed to create database' }, { status: 500 })

    // Bind database to Pages project if projectName provided
    if (body.projectName && data.result) {
      await fetch(`${CF_BASE}/pages/projects/${body.projectName}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({
          deployment_configs: {
            production: { d1_databases: { DB: { id: data.result.uuid } } },
            preview: { d1_databases: { DB: { id: data.result.uuid } } },
          },
        }),
      })
    }

    return NextResponse.json({ databaseId: data.result?.uuid, databaseName: data.result?.name })
  }

  if (body.action === 'query') {
    const res = await fetch(`${CF_BASE}/d1/database/${body.databaseId}/raw`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ sql: body.sql, params: [] }),
    })
    const data = await res.json() as { success: boolean; result?: Array<{ results: { columns: string[]; rows: unknown[][] } }> }
    if (!data.success) return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    const result = data.result?.[0]?.results
    return NextResponse.json({ columns: result?.columns ?? [], rows: result?.rows ?? [] })
  }

  if (body.action === 'tables') {
    const res = await fetch(`${CF_BASE}/d1/database/${body.databaseId}/raw`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name", params: [] }),
    })
    const data = await res.json() as { success: boolean; result?: Array<{ results: { columns: string[]; rows: unknown[][] } }> }
    if (!data.success) return NextResponse.json({ error: 'Failed to list tables' }, { status: 500 })
    const rows = data.result?.[0]?.results?.rows ?? []
    return NextResponse.json({ tables: rows.map(r => (r as string[])[0]) })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
