import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

const deepseekApiKey = process.env.DEEPSEEK_API_KEY
if (!deepseekApiKey) {
  throw new Error(
    'DEEPSEEK_API_KEY is not set. Add it to .env.local:\nDEEPSEEK_API_KEY=your-key-here'
  )
}

// All AI calls route through CF AI Gateway → DeepSeek.
// CF Gateway URL: AI_GATEWAY_BASE_URL (set in .env.local + Vercel env vars).
// Falls back to DeepSeek direct if the env var is missing.
// .chat() forces /v1/chat/completions — DeepSeek does not support /v1/responses.
const deepseekProvider = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: deepseekApiKey,
})

export interface ModelOptions {
  model: LanguageModelV3
}

export function getModelOptions(modelId: string): ModelOptions {
  return { model: deepseekProvider.chat(modelId) }
}
