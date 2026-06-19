// Initial generation (orchestration + file content) uses Claude Sonnet 4.6 —
// far stronger first-shot code quality than DeepSeek Flash. Edits and error
// analysis stay on Flash (fast + cheap for surgical work).
export const DEFAULT_MODEL = 'claude-sonnet-4-6'
export const FILE_GENERATION_MODEL = 'claude-sonnet-4-6'
export const EDIT_MODEL = 'deepseek/deepseek-v4-flash'
export const ERROR_MODEL = 'deepseek/deepseek-v4-flash'

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
