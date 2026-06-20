import { AsyncLocalStorage } from 'node:async_hooks'

// Per-generation token accumulator. runPipeline runs inside tokenStore.run({...}),
// and the model-metrics middleware adds each call's tokens via addTokens — so the
// total flows up without threading it through every function. Read it after the
// pipeline returns to record tokens_used on the project row.
export const tokenStore = new AsyncLocalStorage<{ total: number }>()

export function addTokens(n: number): void {
  const store = tokenStore.getStore()
  if (store && Number.isFinite(n) && n > 0) store.total += n
}
