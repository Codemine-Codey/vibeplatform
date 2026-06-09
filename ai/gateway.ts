import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
})

// OpenRouter — DeepSeek V4 Pro, Kimi K2.6, and any other OpenRouter-hosted models
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

// Direct Kimi API (api.moonshot.ai) — used when KIMI_API_KEY is set.
// Falls back to OpenRouter (moonshotai/kimi-k2.6) when key is absent.
const kimiProvider = createOpenAI({
  baseURL: 'https://api.moonshot.ai/v1',
  apiKey: process.env.KIMI_API_KEY ?? '',
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
  // Kimi models — direct API when KIMI_API_KEY is set, OpenRouter otherwise
  if (modelId.startsWith('kimi-')) {
    if (process.env.KIMI_API_KEY) {
      return { model: kimiProvider.chat(modelId) }
    }
    // Fallback: route through OpenRouter using the moonshotai/ namespace
    return { model: openrouterProvider.chat(`moonshotai/${modelId}`) }
  }
  // OpenRouter-hosted models (deepseek/, moonshotai/, meta-llama/, etc.)
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
