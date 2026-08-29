// Diagnose WHY direct Moonshot Kimi is crawling. Hypothesis: thinking isn't actually
// disabled → the model reasons for minutes on a real prompt. Measures TTFT, tokens/sec,
// and reasoning_tokens across configs + model variants. A few cents total.
import { readFileSync } from 'node:fs'

let KEY = ''
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^KIMI_API_KEY=(.*)$/)
  if (m) KEY = m[1].replace(/^"|"$/g, '').trim()
}

const GEN_PROMPT = 'Write a complete React + TypeScript component file for a coffee-shop hero section: a full-viewport hero with a heading, subheading, CTA button, and a background image div. Use Tailwind classes. Output ONLY the code, ~60-80 lines.'

async function run(label, body) {
  const t0 = Date.now()
  let ttft = null, text = '', usage = null
  try {
    const res = await fetch('https://api.moonshot.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stream: true, stream_options: { include_usage: true }, ...body }),
    })
    if (!res.ok) { console.log(`\n[${label}] HTTP ${res.status}: ${(await res.text()).slice(0,200)}`); return }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() ?? ''
      for (const l of lines) {
        const s = l.trim(); if (!s.startsWith('data:')) continue
        const d = s.slice(5).trim(); if (d === '[DONE]') continue
        try {
          const j = JSON.parse(d)
          const delta = j.choices?.[0]?.delta?.content
          if (delta) { if (ttft === null) ttft = Date.now() - t0; text += delta }
          if (j.usage) usage = j.usage
        } catch {}
      }
    }
  } catch (e) { console.log(`\n[${label}] ERROR ${e.message}`); return }
  const total = Date.now() - t0
  const out = usage?.completion_tokens ?? 0
  const reasoning = usage?.completion_tokens_details?.reasoning_tokens ?? 0
  console.log(`\n[${label}]`)
  console.log(`  TTFT: ${ttft ?? '—'}ms | total: ${total}ms | out tokens: ${out} | reasoning tokens: ${reasoning}`)
  console.log(`  tokens/sec: ${out && total ? (out / (total/1000)).toFixed(1) : '—'} | chars: ${text.length}`)
}

const sys = { role: 'system', content: 'You are an expert React engineer.' }
const user = { role: 'user', content: GEN_PROMPT }

// A) exactly what gateway.ts sends now
await run('k2.6 thinking:disabled max_tokens:64000', { model: 'kimi-k2.6', messages: [sys, user], thinking: { type: 'disabled' }, max_tokens: 64000 })
// B) no thinking param at all (provider default)
await run('k2.6 NO thinking param max_tokens:4096', { model: 'kimi-k2.6', messages: [sys, user], max_tokens: 4096 })
// C) lower max_tokens, thinking disabled
await run('k2.6 thinking:disabled max_tokens:4096', { model: 'kimi-k2.6', messages: [sys, user], thinking: { type: 'disabled' }, max_tokens: 4096 })
// D) the fast code variant
await run('k2.7-code-highspeed max_tokens:4096', { model: 'kimi-k2.7-code-highspeed', messages: [sys, user], max_tokens: 4096 })
