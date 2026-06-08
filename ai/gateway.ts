import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? '77da4568eb934dee94fa9fc54faec977'
const CF_BASE = `https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/codemine`

// Gemini via CF AI Gateway → Google AI Studio
const geminiProvider = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? '',
  baseURL: `${CF_BASE}/google-ai-studio/v1beta`,
})

// Claude via CF AI Gateway → Anthropic
const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  baseURL: `${CF_BASE}/anthropic`,
})

// DeepSeek via CF AI Gateway — fallback model
const deepseekProvider = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
})

export interface ModelOptions {
  model: LanguageModelV3
}

export function getModelOptions(modelId: string): ModelOptions {
  if (modelId.startsWith('gemini')) {
    return { model: geminiProvider(modelId) as LanguageModelV3 }
  }
  if (modelId.startsWith('claude')) {
    return { model: anthropicProvider(modelId) as LanguageModelV3 }
  }
  // DeepSeek (fallback)
  return { model: deepseekProvider.chat(modelId) }
}
