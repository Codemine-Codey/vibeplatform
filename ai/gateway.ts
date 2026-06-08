import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

// Direct APIs — bypasses CF AI Gateway which adds ~12s latency per call
// CF Gateway kept only for DeepSeek fallback (less latency-sensitive)
const geminiProvider = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? '',
  // direct Google AI Studio — no gateway overhead
})

const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // direct Anthropic API — no gateway overhead
})

// DeepSeek fallback via CF Gateway (or direct if env var not set)
const deepseekProvider = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
})

export interface ModelOptions {
  model: LanguageModelV3
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerOptions?: Record<string, any>
}

const GEMINI_SAFE_OFF = [
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
] as const

export function getModelOptions(modelId: string): ModelOptions {
  if (modelId.startsWith('gemini')) {
    return {
      model: geminiProvider(modelId) as LanguageModelV3,
      providerOptions: {
        google: { safetySettings: GEMINI_SAFE_OFF },
      },
    }
  }
  if (modelId.startsWith('claude')) {
    return {
      model: anthropicProvider(modelId) as LanguageModelV3,
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    }
  }
  return { model: deepseekProvider.chat(modelId) }
}
