// Initial generation (new project) — Claude Sonnet 4.6
export const ORCHESTRATION_MODEL = 'claude-sonnet-4-6'

// Rate-limit fallback for initial generation — Gemini 3.5 Flash
export const FALLBACK_MODEL = 'gemini-3.5-flash'

// Iterations, chat, edits, error analysis — DeepSeek V4 Flash
export const ITERATION_MODEL = 'deepseek-v4-flash'

// Nested file content generation — DeepSeek V4 Flash (fast, cheap)
export const FILE_GENERATION_MODEL = 'deepseek-v4-flash'

// Classifier + expander (pre-generation pipeline) — DeepSeek V4 Flash
export const PIPELINE_MODEL = 'deepseek-v4-flash'

// Only one model exposed in UI — users never pick a model
export const SUPPORTED_MODELS: string[] = [ORCHESTRATION_MODEL]

export const MODEL_NAMES: Record<string, string> = {
  [ORCHESTRATION_MODEL]: 'Builder',
  [FALLBACK_MODEL]: 'Builder',
  [ITERATION_MODEL]: 'Builder',
}

// Backwards-compat alias used by settings + any remaining references
export const DEFAULT_MODEL = ORCHESTRATION_MODEL

export const TEST_PROMPTS = [
  'Build a landing page for a Japanese sushi restaurant called Sakura',
  'Make a flappy bird game',
  'Create a task manager app with drag and drop',
]
