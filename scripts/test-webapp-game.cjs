#!/usr/bin/env node
'use strict'

const BASE = 'https://vibeplatform-lsgbj06v2-shazimrv11-4930s-projects.vercel.app'
const SUPABASE_URL = 'https://wnocoojdtguozkycijjp.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indub2Nvb2pkdGd1b3preWNpampwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NDEzOTAsImV4cCI6MjA5NjUxNzM5MH0.pCni_J-2jAmG_lA3i8WpaeGQIhOEIyf5lb8gq1vPBQ4'
const EMAIL = 'test@codemine.app'
const PASS  = 'CodemineTest2026!'

const TESTS = [
  { id: 'webapp3', prompt: 'Build me a project management app with tasks, kanban board, drag-and-drop columns, and due dates' },
  { id: 'game3',   prompt: 'Build me a Snake game with score counter, increasing speed levels, and game over screen' },
]

async function signIn() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('Auth failed: ' + JSON.stringify(d))
  console.log('auth ok')
  return d.access_token
}

async function fireTest(token, id, prompt) {
  const t0 = Date.now()
  console.log(`\n[${id}] Firing @ ${new Date().toLocaleTimeString()}`)
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      projectId: `test-${id}-${Date.now()}`,
    }),
  })
  if (!r.ok) {
    const t = await r.text()
    console.error(`[${id}] HTTP ${r.status}: ${t.slice(0,200)}`)
    return null
  }

  // Parse SSE stream to get runId
  let runId = null
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let sseTimeout = setTimeout(() => reader.cancel(), 30000) // 30s to get runId

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (!raw || raw === '[DONE]') continue
        try {
          let obj
          if (raw.startsWith('2:[')) {
            const arr = JSON.parse(raw.slice(2))
            obj = arr[0]
          } else {
            obj = JSON.parse(raw)
          }
          if (obj?.type === 'data-run' || obj?.runId) {
            runId = obj.runId || obj.data?.runId
            if (runId) { clearTimeout(sseTimeout); reader.cancel(); break }
          }
        } catch {}
      }
      if (runId) break
    }
  } catch {}

  if (!runId) { console.log(`[${id}] no runId from SSE`); return null }
  console.log(`[${id}] runId=${runId}`)

  // Poll Supabase for PREVIEW event
  const deadline = Date.now() + 10 * 60 * 1000 // 10 min max
  let previewUrl = null
  let lastStatus = ''

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 8000))
    const age = Math.round((Date.now() - t0) / 1000)

    // Check run row
    const rr = await fetch(`${SUPABASE_URL}/rest/v1/runs?id=eq.${runId}&select=status,phase_cursor,tokens_used`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
    })
    const rows = await rr.json()
    const run = rows[0]
    const statusStr = `  status=${run?.status} phase=${run?.phase_cursor} age=${age}s`
    if (statusStr !== lastStatus) { console.log(statusStr); lastStatus = statusStr }

    // Check for PREVIEW event
    const er = await fetch(`${SUPABASE_URL}/rest/v1/run_events?run_id=eq.${runId}&type=eq.PREVIEW&select=payload`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
    })
    const events = await er.json()
    if (events?.[0]?.payload?.url) {
      previewUrl = events[0].payload.url
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0)
      console.log(`  PREVIEW @ ${Math.floor(elapsed/60)}m${elapsed%60}s -> ${previewUrl}`)
    }

    if (run?.status === 'done' || run?.status === 'error') {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0)
      console.log(`\n=== ${id} RESULT ===`)
      console.log(`status: ${run.status} `)
      console.log(`first-preview: ${previewUrl ? Math.floor(elapsed/60)+'m'+elapsed%60+'s' : 'NONE'} `)
      console.log(`tokens: ${run.tokens_used}`)
      return { id, status: run.status, elapsed, previewUrl }
    }
  }
  console.log(`[${id}] TIMEOUT after 10min`)
  return { id, status: 'timeout', elapsed: 600, previewUrl }
}

;(async () => {
  const token = await signIn()
  // Fire both in parallel
  const results = await Promise.all(TESTS.map(t => fireTest(token, t.id, t.prompt)))
  console.log('\n=== SUMMARY ===')
  results.forEach(r => r && console.log(`${r.id}: ${r.status} | preview=${r.previewUrl || 'NONE'} | time=${r.elapsed}s`))
})().catch(console.error)
