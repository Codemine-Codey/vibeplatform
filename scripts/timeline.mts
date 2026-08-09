// Query event timeline for a build run to understand time breakdown
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)

const runId = process.argv[2]
if (!runId) { console.error('Usage: npx tsx scripts/timeline.mts <run-id>'); process.exit(1) }

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: run } = await admin.from('runs').select('id,status,created_at,updated_at,time_to_preview_ms,total_time_ms,tokens_used').eq('id', runId).single()
console.log('Run:', JSON.stringify(run, null, 2))

const { data: evts, error } = await admin
  .from('run_events')
  .select('type,payload,created_at,seq')
  .eq('run_id', runId)
  .order('seq', { ascending: true })
  .limit(200)

if (error) { console.error('Error:', error.message); process.exit(1) }
if (!evts?.length) { console.log('No events found'); process.exit(0) }

const t0 = new Date(evts[0].created_at).getTime()
console.log(`\nTimeline (${evts.length} events, t0=${new Date(t0).toISOString()}):`)
for (const e of evts) {
  const dt = Math.round((new Date(e.created_at).getTime() - t0) / 1000)
  const p = e.payload as { data?: { status?: string; command?: string; url?: string; text?: string } }
  const status = p?.data?.status || ''
  const cmd = p?.data?.command || ''
  const url = p?.data?.url ? '→ ' + p.data.url.slice(0, 40) : ''
  const text = p?.data?.text ? '"' + p.data.text.slice(0, 50) + '"' : ''
  console.log(`  ${String(dt).padStart(4)}s  ${e.type.padEnd(30)} ${cmd || text || url} ${status}`)
}
