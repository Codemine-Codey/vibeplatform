import { tool } from 'ai'
import z from 'zod/v3'

// Fail-safe reference lookup via Tavily. Used ONLY during planning, for builds that need REAL
// values/facts the model shouldn't guess:
//   • GAMES  → physics/mechanics params (speed, gravity, spawn rates)
//   • APPS   → formulas / calculations (tax, finance, conversions, known algorithms)
//   • SITES  → factual CONTENT for a specific business/domain (real services/sections)
// NEVER for visual design/inspiration. If TAVILY_API_KEY is missing, or the search errors/times
// out, it returns an empty result and the build proceeds on the model's own knowledge — the
// pipeline can NEVER fail because of search. Self-limited (2-3 calls/build via the prompt) and
// cached in-process so repeat lookups (e.g. flappy-bird params) cost 0 credits and 0 latency.

const cache = new Map<string, string>()

export async function tavilySearch(query: string): Promise<string> {
  const key = process.env.TAVILY_API_KEY
  if (!key) return '' // no key yet → graceful no-op
  const cached = cache.get(query)
  if (cached !== undefined) return cached
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic', // 1 credit/search
        max_results: 3,
        include_answer: true,
      }),
      signal: AbortSignal.timeout(6000), // short — never stall the build
    })
    if (!res.ok) return ''
    const data = (await res.json()) as {
      answer?: string
      results?: Array<{ title: string; content: string }>
    }
    const answer = data.answer ? `${data.answer}\n` : ''
    const snippets = (data.results ?? [])
      .slice(0, 3)
      .map((r) => `- ${r.title}: ${(r.content || '').slice(0, 300)}`)
      .join('\n')
    const out = (answer + snippets).trim().slice(0, 1200)
    cache.set(query, out)
    return out
  } catch {
    return '' // any failure → empty → build proceeds
  }
}

export const lookupReference = () =>
  tool({
    description:
      'Look up REAL reference values or facts from the web during planning. Use ONLY when the build ' +
      'needs accurate numbers/facts you should not guess: GAME physics/mechanics params (speed, gravity, ' +
      'spawn rates), APP formulas/calculations (tax, finance, unit conversions, known algorithms), or ' +
      'factual CONTENT for a specific business/domain (a WEBSITE\'s real services/sections). ' +
      'NEVER use it for visual design or inspiration. SKIP it entirely for simple builds with no real ' +
      'calculation and no niche domain. Max 2-3 calls per build. If it returns empty, just proceed with ' +
      'your own knowledge.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'A specific factual query — e.g. "flappy bird gravity and pipe gap typical values", ' +
          '"US federal income tax brackets 2026", or "services a dental clinic typically offers".'
        ),
    }),
    execute: async ({ query }) => {
      const result = await tavilySearch(query)
      return result || 'No reference data available — proceed with your own knowledge.'
    },
  })
