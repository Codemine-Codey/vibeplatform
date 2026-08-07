import { tool } from 'ai'
import z from 'zod/v3'

// Tavily search — used to look up real physics constants, current API docs,
// game patterns, and any unfamiliar technical domain before writing code.
// This prevents "AI invents wrong values" failures (the root cause of broken games).
export const webSearch = () =>
  tool({
    description:
      'Search the web for current documentation, game physics patterns, API examples, or technical reference. ' +
      'REQUIRED before writing game physics code — search for the specific game type + engine patterns to get real, verified values. ' +
      'REQUIRED before implementing any unfamiliar third-party API — search for its current documentation. ' +
      'Use for: game physics constants, Phaser.js examples, React Three Fiber patterns, MediaPipe usage, chart library API shapes, animation library examples. ' +
      'Returns top search results with relevant content excerpts.',
    inputSchema: z.object({
      query: z.string().describe(
        'Search query. Be specific: "Phaser 3 arcade physics flappy bird gravity jump" not just "physics". ' +
        'For APIs: "Phaser 3.88 GroupConfig arcade gravity" or "React Three Fiber useFrame example 2025".'
      ),
      maxResults: z.number().int().min(1).max(5).optional().default(3)
        .describe('Number of results to return (default 3, max 5)'),
    }),
    execute: async ({ query, maxResults = 3 }) => {
      const apiKey = process.env.TAVILY_API_KEY
      if (!apiKey) {
        return { error: 'TAVILY_API_KEY not set — web search unavailable. Proceed with your best judgment.' }
      }

      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: maxResults,
            search_depth: 'basic',
            include_answer: true,
            include_raw_content: false,
          }),
          signal: AbortSignal.timeout(10_000),
        })

        if (!res.ok) {
          return { error: `Search API error ${res.status}. Proceed with your best judgment.` }
        }

        const data = await res.json() as {
          answer?: string
          results?: Array<{ title: string; url: string; content: string; score: number }>
        }

        const answer = data.answer ? `\nDirect answer: ${data.answer}\n` : ''
        const results = (data.results ?? [])
          .slice(0, maxResults)
          .map((r, i) =>
            `[${i + 1}] ${r.title}\n${r.url}\n${r.content.slice(0, 400)}`
          )
          .join('\n\n')

        return {
          query,
          results: answer + results,
          note: 'Use these results to anchor your implementation in verified patterns. Do not invent constants not supported by these sources.',
        }
      } catch (err) {
        return {
          error: `Search failed: ${err instanceof Error ? err.message : String(err)}. Proceed with your best judgment.`,
        }
      }
    },
  })
