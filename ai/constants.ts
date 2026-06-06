// Initial generation (new project) — DeepSeek V4 Pro via OpenRouter
export const ORCHESTRATION_MODEL = 'deepseek-v4-pro'

// Iterations, chat, edits, error analysis — DeepSeek V4 Flash via CF Gateway
export const ITERATION_MODEL = 'deepseek-v4-flash'

// Nested file content generation — DeepSeek V4 Flash (fast, cheap)
export const FILE_GENERATION_MODEL = 'deepseek-v4-flash'

// Classifier + expander (pre-generation pipeline) — DeepSeek V4 Flash
export const PIPELINE_MODEL = 'deepseek-v4-flash'

// Only one model exposed in UI — users never pick a model
export const SUPPORTED_MODELS: string[] = [ORCHESTRATION_MODEL]

export const MODEL_NAMES: Record<string, string> = {
  [ORCHESTRATION_MODEL]: 'Builder',
  [ITERATION_MODEL]: 'Builder',
}

// Backwards-compat alias used by settings + any remaining references
export const DEFAULT_MODEL = ORCHESTRATION_MODEL

export const TEST_PROMPTS = [
  'Build a landing page for a Japanese sushi restaurant called Sakura',
  'Make a flappy bird game',
  'Create a task manager app with drag and drop',
]
