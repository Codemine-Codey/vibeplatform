import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? '77da4568eb934dee94fa9fc54faec977'
const CF_BASE = `https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/codemine`

const geminiProvider = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? '',
  baseURL: `${CF_BASE}/google-ai-studio/v1beta`,
})

const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  baseURL: `${CF_BASE}/anthropic`,
})

const deepseekProvider = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
})

export interface ModelOptions {
  model: LanguageModelV3
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerOptions?: Record<string, any>
}

// Gemini safety settings: disable all filters so web apps/games aren't blocked mid-generation
const GEMINI_SAFE_OFF = [
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
] as const

export function getModelOptions(modelId: string): ModelOptions {
  if (modelId.startsWith('gemini')) {
    return {
      model: geminiProvider(modelId) as LanguageModelV3,
      providerOptions: {
        google: { safetySettings: GEMINI_SAFE_OFF },
      },
    }
  }
  if (modelId.startsWith('claude')) {
    return {
      model: anthropicProvider(modelId) as LanguageModelV3,
      // ephemeral cache on system prompt — Anthropic reuses it for 5 min across requests
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    }
  }
  return { model: deepseekProvider.chat(modelId) }
}
