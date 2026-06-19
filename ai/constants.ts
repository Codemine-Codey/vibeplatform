// Initial generation (orchestration + file content) uses Claude Sonnet 4.6 —
// far stronger first-shot code quality than DeepSeek Flash. Edits and error
// analysis stay on Flash (fast + cheap for surgical work).
export const DEFAULT_MODEL = 'claude-sonnet-4-6'
export const FILE_GENERATION_MODEL = 'claude-sonnet-4-6'
export const EDIT_MODEL = 'deepseek/deepseek-v4-flash'
export const ERROR_MODEL = 'deepseek/deepseek-v4-flash'

// Max output tokens per model family — passing a value above a model's ceiling
// returns a 400. Sonnet 4.6 / Haiku cap at 64K; Opus/Fable at 128K; DeepSeek
// Flash supports up to 384K. Always derive the cap from the model in use.
export function getMaxOutputTokens(modelId: string): number {
  if (modelId.startsWith('claude-opus') || modelId.startsWith('claude-fable')) return 128000
  if (modelId.startsWith('claude')) return 64000 // sonnet 4.6, haiku 4.5
  return 384000 // deepseek flash + other OpenRouter models
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
