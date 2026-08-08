import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { updateProjectBySandboxId, currentUserOwnsDatabase, currentUserOwnsSandbox } from '@/lib/projects-db'
import { getCurrentUser } from '@/lib/supabase/server'

const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL

export async function POST(req: Request) {
  if (!NEON_DATABASE_URL) {
    console.error('[database] Missing NEON_DATABASE_URL')
    return NextResponse.json({ error: 'Database service not configured' }, { status: 500 })
  }

  const body = await req.json() as { action: string; databaseName?: string; databaseId?: string; sql?: string; projectName?: string; sandboxId?: string }

  // AUTH GATE — every action requires a signed-in user, and any databaseId/sandboxId
  // must belong to a project this user owns.
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

  const sql = neon(NEON_DATABASE_URL)

  if (body.action === 'create') {
    // Create action is handled by the createDatabase AI tool.
    // This route only supports the UI panel for query/tables.
    // If called directly, provision a schema.
    const name = (body.databaseName ?? 'db').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 18)
    const schemaName = `cm_${name}_${Date.now().toString(36)}`

    try {
      await sql(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create database'
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    if (body.sandboxId) {
      await updateProjectBySandboxId(body.sandboxId, {
        database_id: schemaName,
        database_name: body.databaseName ?? schemaName,
      }).catch(() => {})
    }

    return NextResponse.json({ databaseId: schemaName, databaseName: body.databaseName ?? schemaName })
  }

  if (body.action === 'query') {
    const schemaName = body.databaseId!
    if (!/^cm_[a-z0-9_]+$/.test(schemaName)) {
      return NextResponse.json({ error: 'Invalid database reference' }, { status: 400 })
    }

    // Validate SQL is a SELECT (read-only from panel)
    const trimmed = (body.sql ?? '').trim().toUpperCase()
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      return NextResponse.json({ error: 'Only SELECT queries are allowed from the panel' }, { status: 400 })
    }

    try {
      // The Neon HTTP driver uses Postgres's extended protocol, which rejects two
      // statements in one call (`SET ...; SELECT ...` → "syntax error at or near LIMIT").
      // Run the search_path set and the user SELECT as a single transaction over ONE
      // connection instead, so the schema applies to the SELECT. schemaName is regex-
      // validated above (^cm_[a-z0-9_]+$), so interpolating it into SET is safe (SET
      // cannot parameterize an identifier).
      const results = await sql.transaction([
        sql(`SET search_path TO "${schemaName}"`),
        sql(body.sql!),
      ])
      const rows = (results[results.length - 1] ?? []) as Record<string, unknown>[]
      if (rows.length === 0) return NextResponse.json({ columns: [], rows: [] })
      const columns = Object.keys(rows[0])
      const data = rows.map(r => columns.map(c => r[c]))
      return NextResponse.json({ columns, rows: data })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Query failed'
      console.error('[database] query failed:', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  if (body.action === 'tables') {
    const schemaName = body.databaseId!
    if (!/^cm_[a-z0-9_]+$/.test(schemaName)) {
      return NextResponse.json({ error: 'Invalid database reference' }, { status: 400 })
    }

    try {
      const rows = await sql(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
        [schemaName]
      )
      return NextResponse.json({ tables: rows.map(r => r.table_name) })
    } catch (err) {
      console.error('[database] tables failed:', err)
      return NextResponse.json({ error: 'Failed to list tables' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
