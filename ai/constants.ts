export const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash'
export const FILE_GENERATION_MODEL = 'deepseek/deepseek-v4-flash'
export const EDIT_MODEL = 'deepseek/deepseek-v4-flash'
export const ERROR_MODEL = 'deepseek/deepseek-v4-flash'

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
