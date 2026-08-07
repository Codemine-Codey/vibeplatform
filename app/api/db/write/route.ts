import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { getAdminSupabase } from '@/lib/supabase/server'

const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL

// CORS headers — user app previews run on dynamic sandbox origins.
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

  if (!NEON_DATABASE_URL) {
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

  // Validate table name to prevent SQL injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    return NextResponse.json({ error: 'Invalid table name' }, { status: 400, headers })
  }

  // Look up the schema name (stored in database_id) for this project
  const sb = getAdminSupabase()
  const { data: project, error: projectErr } = await sb
    .from('projects')
    .select('database_id')
    .eq('id', projectId)
    .single()

  if (projectErr || !project?.database_id) {
    return NextResponse.json({ error: 'Project not found or no database configured' }, { status: 404, headers })
  }

  const schemaName = project.database_id as string

  // Validate schema name — must be a cm_ prefixed identifier we created
  if (!/^cm_[a-z0-9_]+$/.test(schemaName)) {
    return NextResponse.json({ error: 'Invalid database configuration' }, { status: 500, headers })
  }

  // Validate column names
  const columns = Object.keys(data)
  const values = Object.values(data)
  if (columns.length === 0) {
    return NextResponse.json({ error: 'No data fields provided' }, { status: 400, headers })
  }
  for (const col of columns) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
      return NextResponse.json({ error: `Invalid column name: ${col}` }, { status: 400, headers })
    }
  }

  try {
    const sql = neon(NEON_DATABASE_URL)

    // Use parameterized query with schema-qualified table name
    // Column names validated above, so safe to interpolate
    const colList = columns.join(', ')
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    const query = `INSERT INTO "${schemaName}"."${table}" (${colList}) VALUES (${placeholders})`

    await sql(query, values)

    return NextResponse.json({ ok: true }, { headers })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Write failed'
    console.error('[db/write] Neon error:', msg)
    if (msg.includes('does not exist')) {
      return NextResponse.json({ error: `Table "${table}" does not exist. Ask your AI to set up the database first.` }, { status: 400, headers })
    }
    return NextResponse.json({ error: 'Could not save your data. Please try again.' }, { status: 500, headers })
  }
}
