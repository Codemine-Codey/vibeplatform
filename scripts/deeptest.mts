// Durable-runs DEEP TEST harness. Authenticates as the test user via Supabase SSR
// cookies, fires a real build through /api/chat, measures time-to-first-preview from the
// live SSE stream, then reads the canonical run log for total time / tokens / phases /
// chaining. Proves walk-away by NOT depending on the stream past first-preview.
//
// Usage: npx tsx scripts/deeptest.mts "<label>" "<prompt>"
//   env CM_WALKAWAY=1  → drop the SSE stream right after first preview (walk-away proof)
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// Synchronous file log — Node block-buffers stdout to a pipe, so we mirror every line to
// a file immediately for live monitoring. The final RESULT block prints regardless.
// Repo-relative by default — Node resolves '/tmp' to C:\tmp on Windows (NOT Git Bash's
// /tmp), so writes silently landed nowhere. A cwd-relative file is unambiguous.
const PROGRESS = process.env.CM_PROGRESS || 'dt-progress.log'
function log(msg: string) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`
  console.log(msg)
  try { appendFileSync(PROGRESS, line + '\n') } catch { /* ignore */ }
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l)=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]})
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
// Use https://codemineapp.com (no www) — www redirects to no-www and Node.js
// fetch (undici) strips cookies on the cross-host redirect, causing silent 401s.
const BASE = process.env.CM_BASE || 'https://codemineapp.com'
const EMAIL = 'test@codemine.app'
const PASS = 'CodemineTest2026!'
const WALKAWAY = process.env.CM_WALKAWAY === '1'

const [label = 'website', prompt = 'Build me a website'] = process.argv.slice(2)
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))])
}

async function ensureUser() {
  // Create + confirm (idempotent — ignore "already registered"). Best-effort + bounded:
  // the account already exists after the first run, so a hang here must never block.
  try {
    const { error } = await withTimeout(
      admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true }),
      15_000,
      'ensureUser'
    )
    if (error && !/already/i.test(error.message)) console.warn('createUser:', error.message)
  } catch (e) {
    log(`  (ensureUser skipped: ${e instanceof Error ? e.message : e})`)
  }
}

async function signIn(): Promise<{ cookie: string; userId: string }> {
  // Use the SSR client to get the exact cookie format Next.js expects.
  // @supabase/ssr v0.12 stores the session as base64-{b64json} in the cookie value.
  const jar = new Map<string, string>()
  const sb = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  const { data, error } = await withTimeout(sb.auth.signInWithPassword({ email: EMAIL, password: PASS }), 20_000, 'signIn')
  if (error) throw new Error('signIn: ' + error.message)
  // Build Cookie header from the jar — values are already in the base64-{...} format
  // that the server-side @supabase/ssr client parses back into a session.
  const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join('; ')
  return { cookie, userId: data.user!.id }
}

function fmt(ms: number | null): string {
  if (ms === null) return 'n/a'
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s (${s}s)`
}

async function run() {
  await ensureUser()
  const { cookie, userId } = await signIn()
  log(`\n=== DEEP TEST: ${label} ===`)
  log(`prompt: ${prompt}`)
  log(`walk-away mode: ${WALKAWAY ? 'ON (drop stream after first preview)' : 'off'}`)

  const t0 = Date.now()
  const body = { messages: [{ id: randomUUID(), role: 'user', parts: [{ type: 'text', text: prompt }] }] }
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    console.error('POST /api/chat failed:', res.status, await res.text().catch(() => ''))
    process.exit(1)
  }

  let runId: string | null = null
  let firstPreviewMs: number | null = null
  let previewUrl: string | null = null
  const narrations: string[] = []
  let unknownSample = 0

  // The SSE read is best-effort ONLY (live narration + runId). A mid-stream termination
  // (undici body-timeout, or an intentional walk-away) is NON-FATAL — the build runs
  // server-side and the canonical run log is the source of truth for every metric.
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    streamLoop: for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line.startsWith('data:')) continue
        const json = line.slice(5).trim()
        if (!json || json === '[DONE]') continue
        let ev: { type?: string; data?: Record<string, unknown> }
        try { ev = JSON.parse(json) } catch { continue }
        if (ev.type === 'data-run' && ev.data?.runId) runId = String(ev.data.runId)
        if (ev.type === 'data-get-sandbox-url' && ev.data?.status === 'done' && firstPreviewMs === null) {
          firstPreviewMs = Date.now() - t0
          previewUrl = ev.data.url ? String(ev.data.url) : null
          log(`  ⏱  FIRST PREVIEW (client-observed) at ${fmt(firstPreviewMs)} → ${previewUrl}`)
          if (WALKAWAY) { log('  🚶 walk-away: dropping the stream now — build must finish server-side'); reader.cancel().catch(() => {}); break streamLoop }
        }
        if (ev.type === 'data-narration' && ev.data?.text) {
          const at = Math.round((Date.now() - t0) / 1000)
          narrations.push(`${at}s: ${ev.data.text}`)
          log(`  💬 ${at}s: ${ev.data.text}`)
        }
        if (ev.type && !/^data-(run|get-sandbox-url|narration|run-command|create-sandbox|report-errors|generating-files|get-file-paths)$/.test(ev.type) && unknownSample < 4) {
          unknownSample++
        }
      }
    }
  } catch (e) {
    log(`  (stream ended early — non-fatal, build continues server-side: ${e instanceof Error ? e.message : e})`)
  }
  const streamEndMs = Date.now() - t0
  log(`  stream ended at ${fmt(streamEndMs)} (runId=${runId})`)

  // ── Poll the canonical run log until terminal ────────────────────────────────
  if (!runId) {
    const { data } = await admin.from('runs').select('id').eq('user_id', userId).order('created_at', { ascending: false }).limit(1)
    runId = data?.[0]?.id ?? null
    log(`  (recovered runId from DB: ${runId})`)
  }
  let final: Record<string, unknown> | null = null
  const pollStart = Date.now()
  while (Date.now() - pollStart < 20 * 60_000) {
    const { data } = await admin.from('runs').select('*').eq('id', runId).single()
    final = data as Record<string, unknown>
    const st = final?.status
    if (st === 'done' || st === 'error') break
    await new Promise((r) => setTimeout(r, 5000))
  }

  const created = final?.created_at ? new Date(final.created_at as string).getTime() : t0
  const updated = final?.updated_at ? new Date(final.updated_at as string).getTime() : Date.now()
  const manifest = final?.manifest
  const phaseCount = Array.isArray(manifest)
    ? manifest.reduce((m: number, f: { phase?: number }) => Math.max(m, Number(f?.phase) || 1), 1)
    : null

  // Count how many distinct sandbox URLs / chain markers appeared in the event log.
  const { data: evs } = await admin.from('run_events').select('type,payload,created_at').eq('run_id', runId).order('seq', { ascending: true }).limit(5000)
  const chainMarkers = (evs ?? []).filter((e) => e.type === 'data-narration' && /in the background|keep filling/i.test((e.payload as { data?: { text?: string } })?.data?.text ?? '')).length

  // Server-accurate first-preview: the data-get-sandbox-url 'done' event timestamp minus
  // run start. Immune to client stream drops; falls back to the client-observed value.
  let serverFirstPreviewMs: number | null = null
  for (const e of evs ?? []) {
    if (e.type === 'data-get-sandbox-url' && serverFirstPreviewMs === null) {
      const d = (e.payload as { data?: { status?: string } })?.data
      if (d?.status === 'done') serverFirstPreviewMs = new Date(e.created_at as string).getTime() - created
    }
  }

  log(`\n  ── RESULT: ${label} ──`)
  log(`  status:            ${final?.status}`)
  log(`  time to preview:   ${fmt(serverFirstPreviewMs ?? firstPreviewMs)}`)
  log(`  total build time:  ${fmt(updated - created)}`)
  log(`  phases:            ${final?.phase_cursor}/${phaseCount ?? '?'} completed`)
  log(`  tokens used:       ${final?.tokens_used}`)
  log(`  chained (walkaway):${chainMarkers > 0 ? ` YES (${chainMarkers} handoff msg)` : ' no (single invocation)'}`)
  log(`  preview url:       ${previewUrl ?? final?.sandbox_id}`)
  log(`  event log size:    ${evs?.length ?? 0}`)
  log(`  narrations:        ${narrations.length}`)
}

run().then(() => process.exit(0)).catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1) })
