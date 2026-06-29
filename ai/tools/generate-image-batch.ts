import { tool } from 'ai'
import z from 'zod/v3'

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
    if (!res.ok) return null
    const data = (await res.json()) as { images?: Array<{ url: string }> }
    return data.images?.[0]?.url ?? null
  } catch {
    return null
  }
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
      const urls = await Promise.all(
        wanted.map(({ prompt, orientation }) => generateOne(prompt, orientation ?? 'landscape', key))
      )
      // Drop any that failed so the model only gets usable URLs.
      return wanted
        .map((w, i) => ({ prompt: w.prompt, url: urls[i] }))
        .filter((r): r is { prompt: string; url: string } => !!r.url)
    },
  })
