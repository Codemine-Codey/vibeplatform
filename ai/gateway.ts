import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { ITERATION_MODEL } from './constants'

// ── DeepSeek via Cloudflare AI Gateway (iterations, file gen, pipeline) ──────
// CF Gateway gives analytics + caching visibility dashboard.
// AI_GATEWAY_BASE_URL points to CF gateway DeepSeek endpoint.
// Falls back to DeepSeek direct API if env var is unset.
// DeepSeek native KV prompt caching is automatic at the API layer.

if (!process.env.DEEPSEEK_API_KEY) {
  throw new Error(
    'DEEPSEEK_API_KEY is not set. Add it to .env.local:\nDEEPSEEK_API_KEY=your-key-here'
  )
}

const deepseekProvider = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
})

// ── DeepSeek V4 Pro via OpenRouter (new project generation) ──────────────────
// User has OpenRouter credits. OpenRouter model ID: deepseek/deepseek-chat
// (OpenRouter's name for DeepSeek's flagship chat/pro model).
// No cache_control injection needed — DeepSeek handles caching natively.

const openRouterProvider = process.env.OPENROUTER_API_KEY
  ? createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      headers: {
        'HTTP-Referer': 'https://vibeplatform.vercel.app',
        'X-Title': 'Codemine',
      },
    })
  : null

if (!openRouterProvider) {
  console.warn(
    '[gateway] OPENROUTER_API_KEY not set — new project generation will use DeepSeek Flash'
  )
}

// ── Model option getters ────────────────────────────────────────────────────

export interface ModelOptions {
  model: LanguageModelV3
}

/** DeepSeek V4 Pro via OpenRouter for new project generation. Falls back to Flash if key missing. */
export function getOrchestrationModel(): ModelOptions {
  if (openRouterProvider) {
    return { model: openRouterProvider('deepseek/deepseek-chat') as unknown as LanguageModelV3 }
  }
  return { model: deepseekProvider.chat(ITERATION_MODEL) }
}

/** No fallback — DeepSeek Pro is reliable. Returns null to disable fallback logic. */
export function getFallbackModel(): ModelOptions | null {
  return null
}

/** DeepSeek V4 Flash via CF Gateway — iterations, edits, chat, errors, file gen, pipeline. */
export function getIterationModel(): ModelOptions {
  return { model: deepseekProvider.chat(ITERATION_MODEL) }
}

/** DeepSeek V4 Flash — file content generation (called from get-contents.ts). */
export function getModelOptions(modelId: string): ModelOptions {
  return { model: deepseekProvider.chat(modelId) }
}

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
