import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

// AI Gateway account — separate from CF_ACCOUNT_ID (which is for Pages/D1/Workers API)
const GATEWAY_ACCOUNT = '8b557a24d9314c5895645b698428ea31'
const GATEWAY = `https://gateway.ai.cloudflare.com/v1/${GATEWAY_ACCOUNT}/codemine`

const geminiProvider = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? '',
  baseURL: `${GATEWAY}/google-ai-studio/v1beta`,
})

const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  baseURL: `${GATEWAY}/anthropic`,
})

// DeepSeek fallback — uses AI_GATEWAY_BASE_URL which points to the deepseek path
const deepseekProvider = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? `${GATEWAY}/deepseek`,
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
})

export interface ModelOptions {
  model: LanguageModelV3
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerOptions?: Record<string, any>
}

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
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    }
  }
  return { model: deepseekProvider.chat(modelId) }
}
