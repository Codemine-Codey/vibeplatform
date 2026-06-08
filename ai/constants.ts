// Primary model — Gemini 3.5 Flash via CF AI Gateway
// Used for: orchestration, planning, file writing, classifier, expander
export const DEFAULT_MODEL = 'gemini-3.5-flash'

// File generation model — same as primary (Gemini Flash is fast enough for both)
export const FILE_GENERATION_MODEL = 'gemini-3.5-flash'

// Error analysis model — Claude Haiku 4.5 (precise at reading stack traces + fixing code)
// Note: there is no Haiku 4.6 — latest is claude-haiku-4-5-20251001
export const ERROR_MODEL = 'claude-haiku-4-5-20251001'

// Fallback model — DeepSeek V4 Flash (cheapest, used if Gemini is unavailable)
export const FALLBACK_MODEL = 'deepseek-v4-flash'

export const SUPPORTED_MODELS: string[] = [DEFAULT_MODEL]

export const MODEL_NAMES: Record<string, string> = {
  'gemini-3.5-flash': 'Builder',
  'claude-haiku-4-5-20251001': 'Builder',
  'deepseek-v4-flash': 'Builder',
}

export const TEST_PROMPTS = [
  'Build a landing page for a Japanese sushi restaurant called Sakura',
  'Make a flappy bird game',
  'Create a task manager app with drag and drop',
]
