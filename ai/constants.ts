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
// All models route through OpenRouter (OPENROUTER_API_KEY).
// Direct DeepSeek (api.deepseek.com) confirmed dead — 402 Insufficient Balance
// via /api/diag 2026-08-08. Slash prefix = openrouterProvider in gateway.ts.
// Pinned to the official DATED slug (…-20260731) for launch stability — the undated
// alias floats to whatever DeepSeek ships next and can silently change the provider pool.
export const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash-0731'
// Kimi K2.6 via OpenRouter: purpose-built for agentic multi-file coding (swarm-trained, single API call).
// SWE-bench Pro #1 (58.6%), LiveCodeBench 89.6%. $0.60/$2.50 per M → ~$0.33/build vs $1.29 with Sonnet 5.
// Fallback: CM_FILE_MODEL=deepseek/deepseek-v4-pro-0813 for the proven AKAMI $0.45 path.
// A/B env-overridable without a code change (set CM_FILE_MODEL in Vercel dashboard).
// Kimi K2.6 via DIRECT Moonshot API (api.moonshot.ai) — cheapest path + native prompt
// caching. The 'kimi-' prefix (no 'moonshotai/') routes getModelOptions → kimiProvider
// (direct) when KIMI_API_KEY is set; falls back to OpenRouter's moonshotai/ path if the
// key is absent. CM_FILE_MODEL env override kept as a deliberate A/B lever ONLY — the
// prod value that silently forced GPT-5.6 Terra ($15/M) has been removed (2026-08-29).
export const FILE_GENERATION_MODEL = process.env.CM_FILE_MODEL || 'kimi-k2.6'
// Generation FALLBACK: if the direct Kimi call fails, retry on DeepSeek V4 Pro via
// OpenRouter (quality-class, ~$1.32/$3.96 per M). Never falls back to a premium model.
export const FILE_GENERATION_FALLBACK_MODEL = process.env.CM_FILE_FALLBACK || 'deepseek/deepseek-v4-pro-0813'
export const EDIT_MODEL = 'deepseek/deepseek-v4-flash-0731'
export const ERROR_MODEL = 'deepseek/deepseek-v4-flash-0731'
export const ORCHESTRATION_MODEL = 'deepseek/deepseek-v4-flash-0731'
export const BRIEF_MODEL = 'deepseek/deepseek-v4-flash-0731'
// Single-file repairs + missing-file generation. These are NARROW, error-driven
// tasks (the model gets the exact error + the full file) — they do NOT need the
// frontier cross-file reasoning that initial whole-project generation needs. The
// repair helpers in sandbox-util.ts were originally written for Flash ("Ask Flash
// to repair ONE file"); pointing them at FILE_GENERATION_MODEL silently upgraded
// every repair to Sonnet 5 at 20x the cost. This restores the cheap model for the
// 10+ repair calls a single build can make — the biggest sustainability lever.
export const REPAIR_MODEL = 'deepseek/deepseek-v4-flash-0731'
// FAN-OUT leaf model: Sonnet 5 writes the SPINE (App/Layout/pages/data/types/index.css — cross-file
// reasoning), DeepSeek v4 PRO writes the LEAF sections (src/components/sections/* — self-contained UI
// against the spine's pinned contract). Cuts the Sonnet output ~in half → big cost drop on the
// initial build, while the spine keeps design + cross-file consistency. Website-only.
export const LEAF_MODEL = process.env.CM_LEAF_MODEL || 'deepseek/deepseek-v4-pro-0813'
// ── AKAMI RECIPE (user's PROVEN $0.4-0.5 perfect-design architecture) ──────────
// ROLE-BASED split (NOT the file-based leaf fan-out above, which drifted): the SKELETON model does
// the light structural/design work (plan + per-file skeletons: exports, imports, section layout,
// minimal bodies — where DESIGN TASTE lives, few tokens = cheap), then the CODE model fills each
// skeleton body with real content (the bulk, cheap per token). Because the skeleton model defines
// every export/import/prop contract first, the code-fill CANNOT drift. Env-overridable so the split
// is testable without a redeploy. Default: Sonnet 5 skeleton, DeepSeek v4 Pro code.
// Default OFF Sonnet 5 (2026-08-29): this AKAMI role-split recipe is opt-in and NOT wired
// into the active pipeline, but a $10/M model must never sit as a default (that class of
// leftover forced the GPT-5.6 Terra cost catastrophe). Skeleton work = light structural/design
// planning → Kimi K2.6 is more than capable at a fraction of the price.
export const SKELETON_MODEL = process.env.CM_SKELETON_MODEL || 'kimi-k2.6'
export const CODE_MODEL = process.env.CM_CODE_MODEL || 'deepseek/deepseek-v4-pro-0813'
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
  // Kimi K2.6 (direct Moonshot). Measured 2026-08-29: a 64000 cap makes Moonshot-direct
  // stream ~45% SLOWER (24 vs 35 tok/s) — the oversized ceiling itself hurts throughput,
  // and direct Moonshot has NO up-front credit reservation to justify a large cap. 24K
  // comfortably covers a whole website's files in one pass (~10-15K output tokens) with
  // headroom; if a large multi-page build ever exceeds it, the stepGenerate2 continuation
  // loop completes the remaining files. Do NOT drop to 4K — that truncates whole-project gen.
  if (modelId.startsWith('kimi') || modelId.includes('/kimi')) return 24000
  // DeepSeek V4 via OpenRouter. OpenRouter RESERVES credits upfront for the full
  // max_tokens (a 384K cap reserves ~$0.33/call and, under concurrency, spuriously
  // throws "Insufficient Balance"). Direct DeepSeek (which had no reservation and
  // needed 384K for one-pass whole-project gen) is dead — every deepseek call now
  // goes through OpenRouter and only does orchestration + single-file repairs, which
  // never need more than 64K. Whole-project generation is Claude's job now.
  if (modelId.startsWith('deepseek') || modelId.includes('/deepseek')) return 64000
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
