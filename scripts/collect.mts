// Harvest reliability metrics for a run from the CANONICAL server-side log (run row +
// run_events). Immune to client stream drops — first-preview is derived from the actual
// data-get-sandbox-url event timestamp, total from the run row. Proves walk-away: the
// build completes server-side regardless of whether any client stayed connected.
//   npx tsx scripts/collect.mts <runId|latest> [label]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const [arg = 'latest', label = 'run'] = process.argv.slice(2)
function fmt(ms: number | null): string { if (ms == null) return 'n/a'; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s (${s}s)` }

let runId = arg
if (arg === 'latest') {
  const { data } = await admin.from('runs').select('id').order('created_at', { ascending: false }).limit(1)
  runId = data?.[0]?.id
}
console.log(`collecting run ${runId} (${label})…`)

let run: Record<string, unknown> | null = null
const start = Date.now()
while (Date.now() - start < 20 * 60_000) {
  const { data } = await admin.from('runs').select('*').eq('id', runId).single()
  run = data as Record<string, unknown>
  if (run?.status === 'done' || run?.status === 'error') break
  process.stdout.write('.')
  await new Promise(r => setTimeout(r, 5000))
}
console.log('')
if (!run) { console.log('run not found'); process.exit(1) }

const { data: evs } = await admin.from('run_events').select('type,payload,created_at,seq').eq('run_id', runId).order('seq', { ascending: true }).limit(8000)
const events = evs ?? []
const createdMs = new Date(run.created_at as string).getTime()
const updatedMs = new Date(run.updated_at as string).getTime()

// First preview = first data-get-sandbox-url event whose payload.data.status === 'done'.
let firstPreviewMs: number | null = null
let previewUrl: string | null = null
for (const e of events) {
  if (e.type === 'data-get-sandbox-url') {
    const d = (e.payload as { data?: { status?: string; url?: string } })?.data
    if (d?.status === 'done' && firstPreviewMs === null) {
      firstPreviewMs = new Date(e.created_at as string).getTime() - createdMs
      previewUrl = d.url ?? null
    }
  }
}
const narrations = events.filter(e => e.type === 'data-narration').map(e => {
  const at = Math.round((new Date(e.created_at as string).getTime() - createdMs) / 1000)
  return `${at}s: ${(e.payload as { data?: { text?: string } })?.data?.text ?? ''}`
})
const chainMarkers = narrations.filter(n => /in the background|keep filling/i.test(n)).length
const manifest = run.manifest
const phaseCount = Array.isArray(manifest) ? manifest.reduce((m: number, f: { phase?: number }) => Math.max(m, Number(f?.phase) || 1), 1) : null
const fileCount = Array.isArray(manifest) ? manifest.length : 0

console.log(`\n══════════ ${label.toUpperCase()} ══════════`)
console.log(`status:             ${run.status}`)
console.log(`TIME TO 1ST PREVIEW: ${fmt(firstPreviewMs)}`)
console.log(`TOTAL BUILD TIME:    ${fmt(updatedMs - createdMs)}`)
console.log(`phases:             ${run.phase_cursor}/${phaseCount ?? '?'}  (files planned: ${fileCount})`)
console.log(`tokens used:        ${run.tokens_used}`)
console.log(`chained/walk-away:  ${chainMarkers > 0 ? `YES — ${chainMarkers} handoff(s)` : 'no (single invocation)'}`)
console.log(`preview url:        ${previewUrl ?? '(sandbox ' + run.sandbox_id + ')'}`)
console.log(`event log size:     ${events.length}`)
console.log(`project_id:         ${run.project_id}`)
if (narrations.length) { console.log(`\nnarration timeline:`); narrations.forEach(n => console.log('  ' + n)) }
process.exit(0)
