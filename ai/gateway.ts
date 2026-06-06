import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

const apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) {
  throw new Error(
    'DEEPSEEK_API_KEY is not set. Add it to .env.local:\nDEEPSEEK_API_KEY=your-key-here'
  )
}

// Routes through Cloudflare AI Gateway for analytics + caching visibility.
// AI_GATEWAY_BASE_URL: set to CF gateway DeepSeek endpoint in .env.local.
// Falls back to DeepSeek direct API if env var is unset.
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
