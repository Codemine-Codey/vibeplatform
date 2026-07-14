import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { currentUserOwnsProject } from '@/lib/projects-db'
import { getAdminSupabase } from '@/lib/supabase/server'
import { encryptSecret, decryptSecret } from '@/lib/crypto/secrets'
import { neon } from '@neondatabase/serverless'

// ── Env vars ──────────────────────────────────────────────────────────────────
const NEON_API_KEY = process.env.NEON_API_KEY
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? ''

function cfPagesProjectName(sandboxId: string) {
  return 'cm-' + sandboxId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)
}

// ── Auth helper ───────────────────────────────────────────────────────────────
async function authAndOwns(projectId: string): Promise<{ userId: string } | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const owns = await currentUserOwnsProject(projectId, user.id)
  if (!owns) return null
  return { userId: user.id }
}

// ── Secret helpers ────────────────────────────────────────────────────────────
async function storeNeonSecret(projectId: string, connectionString: string): Promise<void> {
  const sb = getAdminSupabase()
  await sb.from('project_secrets').upsert(
    { project_id: projectId, name: 'NEON_DATABASE_URL', value_encrypted: encryptSecret(connectionString) },
    { onConflict: 'project_id,name' }
  )
}

async function getNeonSecret(projectId: string): Promise<string | null> {
  const sb = getAdminSupabase()
  const { data } = await sb
    .from('project_secrets')
    .select('value_encrypted')
    .eq('project_id', projectId)
    .eq('name', 'NEON_DATABASE_URL')
    .single()
  if (!data?.value_encrypted) return null
  try {
    return decryptSecret(data.value_encrypted as string)
  } catch {
    return null
  }
}

// ── CF Pages — inject DATABASE_URL as a secret env var ───────────────────────
async function injectCFDatabaseUrl(sandboxId: string, connectionString: string): Promise<void> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !sandboxId) return
  const projectName = cfPagesProjectName(sandboxId)
  try {
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployment_configs: {
            production: {
              env_vars: {
                DATABASE_URL: { type: 'secret_text', value: connectionString },
              },
            },
          },
        }),
      }
    )
  } catch {
    // Non-fatal — project may not be deployed to CF Pages yet
  }
}

// ── Neon API response types ───────────────────────────────────────────────────
interface NeonProjectResponse {
  project: {
    id: string
  }
  connection_uris: Array<{ connection_uri: string }>
  databases: Array<{ name: string }>
  endpoints: Array<{ host: string }>
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const body = await req.json() as {
    action: 'provision' | 'tables' | 'query' | 'status'
    projectId?: string
    sql?: string
  }
  const { action, projectId } = body

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  const auth = await authAndOwns(projectId)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── provision ────────────────────────────────────────────────────────────────
  if (action === 'provision') {
    if (!NEON_API_KEY) {
      return NextResponse.json(
        { error: 'The database service isn\'t set up yet. Please try again shortly.' },
        { status: 503 }
      )
    }

    const sb = getAdminSupabase()

    // Check if already provisioned
    const { data: proj } = await sb
      .from('projects')
      .select('neon_provisioned, neon_host, neon_database_name, neon_project_id, sandbox_id')
      .eq('id', projectId)
      .single()

    if (proj?.neon_provisioned) {
      return NextResponse.json({
        ok: true,
        host: proj.neon_host,
        databaseName: proj.neon_database_name,
        neonProjectId: proj.neon_project_id,
        alreadyProvisioned: true,
      })
    }

    // Create Neon project
    const neonRes = await fetch('https://console.neon.tech/api/v2/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NEON_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project: {
          name: `cm-${projectId.slice(0, 20)}`,
          pg_version: 16,
          // Neon now REQUIRES org_id to create a project (API keys are org-scoped).
          // Without it the API returns 400 "org_id is required".
          ...(process.env.NEON_ORG_ID ? { org_id: process.env.NEON_ORG_ID } : {}),
        },
      }),
    })

    if (!neonRes.ok) {
      const errText = await neonRes.text()
      console.error('[neon] provision failed:', neonRes.status, errText)
      // Surface the real cause in plain English (never the vendor name).
      const lower = errText.toLowerCase()
      let userMsg = 'Couldn\'t set up your database right now. Please try again in a moment.'
      if (/limit|exceeded|quota|maximum|too many/.test(lower)) {
        userMsg = 'You\'ve reached the database limit for your plan. Delete an unused project\'s database, then try again.'
      } else if (neonRes.status === 401 || neonRes.status === 403) {
        userMsg = 'The database service rejected the request. Please try again shortly.'
      }
      return NextResponse.json({ error: userMsg }, { status: 502 })
    }

    const neonData = (await neonRes.json()) as NeonProjectResponse
    const neonProjectId = neonData.project?.id
    const connectionUri = neonData.connection_uris?.[0]?.connection_uri
    const databaseName = neonData.databases?.[0]?.name ?? 'neondb'
    const host = neonData.endpoints?.[0]?.host ?? ''

    if (!neonProjectId || !connectionUri) {
      return NextResponse.json({ error: 'Neon API returned an unexpected response.' }, { status: 502 })
    }

    // Encrypt and store connection string
    await storeNeonSecret(projectId, connectionUri)

    // Update projects row
    await sb.from('projects').update({
      neon_project_id: neonProjectId,
      neon_database_name: databaseName,
      neon_host: host,
      neon_provisioned: true,
    }).eq('id', projectId)

    // Inject DATABASE_URL into CF Pages (non-fatal)
    if (proj?.sandbox_id) {
      await injectCFDatabaseUrl(proj.sandbox_id as string, connectionUri)
    }

    return NextResponse.json({ ok: true, host, databaseName, neonProjectId })
  }

  // ── tables ───────────────────────────────────────────────────────────────────
  if (action === 'tables') {
    const connectionString = await getNeonSecret(projectId)
    if (!connectionString) {
      return NextResponse.json({ error: 'Database not provisioned or connection string missing.' }, { status: 400 })
    }

    try {
      const sql = neon(connectionString)
      const rows = await sql`
        SELECT table_name, pg_total_relation_size(quote_ident(table_name)::regclass) as size_bytes
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `
      const tables = (rows as Array<{ table_name: string }>).map((r) => ({
        name: r.table_name,
        rowCount: null as null | number,
      }))
      return NextResponse.json({ tables })
    } catch (err) {
      console.error('[neon] tables query failed:', err)
      return NextResponse.json({ error: 'Failed to list tables.' }, { status: 500 })
    }
  }

  // ── query ────────────────────────────────────────────────────────────────────
  if (action === 'query') {
    const rawSql = (body.sql ?? '').trim()
    if (!rawSql.toLowerCase().startsWith('select')) {
      return NextResponse.json({ error: 'Only SELECT statements are allowed in the query browser.' }, { status: 400 })
    }

    const connectionString = await getNeonSecret(projectId)
    if (!connectionString) {
      return NextResponse.json({ error: 'Database not provisioned or connection string missing.' }, { status: 400 })
    }

    try {
      const sql = neon(connectionString)
      // Append LIMIT to prevent runaway result sets. Only SELECT is allowed (validated above).
      const limitedSql = rawSql.replace(/;?\s*$/, ' LIMIT 100')
      // Use sql(queryString, params, opts) call form (not tagged template) for dynamic SQL.
      // fullResults: true returns { fields, rows } so we can extract column names.
      const result = await sql(limitedSql, [], { fullResults: true })
      const columns: string[] = (result.fields ?? []).map((f: { name: string }) => f.name)
      const rows: unknown[][] = (result.rows as Record<string, unknown>[]).map((row) =>
        columns.map((col) => row[col] ?? null)
      )
      return NextResponse.json({ columns, rows })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Query failed'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  // ── status ───────────────────────────────────────────────────────────────────
  if (action === 'status') {
    const sb = getAdminSupabase()
    const { data: proj } = await sb
      .from('projects')
      .select('neon_provisioned, neon_host, neon_database_name, neon_project_id')
      .eq('id', projectId)
      .single()

    return NextResponse.json({
      provisioned: !!proj?.neon_provisioned,
      host: proj?.neon_host ?? null,
      databaseName: proj?.neon_database_name ?? null,
      neonProjectId: proj?.neon_project_id ?? null,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
