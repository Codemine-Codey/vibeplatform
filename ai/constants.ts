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
// every build. DeepSeek-direct serves the SAME models (deepseek-v4-pro / -flash) with no
// hard rate limit. Keep IDs slashless so getModelOptions routes them to the direct provider.
export const DEFAULT_MODEL = 'deepseek-v4-pro'
export const FILE_GENERATION_MODEL = 'deepseek-v4-pro'
// Edits (changing copy, tweaking a component, fixing one thing) must be FAST — a
// small targeted change, not a full build. DeepSeek V4 Flash handles edits in seconds
// (Pro took minutes for a one-line copy change). Initial generation stays on Pro.
export const EDIT_MODEL = 'deepseek-v4-flash'
export const ERROR_MODEL = 'deepseek-v4-flash'
// Orchestration — CLASSIFY (skill + clarify). Part of the BUILD path, so on Pro too:
// Flash is reserved for edits + chat + error-fix triage ONLY, never initial build steps.
export const ORCHESTRATION_MODEL = 'deepseek-v4-pro'
// The BRIEF (expand prompt → archetype, palette, multi-page pageMap, signature moves,
// the whole design direction) is the DESIGN DNA of the build. It MUST be produced by the
// strong model — a weak model picks bland archetypes, skips the pageMap (→ single-page,
// basic), or fails the richer tool call and falls back to the generic default brief,
// which is exactly what makes results look "eh" no matter how good the design law is.
// Quality > speed: the extra ~20-30s on the brief is negligible at the full build budget.
export const BRIEF_MODEL = 'deepseek-v4-pro'
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
  // claude sonnet/haiku, deepseek flash, and other OpenRouter models
  return 64000
}

export const SUPPORTED_MODELS: string[] = [DEFAULT_MODEL]

export const MODEL_NAMES: Record<string, string> = {
  'kimi-k2.6': 'Builder',
  'deepseek/deepseek-v4-flash': 'Builder',
  'claude-haiku-4-5-20251001': 'Builder',
}

export const TEST_PROMPTS = [
  'Build a landing page for a Japanese sushi restaurant called Sakura',
  'Make a flappy bird game',
  'Create a task manager app with drag and drop',
]
