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
// OPENROUTER_PRO_MODEL: check openrouter.ai/models for the exact DeepSeek V4 Pro model ID
// Common format: deepseek/deepseek-v4-pro or deepseek/deepseek-chat
const openrouterApiKey = process.env.OPENROUTER_API_KEY
const openrouterProvider = openrouterApiKey
  ? createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openrouterApiKey,
      headers: {
        'HTTP-Referer': 'https://www.codemineapp.com',
        'X-Title': 'Codemine Builder',
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
