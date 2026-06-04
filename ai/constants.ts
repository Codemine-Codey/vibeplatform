// Orchestration model — used by the main agent to plan, decide tools, and direct the build
export const DEFAULT_MODEL = 'deepseek-v4-pro'

// File generation model — used by the nested generateFiles LLM call (cheaper + fast)
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
