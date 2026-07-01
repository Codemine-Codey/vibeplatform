import { tool } from 'ai'
import z from 'zod/v3'
import { fetchOne as unsplashFetchOne } from './get-unsplash-batch'

// fal.ai account concurrency is capped (10) — we self-limit BELOW it so we never overshoot
// or 429 under load, even with several projects generating at once. Flux schnell is sub-second,
// so an 8-wide pool drains a full project's images in ~1-2 waves.
const FAL_CONCURRENCY = 8

// Run tasks with a fixed concurrency ceiling, preserving input order in the result.
async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// AI-generated bespoke images via Flux Schnell on fal.ai — the cheapest ($0.003/img)
// and fastest (sub-second) production image model. Runs all prompts in parallel and
// in parallel with code generation (zero added critical-path latency, same as the
// photo tool). If FAL_KEY is missing, returns a note so the model falls back to the
// stock-photo tool — never errors, never blocks the build.
//
// Set the key in env as FAL_KEY (fal.ai dashboard → keys). One line, no code change.

const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux/schnell'

type FalSize = 'landscape_16_9' | 'portrait_16_9' | 'square_hd'
const SIZE: Record<string, FalSize> = {
  landscape: 'landscape_16_9',
  portrait: 'portrait_16_9',
  squarish: 'square_hd',
}

async function generateOne(
  prompt: string,
  orientation: string,
  key: string
): Promise<string | null> {
  // Up to 3 attempts, backing off on 429/5xx (transient saturation) so a brief overshoot of
  // fal's concurrency never fails an image — it just waits a beat and retries.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(FAL_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          image_size: SIZE[orientation] ?? 'landscape_16_9',
          num_inference_steps: 4, // schnell is tuned for 4 steps — fast + good
          num_images: 1,
          enable_safety_checker: true,
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (res.ok) {
        const data = (await res.json()) as { images?: Array<{ url: string }> }
        return data.images?.[0]?.url ?? null
      }
      // Retry only transient statuses; anything else is a real failure → give up (Unsplash covers it).
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
        continue
      }
      return null
    } catch {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
    }
  }
  return null
}

export const generateImageBatch = () =>
  tool({
    description:
      'Generate BESPOKE AI images for the project (hero art, abstract backgrounds, product/illustration imagery) — all generated in parallel. ' +
      'Prefer this over stock photos when the design calls for a specific, on-brand, art-directed visual that stock cannot provide (custom hero scenes, ' +
      'brand-specific illustration, abstract textures). For generic real-world photos (food, people, places), the stock-photo tool is better. ' +
      'Write a vivid, specific prompt per image (style, subject, lighting, mood, palette). Returns URLs in the same order as the input prompts.',
    inputSchema: z.object({
      images: z
        .array(
          z.object({
            prompt: z
              .string()
              .describe('Vivid, specific image prompt, e.g. "a single artisanal chocolate bar on dark slate, dramatic side lighting, warm gold accents, editorial product photography"'),
            orientation: z.enum(['landscape', 'portrait', 'squarish']).optional().default('landscape'),
          })
        )
        .max(12)
        .optional()
        .default([])
        .describe('All AI images needed for the project'),
    }),
    execute: async ({ images }) => {
      if (!images || images.length === 0) {
        return { note: 'No image prompts provided. Skip and proceed; add prompts only for images that need bespoke AI art.', images: [] }
      }
      const key = process.env.FAL_KEY
      if (!key) {
        // No key yet — tell the model to use the stock-photo tool instead. Non-fatal.
        return { note: 'AI image generation is not configured; use the stock-photo tool (getUnsplashBatch) instead.', images: [] }
      }
      const wanted = images.slice(0, 12)
      const unsplashKey = process.env.UNSPLASH_ACCESS_KEY
      // Generate through a concurrency pool (≤8) so we stay under fal's account cap even with
      // several projects running at once. Any image fal can't deliver falls back to a real
      // Unsplash photo (no placeholders) so every slot is filled with a usable image.
      const urls = await pool(wanted, FAL_CONCURRENCY, async ({ prompt, orientation }) => {
        const flux = await generateOne(prompt, orientation ?? 'landscape', key)
        if (flux) return flux
        return unsplashFetchOne(prompt, orientation === 'portrait' ? 'portrait' : 'landscape', unsplashKey)
      })
      return wanted.map((w, i) => ({ prompt: w.prompt, url: urls[i] }))
    },
  })
