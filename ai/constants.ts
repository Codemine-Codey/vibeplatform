// Orchestration model — DeepSeek V4 Pro via OpenRouter (best design quality for planning + composition)
export const DEFAULT_MODEL = 'deepseek/deepseek-v4-pro'
export const FILE_GENERATION_MODEL = 'deepseek/deepseek-v4-flash'
export const EDIT_MODEL = 'deepseek/deepseek-v4-flash'

// Error analysis model — Claude Haiku 4.5 (precise at stack traces, visual check, error fixes)
export const ERROR_MODEL = 'claude-haiku-4-5-20251001'

export const SUPPORTED_MODELS: string[] = [DEFAULT_MODEL]

export const MODEL_NAMES: Record<string, string> = {
  'deepseek/deepseek-v4-flash': 'Builder',
  'claude-haiku-4-5-20251001': 'Builder',
}

export const TEST_PROMPTS = [
  'Build a landing page for a Japanese sushi restaurant called Sakura',
  'Make a flappy bird game',
  'Create a task manager app with drag and drop',
]
