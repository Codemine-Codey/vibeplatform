import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
})

// OpenRouter — DeepSeek V4 Pro + any other OpenRouter-hosted models
// include_reasoning: false injected via fetch wrapper to disable extended thinking
const openrouterProvider = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  fetch: async (url, init) => {
    if (init?.body) {
      try {
        const body = JSON.parse(init.body as string)
        body.include_reasoning = false
        init = { ...init, body: JSON.stringify(body) }
      } catch {
        // Non-fatal — proceed with original body
      }
    }
    return fetch(url, init)
  },
})

// Direct DeepSeek API via CF AI Gateway (Flash model for error analysis fallback)
const deepseekProvider = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
})

export interface ModelOptions {
  model: LanguageModelV3
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerOptions?: Record<string, any>
}

export function getModelOptions(modelId: string): ModelOptions {
  // OpenRouter-hosted models (deepseek/, meta-llama/, etc.)
  if (modelId.includes('/')) {
    return { model: openrouterProvider.chat(modelId) }
  }
  if (modelId.startsWith('claude')) {
    return {
      model: anthropicProvider(modelId) as LanguageModelV3,
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    }
  }
  // Direct DeepSeek (Flash) via CF AI Gateway
  return { model: deepseekProvider.chat(modelId) }
}
