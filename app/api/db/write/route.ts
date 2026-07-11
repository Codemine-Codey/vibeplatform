import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase/server'

const CF_API_TOKEN = process.env.CF_API_TOKEN
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID

// CORS headers — user app previews run on dynamic sandbox origins, so we allow all.
// The only "auth" here is the projectId, which is a UUID that's only exposed to the
// project owner inside Codemine. Row-level: we validate projectId has a real D1 DB.
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

export async function POST(req: Request) {
  const headers = corsHeaders()

  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500, headers })
  }

  let body: { projectId?: string; table?: string; data?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers })
  }

  const { projectId, table, data } = body
  if (!projectId || !table || !data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Missing projectId, table, or data' }, { status: 400, headers })
  }

  // Validate table name to prevent SQL injection (alphanumeric + underscore only)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    return NextResponse.json({ error: 'Invalid table name' }, { status: 400, headers })
  }

  // Look up the database_id for this project using the admin client.
  // No user session needed — projectId is an unguessable UUID that the project owner
  // injects into their app via VITE_PROJECT_ID env var.
  const sb = getAdminSupabase()
  const { data: project, error: projectErr } = await sb
    .from('projects')
    .select('database_id')
    .eq('id', projectId)
    .single()

  if (projectErr || !project?.database_id) {
    return NextResponse.json({ error: 'Project not found or no database configured' }, { status: 404, headers })
  }

  const databaseId = project.database_id as string
  const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`

  // Build parameterized INSERT
  const columns = Object.keys(data)
  const values = Object.values(data)

  if (columns.length === 0) {
    return NextResponse.json({ error: 'No data fields provided' }, { status: 400, headers })
  }

  // Validate column names
  for (const col of columns) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
      return NextResponse.json({ error: `Invalid column name: ${col}` }, { status: 400, headers })
    }
  }

  const placeholders = columns.map(() => '?').join(', ')
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`

  const res = await fetch(`${CF_BASE}/d1/database/${databaseId}/raw`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params: values }),
  })

  const raw = await res.text()
  let cfData: { success: boolean; errors?: { message: string }[] }
  try { cfData = JSON.parse(raw) } catch { cfData = { success: false } }

  if (!cfData.success) {
    const msg = cfData.errors?.[0]?.message ?? 'Write failed'
    console.error('[db/write] D1 error:', msg)
    // Surface a user-friendly message — never expose DB internals
    if (msg.includes('no such table')) {
      return NextResponse.json({ error: `Table "${table}" does not exist. Ask your AI to set up the database first.` }, { status: 400, headers })
    }
    return NextResponse.json({ error: 'Could not save your data. Please try again.' }, { status: 500, headers })
  }

  return NextResponse.json({ ok: true }, { headers })
}
