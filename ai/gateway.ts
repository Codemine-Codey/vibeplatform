import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import {
  FALLBACK_MODEL,
  ITERATION_MODEL,
  ORCHESTRATION_MODEL,
} from './constants'

// ── DeepSeek (iterations, file gen, pipeline) ──────────────────────────────
// Direct API — DeepSeek's native prompt caching operates at the model layer
// so no proxy needed. 99% of repeated prefixes (system + tools) are cached
// automatically on DeepSeek's side without any extra configuration.

if (!process.env.DEEPSEEK_API_KEY) {
  throw new Error(
    'DEEPSEEK_API_KEY is not set. Add it to .env.local:\nDEEPSEEK_API_KEY=your-key-here'
  )
}

const deepseekProvider = createOpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
})

// ── OpenRouter (Sonnet 4.6 + Gemini 3.5 Flash via single key) ────────────────
// Single billing, unified API. For Anthropic models we inject a top-level
// cache_control field so OpenRouter forwards Anthropic's native prompt caching —
// system prompt + tool definitions (~15k tokens) are cached across all 20 steps,
// reducing Sonnet input cost by ~90%.

const openRouterProvider = process.env.OPENROUTER_API_KEY
  ? createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      headers: {
        'HTTP-Referer': 'https://vibeplatform.vercel.app',
        'X-Title': 'Codemine',
      },
      fetch: async (url, options) => {
        // Inject top-level cache_control for Anthropic models:
        // OpenRouter forwards this to Anthropic's API as native prompt caching.
        if (options?.body && typeof options.body === 'string') {
          try {
            const body = JSON.parse(options.body) as Record<string, unknown>
            if (typeof body.model === 'string' && body.model.startsWith('anthropic/')) {
              body.cache_control = { type: 'ephemeral' }
              return globalThis.fetch(url.toString(), {
                ...(options as RequestInit),
                body: JSON.stringify(body),
              })
            }
          } catch {
            // Non-fatal — send unmodified on parse failure
          }
        }
        return globalThis.fetch(url.toString(), options as RequestInit)
      },
    })
  : null

if (!openRouterProvider) {
  console.warn(
    '[gateway] OPENROUTER_API_KEY not set — initial generation will use DeepSeek Flash until added'
  )
}

// ── Model option getters ────────────────────────────────────────────────────

export interface ModelOptions {
  model: LanguageModelV3
}

/** Claude Sonnet 4.6 for new project generation. Falls back to DeepSeek Flash if key missing. */
export function getOrchestrationModel(): ModelOptions {
  if (openRouterProvider) {
    // OpenRouter model ID format: provider/model-id
    return { model: openRouterProvider(`anthropic/${ORCHESTRATION_MODEL}`) as unknown as LanguageModelV3 }
  }
  return { model: deepseekProvider.chat(ITERATION_MODEL) }
}

/** Gemini 3.5 Flash for rate-limit fallback. Falls back to DeepSeek Flash if key missing. */
export function getFallbackModel(): ModelOptions {
  if (openRouterProvider) {
    return { model: openRouterProvider(`google/${FALLBACK_MODEL}`) as unknown as LanguageModelV3 }
  }
  return { model: deepseekProvider.chat(ITERATION_MODEL) }
}

/** DeepSeek V4 Flash — iterations, edits, chat, errors, file gen, pipeline. */
export function getIterationModel(): ModelOptions {
  return { model: deepseekProvider.chat(ITERATION_MODEL) }
}

/** DeepSeek V4 Flash — file content generation (called from get-contents.ts). */
export function getModelOptions(modelId: string): ModelOptions {
  return { model: deepseekProvider.chat(modelId) }
}

/** True if the OpenRouter key is present (Sonnet + Gemini are available). */
export const hasSonnet = !!openRouterProvider
export const hasGeminiFallback = !!openRouterProvider

/** Detect a rate-limit error from any provider (HTTP 429). */
export function isRateLimitError(err: unknown): boolean {
  if (!err) return false
  const e = err as Record<string, unknown>
  if (e.status === 429 || e.statusCode === 429) return true
  const msg = String(e.message ?? e.toString?.() ?? '').toLowerCase()
  return (
    msg.includes('rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('too many requests')
  )
}
