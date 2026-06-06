import { tool } from 'ai'
import z from 'zod/v3'

// Single neutral fallback — only used when Unsplash API key is missing entirely.
const FALLBACK_URL = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80'

export const getUnsplash = () =>
  tool({
    description: 'Get a real contextual photo URL for a given keyword. Call this for EVERY image in the project — never hardcode photo IDs.',
    inputSchema: z.object({
      keyword: z.string()
        .describe('Descriptive search term, e.g. "specialty coffee shop interior", "modern law office", "Japanese sushi restaurant"'),
      orientation: z.enum(['landscape', 'portrait', 'squarish'])
        .optional()
        .default('landscape'),
    }),
    execute: async ({ keyword, orientation = 'landscape' }) => {
      const accessKey = process.env.UNSPLASH_ACCESS_KEY
      if (!accessKey) return { url: FALLBACK_URL }

      try {
        const params = new URLSearchParams({ query: keyword, orientation, content_filter: 'high' })
        const response = await fetch(
          `https://api.unsplash.com/photos/random?${params}`,
          { headers: { Authorization: `Client-ID ${accessKey}` }, signal: AbortSignal.timeout(8_000) }
        )
        if (!response.ok) return { url: FALLBACK_URL }
        const data = await response.json() as { urls: { regular: string } }
        const base = data.urls.regular.split('?')[0]
        return { url: `${base}?auto=format&fit=crop&w=1200&q=80` }
      } catch {
        return { url: FALLBACK_URL }
      }
    },
  })
