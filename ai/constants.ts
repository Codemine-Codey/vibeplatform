// Primary model — DeepSeek V4 Pro via OpenRouter (thinking disabled)
// Used for: orchestration, planning, classifier, expander, pipeline AI
export const DEFAULT_MODEL = 'deepseek/deepseek-v4-pro'

// File generation model — DeepSeek V4 Pro via OpenRouter (same model, thinking disabled)
// write_all_files: single structured call for all project files
export const FILE_GENERATION_MODEL = 'deepseek/deepseek-v4-pro'

// Edit model — Claude Haiku 4.5 for user edit turns (fast, surgical, cheap)
export const EDIT_MODEL = 'claude-haiku-4-5-20251001'

// Error analysis model — Claude Haiku 4.5 (precise at reading stack traces + fixing code)
export const ERROR_MODEL = 'claude-haiku-4-5-20251001'

export const SUPPORTED_MODELS: string[] = [DEFAULT_MODEL]

export const MODEL_NAMES: Record<string, string> = {
  'deepseek/deepseek-v4-pro': 'Builder',
  'claude-haiku-4-5-20251001': 'Builder',
}

export const TEST_PROMPTS = [
  'Build a landing page for a Japanese sushi restaurant called Sakura',
  'Make a flappy bird game',
  'Create a task manager app with drag and drop',
]
