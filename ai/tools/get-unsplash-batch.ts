import { tool } from 'ai'
import z from 'zod/v3'

const FALLBACKS: Record<string, string> = {
  coffee:      'photo-1495474472287-4d71bcdd2085',
  food:        'photo-1504674900247-0877df9cc836',
  restaurant:  'photo-1517248135467-4c7edcad34c4',
  sushi:       'photo-1611143669185-af224c5e3252',
  business:    'photo-1497366216548-37526070297c',
  office:      'photo-1497366811353-6870744d04b2',
  technology:  'photo-1518770660439-4636190af475',
  nature:      'photo-1501854140801-50d01698950b',
  city:        'photo-1477959858617-67f85cf4f1df',
  people:      'photo-1531746020798-e6953c6e8e04',
  fitness:     'photo-1534438327276-14e5300c3a48',
  travel:      'photo-1469854523086-cc02fe5d8800',
  fashion:     'photo-1483985988355-763728e1935b',
  game:        'photo-1511512578047-dfb367046420',
  music:       'photo-1511671782779-c97d3d27a1d4',
  art:         'photo-1547826039-bdbebb989b28',
  default:     'photo-1506905925346-21bda4d32df4',
}

function getFallbackUrl(keyword: string): string {
  const kw = keyword.toLowerCase()
  for (const [key, id] of Object.entries(FALLBACKS)) {
    if (kw.includes(key)) {
      return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`
    }
  }
  return `https://images.unsplash.com/${FALLBACKS.default}?auto=format&fit=crop&w=1200&q=80`
}

async function fetchOne(keyword: string, orientation: string, accessKey: string | undefined): Promise<string> {
  if (!accessKey) return getFallbackUrl(keyword)
  try {
    const params = new URLSearchParams({ query: keyword, orientation, content_filter: 'high' })
    const response = await fetch(
      `https://api.unsplash.com/photos/random?${params}`,
      { headers: { Authorization: `Client-ID ${accessKey}` }, signal: AbortSignal.timeout(8_000) }
    )
    if (!response.ok) return getFallbackUrl(keyword)
    const data = await response.json() as { urls: { regular: string } }
    const base = data.urls.regular.split('?')[0]
    return `${base}?auto=format&fit=crop&w=1200&q=80`
  } catch {
    return getFallbackUrl(keyword)
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
      ).min(1).max(12).describe('List of all images needed for the project'),
    }),
    execute: async ({ images }) => {
      const accessKey = process.env.UNSPLASH_ACCESS_KEY
      const urls = await Promise.all(
        images.map(({ keyword, orientation }) => fetchOne(keyword, orientation ?? 'landscape', accessKey))
      )
      return urls.map((url, i) => ({ keyword: images[i].keyword, url }))
    },
  })
