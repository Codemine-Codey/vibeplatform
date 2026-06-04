import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

// DeepSeek via OpenAI-compatible API.
// Set AI_GATEWAY_BASE_URL to your Vercel AI Gateway URL to route through the gateway instead.
const deepseek = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
})

export interface ModelOptions {
  model: LanguageModelV3
}

export function getModelOptions(modelId: string): ModelOptions {
  return {
    model: deepseek(modelId),
  }
}
