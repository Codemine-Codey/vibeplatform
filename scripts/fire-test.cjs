// CommonJS test runner — fires a build and polls Supabase for metrics.
// Uses supabase-js directly (no SSR complexity) to get a session,
// then constructs the auth cookie in the format @supabase/ssr 0.12 expects.
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const { randomUUID } = require('crypto')

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SRK = env.SUPABASE_SERVICE_ROLE_KEY
const [base, label, ...promptParts] = process.argv.slice(2)
const prompt = promptParts.join(' ')

async function main() {
  const admin = createClient(SUPABASE_URL, SRK, { auth: { persistSession: false } })

  // Sign in via REST to get access_token, then send as Bearer header.
  // The server's getCurrentUser() accepts Authorization: Bearer <token> for server-to-server calls.
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON },
    body: JSON.stringify({ email: 'test@codemine.app', password: 'CodemineTest2026!' }),
  })
  if (!authRes.ok) { const t = await authRes.text(); console.log('AUTH FAIL:', authRes.status, t.slice(0, 200)); process.exit(1) }
  const session = await authRes.json()
  const accessToken = session.access_token
  console.log('Auth OK, user:', session.user?.email)

  const fireAt = new Date()
  const body = JSON.stringify({ messages: [{ id: randomUUID(), role: 'user', parts: [{ type: 'text', text: prompt }] }] })
  const res = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${accessToken}` },
    body,
  })
  console.log(`[${label}] HTTP ${res.status} @ ${fireAt.toTimeString().slice(0, 8)}`)
  if (!res.ok) { const t = await res.text().catch(() => ''); console.log('  body:', t.slice(0, 200)); process.exit(1) }

  // Parse SSE stream looking for data-run event
  let runId = ''
  try {
    const rd = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    outer: for (;;) {
      const { done, value } = await rd.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const ls = buf.split('\n')
      buf = ls.pop() || ''
      for (const l of ls) {
        if (!l.startsWith('data:')) continue
        const raw = l.slice(5).trim()
        try { const e = JSON.parse(raw); if (e.type === 'data-run' && e.data?.runId) { runId = e.data.runId; rd.cancel(); break outer } } catch {}
        if (raw.startsWith('2:[')) {
          try { const arr = JSON.parse(raw.slice(2)); for (const e of arr) { if (e?.type === 'data-run' && e?.data?.runId) { runId = e.data.runId; rd.cancel(); break outer } } } catch {}
        }
      }
    }
  } catch {}

  if (!runId) {
    // Fallback: find the most recent run created after fireAt
    const { data: fresh } = await admin.from('runs').select('id').gte('created_at', fireAt.toISOString()).order('created_at', { ascending: false }).limit(1)
    runId = fresh?.[0]?.id ?? ''
    if (runId) console.log(`  [fallback] found runId by timestamp: ${runId.slice(0, 8)}`)
  }
  if (!runId) { console.log('  ERROR: no runId found'); process.exit(1) }
  console.log(`[${label}] tracking runId=${runId.slice(0, 8)}`)

  // Poll until done
  let last = '', fp = 0
  for (let i = 0; i < 90; i++) {
    const { data } = await admin.from('runs').select('*').eq('id', runId).single()
    if (!data) { await new Promise(r => setTimeout(r, 8000)); continue }
    const { data: evs } = await admin.from('run_events').select('type,payload,created_at').eq('run_id', runId).order('seq', { ascending: true }).limit(6000)
    const c = new Date(data.created_at).getTime()
    const urlEv = (evs || []).find(e => e.type === 'data-get-sandbox-url' && e.payload?.data?.status === 'done')
    if (urlEv && !fp) { fp = Math.round((new Date(urlEv.created_at).getTime() - c) / 1000); console.log(`  PREVIEW @ ${Math.floor(fp / 60)}m${String(fp % 60).padStart(2, '0')}s → ${urlEv.payload.data.url}`) }
    const st = `status=${data.status} phase=${data.phase_cursor} tokens=${data.tokens_used} events=${evs?.length} age=${Math.round((Date.now() - c) / 1000)}s`
    if (st !== last) { console.log('  ' + st); last = st }
    if (data.status === 'done' || data.status === 'error') {
      const tot = Math.round((new Date(data.updated_at).getTime() - c) / 1000)
      const mf = Array.isArray(data.manifest) ? data.manifest.reduce((m, f) => Math.max(m, Number(f?.phase) || 1), 1) : null
      console.log(`\n=== ${label} RESULT ===\nstatus: ${data.status}\nfirst-preview: ${fp ? Math.floor(fp / 60) + 'm' + String(fp % 60).padStart(2, '0') + 's' : 'n/a'}\ntotal: ${Math.floor(tot / 60)}m${String(tot % 60).padStart(2, '0')}s\nphases: ${data.phase_cursor}/${mf}\ntokens: ${data.tokens_used}\nurl: ${data.sandbox_id ? 'https://sb-' + data.sandbox_id.replace(/_/g,'-') + '.vercel.run' : 'n/a'}`)
      break
    }
    await new Promise(r => setTimeout(r, 8000))
  }
}

main().catch(e => { console.log('FATAL:', e.message); process.exit(1) })
