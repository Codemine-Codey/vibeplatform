import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import {
  FALLBACK_MODEL,
  FILE_GENERATION_MODEL,
  ITERATION_MODEL,
  ORCHESTRATION_MODEL,
} from './constants'

// ── DeepSeek (iterations, file gen, pipeline) ──────────────────────────────
// Routes through Cloudflare AI Gateway for analytics + caching.
// AI_GATEWAY_BASE_URL: set to CF gateway DeepSeek endpoint in production.

if (!process.env.DEEPSEEK_API_KEY) {
  throw new Error(
    'DEEPSEEK_API_KEY is not set. Add it to .env.local:\nDEEPSEEK_API_KEY=your-key-here'
  )
}

const deepseekProvider = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
})

// ── Anthropic (initial generation — Claude Sonnet 4.6) ─────────────────────
// Requires ANTHROPIC_API_KEY. If missing, falls back to DeepSeek Flash so
// the platform stays functional while keys are being added.

const anthropicProvider = process.env.ANTHROPIC_API_KEY
  ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

if (!anthropicProvider) {
  console.warn(
    '[gateway] ANTHROPIC_API_KEY not set — initial generation will use DeepSeek Flash until added'
  )
}

// ── Google (Gemini 3.5 Flash — rate-limit fallback) ────────────────────────
// Requires GOOGLE_AI_API_KEY. If missing, fallback uses DeepSeek Flash.

const googleProvider = process.env.GOOGLE_AI_API_KEY
  ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null

if (!googleProvider) {
  console.warn(
    '[gateway] GOOGLE_AI_API_KEY not set — Gemini fallback will use DeepSeek Flash until added'
  )
}

// ── Model option getters ────────────────────────────────────────────────────

export interface ModelOptions {
  model: LanguageModelV3
}

/** Claude Sonnet 4.6 for new project generation. Falls back to DeepSeek Flash if key missing. */
export function getOrchestrationModel(): ModelOptions {
  if (anthropicProvider) {
    return { model: anthropicProvider(ORCHESTRATION_MODEL) as unknown as LanguageModelV3 }
  }
  return { model: deepseekProvider.chat(ITERATION_MODEL) }
}

/** Gemini 3.5 Flash for rate-limit fallback. Falls back to DeepSeek Flash if key missing. */
export function getFallbackModel(): ModelOptions {
  if (googleProvider) {
    return { model: googleProvider(FALLBACK_MODEL) as unknown as LanguageModelV3 }
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

/** True if the Anthropic key is present and Sonnet will be used. */
export const hasSonnet = !!anthropicProvider

/** True if the Google key is present and Gemini fallback is active. */
export const hasGeminiFallback = !!googleProvider

/** Detect a rate-limit error from any provider (HTTP 429). */
export function isRateLimitError(err: unknown): boolean {
  if (!err) return false
  const e = err as Record<string, unknown>
  if (e.status === 429 || e.statusCode === 429) return true
  const msg = String(e.message ?? e.toString?.() ?? '').toLowerCase()
  return msg.includes('rate_limit') || msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')
}
