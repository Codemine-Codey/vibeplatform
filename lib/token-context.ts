import { AsyncLocalStorage } from 'node:async_hooks'

// Per-generation token + cost accumulator. runPipeline runs inside tokenStore.run({...}),
// and the model-metrics middleware adds each call's tokens via addTokens — so the
// total flows up without threading it through every function.
export const tokenStore = new AsyncLocalStorage<{ total: number; costUsd: number }>()

export function addTokens(n: number): void {
  const store = tokenStore.getStore()
  if (store && Number.isFinite(n) && n > 0) store.total += n
}

// Approximate cost per million tokens (input / output) by model family.
// Used for the per-generation kill cap. Prices are conservative (use peak rates).
const PRICING: Array<{ pattern: RegExp; inputPerM: number; outputPerM: number }> = [
  // Matches BOTH the OpenRouter id (moonshotai/kimi-k2.6) AND the direct Moonshot id (kimi-k2.6),
  // so the kill cap measures REAL Kimi cost instead of falling through to the Pro-rate default.
  { pattern: /kimi/i,                      inputPerM: 0.60,  outputPerM: 2.50  },
  { pattern: /deepseek.*v4-pro/i,          inputPerM: 1.32,  outputPerM: 3.96  },
  { pattern: /deepseek.*v4-flash/i,        inputPerM: 0.22,  outputPerM: 0.66  },
  { pattern: /anthropic\/claude-sonnet-5/, inputPerM: 2.00,  outputPerM: 10.00 },
  { pattern: /anthropic\/claude-sonnet/i,  inputPerM: 2.00,  outputPerM: 10.00 },
  { pattern: /google\/gemma/i,             inputPerM: 0.05,  outputPerM: 0.15  },
  // GPT-5.6 Terra/Luna: $5/$15 per M (conservative estimate).
  // Listed explicitly so the kill cap fires correctly if OpenRouter ever routes here.
  { pattern: /gpt-5\.6|openai\/gpt-5/i,   inputPerM: 5.00,  outputPerM: 15.00 },
  { pattern: /openai\//i,                  inputPerM: 5.00,  outputPerM: 15.00 },
]

function modelCost(modelId: string, inputTokens: number, outputTokens: number): number {
  for (const { pattern, inputPerM, outputPerM } of PRICING) {
    if (pattern.test(modelId)) {
      return (inputTokens * inputPerM + outputTokens * outputPerM) / 1_000_000
    }
  }
  // Unknown model — use a conservative default (DeepSeek Pro rates)
  return (inputTokens * 1.32 + outputTokens * 3.96) / 1_000_000
}

export function addCost(modelId: string, inputTokens: number, outputTokens: number): void {
  const store = tokenStore.getStore()
  if (!store) return
  store.costUsd += modelCost(modelId, inputTokens, outputTokens)
}

// Returns true if the accumulated cost has NOT exceeded the kill cap.
// Cap defaults to COST_KILL_CAP env var, then $0.70. Call before expensive
// operations (repair loops, QA passes) to abort gracefully rather than overbill.
export function withinCostBudget(): boolean {
  const store = tokenStore.getStore()
  if (!store) return true
  const cap = parseFloat(process.env.COST_KILL_CAP ?? '0.70')
  return store.costUsd < cap
}

export function currentCostUsd(): number {
  return tokenStore.getStore()?.costUsd ?? 0
}
