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
    // Diagnostic: log key shape so we can confirm no stray quotes/newlines in prod.
    // Remove after confirming key is clean in Vercel.
    const _k = process.env.OPENROUTER_API_KEY ?? ''
    console.log(`[cm-keydiag] len=${_k.length} first10="${_k.slice(0,10)}" startsQuote=${_k.startsWith('"')} endsQuote=${_k.endsWith('"')} endsNewline=${_k.endsWith('\n')}`)
    if (init?.body) {
      try {
        const body = JSON.parse(init.body as string)
        const m: string = typeof body.model === 'string' ? body.model : ''
        // Some models REQUIRE reasoning and reject any attempt to disable it — Gemini,
        // o-series (o1/o3/o4), AND qwen3.x-max (OpenRouter returns HTTP 400 "Reasoning is
        // mandatory for this endpoint and cannot be disabled" — this silently killed every
        // Qwen file-generation call → empty build → 20-min reveal-gate stall). Leave those at
        // the provider default. GPT-5.6 Terra is NOT in this set — it supports reasoning off
        // and we must disable it to avoid 3-8 minute silent think phases.
        if (!/gemini|openai\/o\d|qwen/i.test(m)) {
          body.reasoning = { enabled: false }
          body.include_reasoning = false
          body.thinking = { type: 'disabled' }
        }
        // Prompt-cache fix: OpenRouter load-balances across many providers, so
        // consecutive calls can hit different instances and bust the cache.
        // Pin each model family to its own infrastructure where prefix caching
        // is automatic. allow_fallbacks keeps availability high.
        if (typeof body.model === 'string') {
          if (body.model.startsWith('deepseek/')) {
            if (/-pro/.test(body.model)) {
              // PRO = the fan-out LEAF model. The big reused prefix (design context + spine files) is
              // sent on every leaf call, so pin to caching-capable providers in cost order so
              // consecutive leaf calls hit the SAME provider's prompt cache (measured: GMICloud caches
              // ~99% of a large prefix; DeepSeek first-party is cheapest cache-read). allow_fallbacks
              // keeps the build alive (uncached) if all preferred are down.
              body.provider = { order: ['DeepSeek', 'GMICloud', 'Fireworks'], allow_fallbacks: true }
            } else {
              // FLASH = orchestration/edits/repairs — speed-critical + cheap. Route by throughput;
              // the old order:['DeepSeek'] pin fell back to Baidu at ~5 tok/s and stalled the handoff.
              body.provider = { sort: 'throughput', allow_fallbacks: true }
            }
          } else if (body.model.startsWith('openai/')) {
            // OpenAI's infra does automatic prompt caching for prompts ≥ 1024 tokens.
            // Pin to OpenAI to guarantee cache hits rather than routing to an Azure
            // or third-party mirror that may not cache.
            body.provider = { order: ['OpenAI'], allow_fallbacks: true }
          } else if (body.model.startsWith('anthropic/')) {
            // Pin to Anthropic's own infra (not Azure or third-party mirrors).
            // Also inject cache_control into the system message so Anthropic's prompt
            // caching activates — OpenRouter passes cache_control through to Anthropic
            // automatically when the message content is in structured array format.
            body.provider = { order: ['Anthropic'], allow_fallbacks: false }
            if (Array.isArray(body.messages)) {
              for (const msg of body.messages) {
                if (msg.role === 'system' && typeof msg.content === 'string') {
                  msg.content = [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }]
                }
              }
            }
          }
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

// OpenRouter — Kimi K2.6, thinking DISABLED (repairs / orchestration / edits).
// include_reasoning:false alone does NOT stop Kimi from thinking — it just hides
// the tokens. Without disabling, Kimi thinks for 5+ minutes before the first tool call.
// Provider pinned to Moonshot (first-party) so consecutive calls share the same
// prefix cache — same technique as DeepSeek Pro pin to GMICloud.
const openrouterKimiProvider = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  fetch: async (url, init) => {
    if (init?.body) {
      try {
        const body = JSON.parse(init.body as string)
        body.include_reasoning = false
        body.thinking = { type: 'disabled' }
        // Pin to Moonshot's own infra for prefix caching. allow_fallbacks:false is CRITICAL —
        // if Moonshot is degraded, OpenRouter would silently fall back to whatever model it
        // picks (e.g. GPT-5.6 Terra at $15/M output), burning credits invisibly. Better to
        // fail fast with an error than silently rack up a $3+ tab on an unintended model.
        body.provider = { order: ['Moonshot'], allow_fallbacks: false }
        // Inject cache_control into the system message so Moonshot's prompt cache
        // activates on the large shared system prompt prefix.
        if (Array.isArray(body.messages)) {
          for (const msg of body.messages) {
            if (msg.role === 'system' && typeof msg.content === 'string') {
              msg.content = [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }]
            }
          }
        }
        init = { ...init, body: JSON.stringify(body) }
      } catch { }
    }
    return fetch(url, init)
  },
})

// OpenRouter — Kimi K2.6 with LIMITED thinking budget (initial file generation only).
// Budget: 4 000 tokens (~$0.002 overhead per call, negligible). Large enough for
// Kimi to plan cross-file contracts (which exports each file needs, which imports
// point where) before writing — the exact step that caused the (0.7)^12 ≈ 1%
// first-pass rate on DeepSeek. include_reasoning:false hides the thinking tokens
// from our stream so there's zero output overhead; only the quality improves.
// Provider pinned to Moonshot for prefix caching (same as the non-reasoning path).
const openrouterKimiReasoningProvider = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  fetch: async (url, init) => {
    if (init?.body) {
      try {
        const body = JSON.parse(init.body as string)
        body.thinking = { type: 'enabled', budget_tokens: 4000 }
        body.include_reasoning = false
        // allow_fallbacks:false — same reason as non-reasoning Kimi path: a fallback to
        // GPT-5.6 Terra or similar would cost 6x more and the user has no visibility.
        body.provider = { order: ['Moonshot'], allow_fallbacks: false }
        if (Array.isArray(body.messages)) {
          for (const msg of body.messages) {
            if (msg.role === 'system' && typeof msg.content === 'string') {
              msg.content = [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }]
            }
          }
        }
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

// Direct DeepSeek WITH thinking ON — used ONLY for the design BRIEF + planning, where a
// short deliberate think measurably improves the archetype/palette/page-plan decisions.
// Per DeepSeek's API docs: thinking is enabled via `thinking:{type:'enabled'}`; effort is
// `reasoning_effort` — but low/medium both MAP TO high, so "medium" == high here (only
// high + max are distinct). We use high (the sensible default). Thinking mode does NOT
// support temperature/top_p/presence_penalty/frequency_penalty, so we strip them.
const deepseekReasoningProvider = createOpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
  fetch: async (url, init) => {
    if (init?.body) {
      try {
        const body = JSON.parse(init.body as string)
        body.thinking = { type: 'enabled' }
        body.reasoning_effort = 'high' // low/medium → high on DeepSeek; high is the effective "medium"
        delete body.temperature
        delete body.top_p
        delete body.presence_penalty
        delete body.frequency_penalty
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
  // Kimi K2.6 via OpenRouter — dedicated provider paths (thinking control differs from other OR models)
  if (modelId.startsWith('moonshotai/')) {
    // reasoning:true = initial file generation → limited thinking budget (cross-file planning)
    // reasoning:false = repairs/edits/orchestration → thinking disabled (speed)
    const base = opts?.reasoning
      ? openrouterKimiReasoningProvider.chat(modelId)
      : openrouterKimiProvider.chat(modelId)
    return { model: instrument(base as LanguageModelV3, modelId) }
  }
  // OpenRouter-hosted models (anthropic/, deepseek/, meta-llama/, google/, openai/, etc.)
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
  // Direct DeepSeek. Brief/planning opt into thinking (reasoning:true) via the
  // reasoning provider; everything else stays on the fast thinking-disabled provider.
  const provider = opts?.reasoning ? deepseekReasoningProvider : deepseekProvider
  return { model: instrument(provider.chat(modelId) as LanguageModelV3, modelId) }
}
