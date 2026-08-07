// Initial generation (orchestration + file content): DeepSeek V4 Pro via
// OpenRouter — top-tier first-try code quality (80.6% SWE-bench, ~Sonnet) at
// the cheapest price of any quality model ($0.435/$0.87 per M). 1M context,
// tool-calling, automatic prefix caching. Chosen for launch; revisit if speed
// needs the faster Gemini 3.5 Flash tier.
//   - Quality benchmark fallback: 'anthropic/claude-sonnet-4.6' (Sonnet, NEVER Opus).
//   - Speed tier option: 'google/gemini-3.5-flash'.
// DeepSeek V4 Pro — the chosen engine: top-tier code quality at $0.435/$0.87 per M
// (10x cheaper output than Gemini's $9/M), tool-calling, 1M context, auto caching
// (pinned to DeepSeek's infra in gateway.ts). Edits on Pro too (quality). Errors on
// Flash (cheap, fast). Speed comes from the single-page default + tight design law,
// not a pricier model.
// NOTE (2026-07): switched from the OpenRouter route (`deepseek/…`) to DeepSeek-DIRECT
// (`deepseek-…`, no slash → deepseekProvider in gateway.ts → api.deepseek.com). The
// OpenRouter key was revoked/depleted (401 "User not found" on inference), which stalled
// every build. DeepSeek-direct serves the SAME models (deepseek-v4-flash) with no
// hard rate limit. Keep IDs slashless so getModelOptions routes them to the direct provider.
//
// NOTE (2026-08-08): FILE_GENERATION_MODEL switched to Claude Sonnet 5 via OpenRouter.
// DeepSeek (Flash/Pro) generates correct code ~70% per-file; (0.70)^12 ≈ 1% full-project
// first-pass rate. Root cause: cross-file export contract violations — named vs default
// exports, import paths that don't match generated filenames. Claude Sonnet 5 is frontier-
// class with 1M context and produces cross-file consistent code by design. Thinking DISABLED
// via gateway.ts (reasoning:{enabled:false} + thinking:{type:'disabled'}) — no silent think
// phase. Cost: $2/$10 per M (input/output). Caching: cache_control:{type:'ephemeral'} in gateway.ts.
export const DEFAULT_MODEL = 'deepseek-v4-flash'
// Claude Sonnet 5 via OpenRouter — frontier-class, cross-file consistent code generation.
// Thinking disabled via gateway.ts. Caching via cache_control on system message.
// Reverted from anthropic/claude-sonnet-5 — OpenRouter promotional credits do not
// cover Anthropic models. Direct DeepSeek bypasses OpenRouter entirely (api.deepseek.com).
export const FILE_GENERATION_MODEL = 'deepseek-v4-flash'
export const EDIT_MODEL = 'deepseek-v4-flash'
export const ERROR_MODEL = 'deepseek-v4-flash'
// Orchestration + brief via direct DeepSeek ($2 balance, confirmed working).
// No slash = routes through deepseekProvider (api.deepseek.com directly).
export const ORCHESTRATION_MODEL = 'deepseek-v4-flash'
export const BRIEF_MODEL = 'deepseek-v4-flash'
// Screenshot QA "eyes" — sees the preview, judges broken/fine + design score 1-10.
// gemma-3-12b-it: $0.05/$0.15 per M, real image support, via OpenRouter (one key),
// and — unlike gpt-5-nano — does NOT require reasoning (our gateway disables it),
// verified to give accurate, design-aware reads. It only LOOKS; the strong code
// model does any fixing. (Anthropic Haiku was the old eyes — its credits are dead.)
export const VISION_MODEL = 'google/gemma-3-12b-it'

// Max output tokens per model family. Two separate constraints:
//  - Anthropic 400s if the value exceeds the model ceiling (Sonnet/Haiku 64K,
//    Opus/Fable 128K).
//  - OpenRouter RESERVES credits up-front for the full max_tokens, so an
//    oversized cap (e.g. 384K) fails with "requires more credits" even though
//    the call would never produce that many tokens. 64K comfortably covers any
//    single file or edit while keeping the credit reservation small.
export function getMaxOutputTokens(modelId: string): number {
  if (modelId.startsWith('claude-opus') || modelId.startsWith('claude-fable')) return 128000
  // DeepSeek V4 — MAX output is 384K (per DeepSeek platform spec). One-pass whole-project
  // generation needs the full ceiling so large modular sites fit in one response.
  if (modelId.startsWith('deepseek')) return 384000
  // GPT-5.6 Terra via OpenRouter — 1M context, generous output window. OpenRouter
  // reserves credits up-front for max_tokens, so cap at 64K to avoid over-reservation
  // while still comfortably covering any full-project generation (15 files × 400 lines
  // ≈ 45K tokens). The per-file recovery path refills anything truncated.
  if (modelId.includes('gpt-5') || modelId.includes('openai/')) return 64000
  // anthropic/ via OpenRouter — OpenRouter reserves credits upfront for max_tokens.
  // 32K is enough for any single project generation (15 files × ~300 lines ≈ 25K tokens)
  // while keeping the upfront reservation at $0.32 instead of $0.64.
  if (modelId.startsWith('anthropic/')) return 32000
  // claude sonnet/haiku and remaining OpenRouter models
  return 64000
}

export const SUPPORTED_MODELS: string[] = [DEFAULT_MODEL]

export const MODEL_NAMES: Record<string, string> = {
  'kimi-k2.6': 'Builder',
  'deepseek/deepseek-v4-flash-0731': 'Builder',
  'claude-haiku-4-5-20251001': 'Builder',
}

export const TEST_PROMPTS = [
  'Build a landing page for a Japanese sushi restaurant called Sakura',
  'Make a flappy bird game',
  'Create a task manager app with drag and drop',
]
