// ~$0.0001 preflight of the DIRECT Moonshot path — never executed before today.
// Replicates the EXACT body shape ai/gateway.ts (kimiProvider) + the AI SDK send:
// cache_control array system msg, thinking:disabled, stream + include_usage, max_tokens 64000.
// Verifies: (1) does Moonshot accept the body (no 400)? (2) does text stream?
// (3) does the STREAM return usage (so the cost middleware can bill → kill cap works)?
import { readFileSync } from 'node:fs'

// Load KIMI_API_KEY from .env.local (never printed)
let KEY = ''
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^KIMI_API_KEY=(.*)$/)
  if (m) KEY = m[1].replace(/^"|"$/g, '').trim()
}
if (!KEY) { console.error('KIMI_API_KEY not found in .env.local'); process.exit(1) }

const body = {
  model: 'kimi-k2.6',
  messages: [
    { role: 'system', content: [{ type: 'text', text: 'You are a helpful assistant.', cache_control: { type: 'ephemeral' } }] },
    { role: 'user', content: 'Say hi in exactly three words.' },
  ],
  stream: true,
  stream_options: { include_usage: true },
  max_tokens: 64000,
  thinking: { type: 'disabled' },
}

const res = await fetch('https://api.moonshot.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

console.log(`HTTP ${res.status}`)
if (!res.ok) {
  console.log('BODY-REJECTED:', (await res.text()).slice(0, 600))
  process.exit(1)
}

let text = ''
let usage = null
const reader = res.body.getReader()
const dec = new TextDecoder()
let buf = ''
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buf += dec.decode(value, { stream: true })
  const lines = buf.split('\n')
  buf = lines.pop() ?? ''
  for (const l of lines) {
    const t = l.trim()
    if (!t.startsWith('data:')) continue
    const d = t.slice(5).trim()
    if (d === '[DONE]') continue
    try {
      const j = JSON.parse(d)
      const delta = j.choices?.[0]?.delta?.content
      if (delta) text += delta
      if (j.usage) usage = j.usage
    } catch { /* skip */ }
  }
}

console.log('TEXT:', JSON.stringify(text))
console.log('USAGE:', JSON.stringify(usage))
console.log(usage
  ? '✅ usage PRESENT in stream → cost middleware can bill → kill cap will measure real cost'
  : '❌ usage ABSENT in stream → addCost gets 0 → kill cap blind (need stream_options fix or manual watch)')
