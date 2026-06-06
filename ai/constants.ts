// Orchestration model — DeepSeek v4 Pro via CF AI Gateway
export const DEFAULT_MODEL = 'deepseek-v4-pro'

// File generation model — cheaper + faster, used for nested file generation calls
export const FILE_GENERATION_MODEL = 'deepseek-v4-flash'

// Only one model exposed — users do not pick the model
export const SUPPORTED_MODELS: string[] = [DEFAULT_MODEL]

export const MODEL_NAMES: Record<string, string> = {
  [DEFAULT_MODEL]: 'Builder',
  [FILE_GENERATION_MODEL]: 'Builder',
}

export const TEST_PROMPTS = [
  'Build a landing page for a Japanese sushi restaurant called Sakura',
  'Make a flappy bird game',
  'Create a task manager app with drag and drop',
]
