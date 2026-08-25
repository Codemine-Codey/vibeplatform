import { tool } from 'ai'
import z from 'zod/v3'
import { resolveFallbackImage } from './image-fallback'

const fmt = (regular: string) => `${regular.split('?')[0]}?auto=format&fit=crop&w=1200&q=80`

// Disambiguate image-search keywords whose brand meaning drowns out the intended one on stock
// sites. "amazon" returns Amazon.com boxes/logos, not the rainforest (user-reported). We strip the
// ambiguous brand token and, if no descriptive noun remains, anchor it to the real subject. Small,
// deterministic, and only touches known-ambiguous terms so normal keywords are unaffected.
const AMBIGUOUS_TERMS: Record<string, { nature: RegExp; anchor: string }> = {
  amazon: { nature: /rainforest|jungle|forest|river|canopy|wildlife|tropical|jaguar|dolphin|macaw|nature/i, anchor: 'rainforest jungle tropical' },
}
function disambiguateQuery(q: string): string {
  let out = q
  for (const [term, cfg] of Object.entries(AMBIGUOUS_TERMS)) {
    if (!out.toLowerCase().includes(term)) continue
    const re = new RegExp(term, 'ig')
    const stripped = out.replace(re, ' ').replace(/\s+/g, ' ').trim()
    // Keep the descriptive words; if the brand word was carrying the meaning, anchor to the subject.
    out = cfg.nature.test(stripped) ? stripped : `${cfg.anchor} ${stripped}`.trim()
  }
  return out || q
}

async function searchTop(query: string, orientation: string, accessKey: string): Promise<string | null> {
  const params = new URLSearchParams({ query, orientation, content_filter: 'high', per_page: '1', order_by: 'relevant' })
  const res = await fetch(`https://api.unsplash.com/search/photos?${params}`,
    { headers: { Authorization: `Client-ID ${accessKey}` }, signal: AbortSignal.timeout(8_000) })
  if (!res.ok) return null
  const data = await res.json() as { results?: Array<{ urls: { regular: string } }> }
  return data.results?.[0] ? fmt(data.results[0].urls.regular) : null
}

// Relevance-first with a never-empty backstop. The model often passes overly
// specific keywords (e.g. "premium movie studio cinema warm lighting") that
// SEARCH returns 0 results for — so: search full keyword → search the core 2
// words → random (always returns a loosely-matching photo) → fallback URL. This
// keeps images on-topic (search) without ever leaving an empty slot (random).
export async function fetchOne(keyword: string, orientation: string, accessKey: string | undefined): Promise<string> {
  // No Unsplash key → straight to the multi-source fallback (Pexels/Picsum), which is
  // real + DISTINCT per keyword (never one repeated photo across the page).
  if (!accessKey) return resolveFallbackImage(keyword, orientation)
  // Fix ambiguous brand terms ("amazon" → the rainforest, not the company) before searching.
  keyword = disambiguateQuery(keyword)
  try {
    const full = await searchTop(keyword, orientation, accessKey)
    if (full) return full
    // Simplify to the core noun phrase (last 2 words) and retry search.
    const core = keyword.trim().split(/\s+/).slice(-2).join(' ')
    if (core && core !== keyword) {
      const simpler = await searchTop(core, orientation, accessKey)
      if (simpler) return simpler
    }
    // Backstop: random always returns something loosely matching.
    const params = new URLSearchParams({ query: keyword, orientation, content_filter: 'high' })
    const res = await fetch(`https://api.unsplash.com/photos/random?${params}`,
      { headers: { Authorization: `Client-ID ${accessKey}` }, signal: AbortSignal.timeout(8_000) })
    if (res.ok) {
      const data = await res.json() as { urls?: { regular: string } }
      if (data.urls) return fmt(data.urls.regular)
    }
    // Every Unsplash path failed (rate-limit/no-results) → Pexels then keyless Picsum,
    // so each slot stays real + distinct instead of the same repeated fallback photo.
    return resolveFallbackImage(keyword, orientation)
  } catch {
    return resolveFallbackImage(keyword, orientation)
  }
}

export const getUnsplashBatch = () =>
  tool({
    description:
      'Fetch multiple photo URLs in one call — all requests run in parallel. Use this instead of calling getUnsplash multiple times. ' +
      'Pass all image keywords at once. Returns an array of URLs in the same order as the input keywords.',
    inputSchema: z.object({
      images: z.array(
        z.object({
          keyword: z.string().describe('Descriptive search term, e.g. "Japanese sushi restaurant warm lighting"'),
          orientation: z.enum(['landscape', 'portrait', 'squarish']).optional().default('landscape'),
        })
      ).max(30).optional().default([]).describe('List of all images needed for the project'),
    }),
    execute: async ({ images }) => {
      // Tolerate an empty/malformed call (some models call with {}). Never error —
      // erroring burns the model's step budget on retries and can starve generateFiles.
      if (!images || images.length === 0) {
        return { note: 'No image keywords provided. Skip this tool and proceed to generate; add specific keywords only if you need photos.', images: [] }
      }
      const accessKey = process.env.UNSPLASH_ACCESS_KEY
      // Cap actual fetches at 14 regardless of how many were requested.
      const wanted = images.slice(0, 14)
      const urls = await Promise.all(
        wanted.map(({ keyword, orientation }) => fetchOne(keyword, orientation ?? 'landscape', accessKey))
      )
      return urls.map((url, i) => ({ keyword: wanted[i].keyword, url }))
    },
  })
