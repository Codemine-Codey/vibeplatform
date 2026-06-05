import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

const apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) {
  throw new Error(
    'DEEPSEEK_API_KEY is not set. Add it to .env.local:\nDEEPSEEK_API_KEY=your-key-here'
  )
}

// AI_GATEWAY_BASE_URL: set to Cloudflare AI Gateway URL at launch (free, zero code change).
// Local dev: uses DeepSeek directly.
// .chat() forces /v1/chat/completions — DeepSeek does not support /v1/responses.
const provider = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey,
})

export interface ModelOptions {
  model: LanguageModelV3
}

export function getModelOptions(modelId: string): ModelOptions {
  return {
    model: provider.chat(modelId),
  }
}
