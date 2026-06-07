import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { DEFAULT_MODEL } from './constants'

const deepseekApiKey = process.env.DEEPSEEK_API_KEY
if (!deepseekApiKey) {
  throw new Error(
    'DEEPSEEK_API_KEY is not set. Add it to .env.local:\nDEEPSEEK_API_KEY=your-key-here'
  )
}

// DeepSeek via CF AI Gateway — used for Flash (file generation, classifier, expander)
// .chat() forces /v1/chat/completions — DeepSeek does not support /v1/responses
const deepseekProvider = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: deepseekApiKey,
})

// OpenRouter — used for the Pro model (main orchestration / new project generation)
const openrouterApiKey = process.env.OPENROUTER_API_KEY
const openrouterProvider = openrouterApiKey
  ? createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openrouterApiKey,
      headers: {
        'HTTP-Referer': 'https://www.codemineapp.com',
        'X-Title': 'Codemine Builder',
      },
      // Disable extended thinking/reasoning tokens on models like Kimi K2.6.
      // Without this, each orchestration step takes 20-30s and hits the 300s serverless limit.
      fetch: async (url, init) => {
        if (init?.body && typeof init.body === 'string') {
          try {
            const body = JSON.parse(init.body)
            body.include_reasoning = false
            return fetch(url, { ...init, body: JSON.stringify(body) })
          } catch {
            // fall through on parse failure
          }
        }
        return fetch(url, init as RequestInit)
      },
    })
  : null

export interface ModelOptions {
  model: LanguageModelV3
}

export function getModelOptions(modelId: string): ModelOptions {
  // Pro model (DEFAULT_MODEL) → OpenRouter, where the user has credits
  // Falls back to deepseekProvider if OPENROUTER_API_KEY is not set
  if (modelId === DEFAULT_MODEL && openrouterProvider) {
    const orModelId = process.env.OPENROUTER_PRO_MODEL ?? 'deepseek/deepseek-v4-pro'
    return { model: openrouterProvider.chat(orModelId) }
  }

  // Flash + all other models → CF AI Gateway → DeepSeek direct (cached, cheap)
  return {
    model: deepseekProvider.chat(modelId),
  }
}
