import { NextResponse } from 'next/server'

// Throughput diagnostic (Fable): measures model-stream TTFT + tokens/sec FROM THE DEPLOYED
// FUNCTION to each provider, so we can see whether DeepSeek-direct (China endpoint) is slow
// from Vercel's US region vs OpenRouter (US-hosted DeepSeek). One measurement decides the
// route. Secret-gated so it isn't a public cost sink. GET /api/diag?key=<CM_INTERNAL_SECRET>
export const maxDuration = 180

const PROMPT =
  'Write a detailed, well-structured 700-word technical explanation of how a React single-page app renders, covering the virtual DOM, reconciliation, hooks, and state batching. Be thorough.'

async function measure(label: string, url: string, key: string, model: string, extra: Record<string, unknown> = {}) {
  const t0 = Date.now()
  let ttftMs = 0
  let chars = 0
  let status = 0
  let lastTokenAt = 0
  let maxGapMs = 0 // longest pause between content tokens — a big gap = mid-stream STALL
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      // LONG output (6000 tokens ≈ a real file/two) to expose sustained-stream stalls that a
      // short 700-token call hides. This is the definitive network-stability test.
      body: JSON.stringify({ model, messages: [{ role: 'user', content: PROMPT }], max_tokens: 6000, stream: true, ...extra }),
      signal: AbortSignal.timeout(170_000),
    })
    status = res.status
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '')
      return { label, status, error: body.slice(0, 200) }
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
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
        try {
          const ev = JSON.parse(json)
          const delta = ev?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta.length > 0) {
            const now = Date.now()
            if (ttftMs === 0) ttftMs = now - t0
            else { const gap = now - lastTokenAt; if (gap > maxGapMs) maxGapMs = gap }
            lastTokenAt = now
            chars += delta.length
          }
        } catch { /* skip */ }
      }
    }
    const totalMs = Date.now() - t0
    const approxTokens = Math.round(chars / 4) // ~4 chars/token
    const streamMs = totalMs - ttftMs
    const tokPerSec = streamMs > 0 ? Math.round((approxTokens / streamMs) * 1000) : 0
    // completed? if approxTokens << requested, the stream was cut short.
    return { label, status, ttftMs, totalMs, approxTokens, tokPerSec, maxGapMs }
  } catch (e) {
    return { label, status, error: e instanceof Error ? e.message : String(e), partialTokens: Math.round(chars / 4), maxGapMs, msBeforeFail: Date.now() - t0 }
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = process.env.CM_INTERNAL_SECRET || ''
  if (!secret || url.searchParams.get('key') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const region = process.env.VERCEL_REGION || 'unknown'
  const dsKey = process.env.DEEPSEEK_API_KEY || ''
  const orKey = process.env.CODEMINE_AI_KEY || ''

  const results = []
  results.push(await measure('deepseek-direct', 'https://api.deepseek.com/chat/completions', dsKey, 'deepseek-v4-flash', { thinking: { type: 'disabled' } }))
  results.push(await measure('openrouter-codey', 'https://openrouter.ai/api/v1/chat/completions', orKey, 'deepseek/deepseek-v4-flash', { reasoning: { enabled: false } }))

  return NextResponse.json({ region, results })
}
