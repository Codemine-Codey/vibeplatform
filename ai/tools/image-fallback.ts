// Multi-source image fallback — used whenever Unsplash fails (rate-limit 429 / no
// results / no key). Keeps EVERY image slot real AND distinct: a rate-limited build must
// never degrade to one repeated photo (the old single-FALLBACK_URL bug) or a blank slot.
//
// Chain: Pexels (real, keyword-relevant — only if PEXELS_API_KEY set) → Picsum seeded
// (keyless, always works, a DISTINCT deterministic photo per keyword). Add PIXABAY/others
// the same way later. Never throws, never returns empty.

function dims(orientation: string): [number, number] {
  return orientation === 'portrait' ? [800, 1200] : orientation === 'squarish' ? [1000, 1000] : [1200, 800]
}

// Keyless, always-available. Seeded by keyword so each distinct slot gets a distinct
// (deterministic) real photo — no repeats across a page even when every API source is down.
export function picsumSeeded(keyword: string, orientation = 'landscape'): string {
  const seed = encodeURIComponent(
    (keyword || 'cm').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cm'
  )
  const [w, h] = dims(orientation)
  return `https://picsum.photos/seed/${seed}/${w}/${h}`
}

// Pexels — real, keyword-relevant. Activates only when PEXELS_API_KEY is set (free tier
// 200 req/hr, a second relevant source beyond Unsplash's 50/hr). Returns null on any miss.
async function fromPexels(keyword: string, orientation: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return null
  try {
    const params = new URLSearchParams({ query: keyword, per_page: '1', orientation })
    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { photos?: Array<{ src?: { large?: string; landscape?: string } }> }
    const src = data?.photos?.[0]?.src
    return src?.large ?? src?.landscape ?? null
  } catch {
    return null
  }
}

// Always returns a usable, distinct image URL. Never throws, never empty.
export async function resolveFallbackImage(keyword: string, orientation = 'landscape'): Promise<string> {
  const pex = await fromPexels(keyword, orientation)
  if (pex) return pex
  return picsumSeeded(keyword, orientation)
}
