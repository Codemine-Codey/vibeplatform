// Orchestration model — Kimi K2.6 (direct via KIMI_API_KEY, falls back to OpenRouter)
// Thinking mode disabled — adds 4+ min latency with no generation quality gain
export const DEFAULT_MODEL = 'kimi-k2.6'
export const FILE_GENERATION_MODEL = 'deepseek/deepseek-v4-flash'
export const EDIT_MODEL = 'deepseek/deepseek-v4-flash'

// Error analysis model — Claude Haiku 4.5 (precise at stack traces, visual check, error fixes)
export const ERROR_MODEL = 'claude-haiku-4-5-20251001'

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
