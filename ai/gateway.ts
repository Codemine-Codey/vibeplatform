import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { wrapLanguageModel } from 'ai'
import { metricsMiddleware } from '../lib/model-metrics'

// Wrap every model in the metrics middleware so each call logs a [cm-metrics]
// line centrally — no call site needs to know about instrumentation.
function instrument(model: LanguageModelV3, modelId: string): LanguageModelV3 {
  return wrapLanguageModel({ model, middleware: metricsMiddleware(modelId) }) as LanguageModelV3
}

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
        const m: string = typeof body.model === 'string' ? body.model : ''
        // Some models REQUIRE reasoning and reject any attempt to disable it
        // (Gemini, GPT-5, o-series). Leave those at the provider default; only
        // force-disable where reasoning is optional and just adds latency/cost
        // (DeepSeek, GLM, Kimi).
        if (!/gemini|gpt-5|openai\/o\d/i.test(m)) {
          body.reasoning = { enabled: false }
          body.include_reasoning = false
          body.thinking = { type: 'disabled' }
        }
        // Prompt-cache fix: OpenRouter load-balances DeepSeek across 16 providers,
        // so consecutive calls hit different instances and the cache never matches.
        // Pin to DeepSeek's own infrastructure (it does automatic prefix caching).
        // allow_fallbacks stays true so a DeepSeek outage doesn't fail the request —
        // we just lose the cache hit on that rare call.
        if (typeof body.model === 'string' && body.model.startsWith('deepseek/')) {
          body.provider = { order: ['DeepSeek'], allow_fallbacks: true }
        }
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

// Direct DeepSeek API — the PRIMARY generation path (2026-07). OpenRouter was retired
// after its key was revoked/depleted (401 on inference), stalling every build. DeepSeek's
// own API serves the same deepseek-v4-pro/-flash models with automatic prefix caching and
// no hard rate limit. Bypasses the old CF AI Gateway base (an OpenRouter-era endpoint that
// was never actually in the path); set DEEPSEEK_BASE_URL to reintroduce a gateway later.
const deepseekProvider = createOpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
  fetch: async (url, init) => {
    if (init?.body) {
      try {
        const body = JSON.parse(init.body as string)
        // DeepSeek V4 REASONS by default — 13-103s time-to-first-token as it thinks
        // silently before emitting any code. For bulk file generation + orchestration we
        // want speed, not a multi-minute think. Verified: `thinking:{type:'disabled'}` is
        // the ONLY flag that actually stops it (no reasoning_content, ~600ms TTFT); the
        // OpenRouter-era flags (reasoning:{enabled:false}, reasoning_effort, chat_template_
        // kwargs) do NOT work on the direct API.
        body.thinking = { type: 'disabled' }
        init = { ...init, body: JSON.stringify(body) }
      } catch { }
    }
    return fetch(url, init)
  },
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
    const base = process.env.KIMI_API_KEY
      ? kimiProvider.chat(modelId)
      : openrouterKimiProvider.chat(`moonshotai/${modelId}`)
    return { model: instrument(base as LanguageModelV3, modelId) }
  }
  // OpenRouter-hosted models (deepseek/, moonshotai/, meta-llama/, etc.)
  if (modelId.includes('/')) {
    // Reasoning-enabled path — only the design/planning step opts in
    const base = opts?.reasoning
      ? openrouterReasoningProvider.chat(modelId)
      : openrouterProvider.chat(modelId)
    return { model: instrument(base as LanguageModelV3, modelId) }
  }
  if (modelId.startsWith('claude')) {
    return {
      model: instrument(anthropicProvider(modelId) as LanguageModelV3, modelId),
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    }
  }
  // Direct DeepSeek (Flash) via CF AI Gateway
  return { model: instrument(deepseekProvider.chat(modelId) as LanguageModelV3, modelId) }
}
