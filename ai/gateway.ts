import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
})

// OpenRouter — DeepSeek V4 (Flash/Pro) and other non-Kimi models.
// Reasoning DISABLED by default — for bulk file generation and orchestration we
// want speed, not a multi-minute silent thinking phase. OpenRouter's correct
// control is `reasoning: { enabled: false }` (the older thinking/include_reasoning
// flags are kept as belt-and-suspenders for providers that read them).
const openrouterProvider = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  fetch: async (url, init) => {
    if (init?.body) {
      try {
        const body = JSON.parse(init.body as string)
        body.reasoning = { enabled: false }
        body.include_reasoning = false
        body.thinking = { type: 'disabled' }
        init = { ...init, body: JSON.stringify(body) }
      } catch { }
    }
    return fetch(url, init)
  },
})

// OpenRouter with reasoning ENABLED (effort: high) — used ONLY for the short
// design/planning step (expander). DeepSeek V4 Flash supports `reasoning: {effort}`
// with levels `high` and `xhigh`. The brief is a few hundred tokens, so the
// latency cost is small, but the design quality gain is large.
const openrouterReasoningProvider = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  fetch: async (url, init) => {
    if (init?.body) {
      try {
        const body = JSON.parse(init.body as string)
        body.reasoning = { effort: 'high' }
        delete body.include_reasoning
        delete body.thinking
        init = { ...init, body: JSON.stringify(body) }
      } catch { }
    }
    return fetch(url, init)
  },
})

// OpenRouter — Kimi K2.6 specifically.
// Kimi uses "thinking: {type: 'disabled'}" to turn off reasoning mode.
// include_reasoning: false alone does NOT stop Kimi from thinking — it
// just hides the tokens. Without disabling, Kimi thinks for 5+ minutes
// before making the first tool call.
const openrouterKimiProvider = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  fetch: async (url, init) => {
    if (init?.body) {
      try {
        const body = JSON.parse(init.body as string)
        body.include_reasoning = false
        body.thinking = { type: 'disabled' }
        init = { ...init, body: JSON.stringify(body) }
      } catch { }
    }
    return fetch(url, init)
  },
})

// Direct Kimi API (api.moonshot.ai) — used when KIMI_API_KEY is set.
// Thinking disabled via fetch wrapper — same reasoning as above.
const kimiProvider = createOpenAI({
  baseURL: 'https://api.moonshot.ai/v1',
  apiKey: process.env.KIMI_API_KEY ?? '',
  fetch: async (url, init) => {
    if (init?.body) {
      try {
        const body = JSON.parse(init.body as string)
        body.thinking = { type: 'disabled' }
        init = { ...init, body: JSON.stringify(body) }
      } catch { }
    }
    return fetch(url, init)
  },
})

// Direct DeepSeek API via CF AI Gateway (Flash for file generation + error analysis)
const deepseekProvider = createOpenAI({
  baseURL: process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
})

export interface ModelOptions {
  model: LanguageModelV3
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerOptions?: Record<string, any>
}

export function getModelOptions(
  modelId: string,
  opts?: { reasoning?: boolean }
): ModelOptions {
  // Kimi models — direct API when KIMI_API_KEY is set, OpenRouter otherwise
  // Both paths have thinking disabled to avoid 5+ min silent reasoning phases
  if (modelId.startsWith('kimi-')) {
    if (process.env.KIMI_API_KEY) {
      return { model: kimiProvider.chat(modelId) }
    }
    return { model: openrouterKimiProvider.chat(`moonshotai/${modelId}`) }
  }
  // OpenRouter-hosted models (deepseek/, moonshotai/, meta-llama/, etc.)
  if (modelId.includes('/')) {
    // Reasoning-enabled path — only the design/planning step opts in
    if (opts?.reasoning) {
      return { model: openrouterReasoningProvider.chat(modelId) }
    }
    return { model: openrouterProvider.chat(modelId) }
  }
  if (modelId.startsWith('claude')) {
    return {
      model: anthropicProvider(modelId) as LanguageModelV3,
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    }
  }
  // Direct DeepSeek (Flash) via CF AI Gateway
  return { model: deepseekProvider.chat(modelId) }
}
