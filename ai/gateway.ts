import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

// Direct DeepSeek via OpenAI-compatible Chat Completions API.
// .chat() forces /v1/chat/completions — DeepSeek does not support /v1/responses.
const provider = createOpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
})

export interface ModelOptions {
  model: LanguageModelV3
}

export function getModelOptions(modelId: string): ModelOptions {
  return {
    model: provider.chat(modelId),
  }
}
