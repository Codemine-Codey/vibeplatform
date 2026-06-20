// Phase 2 — hard read cap (enforced in code, not the prompt).
//
// The soft prompt rule "don't read too much" is routinely ignored, so the loop
// guard must live in code. We count read ROUND-TRIPS per workspace (a batched
// readFiles is ONE round-trip no matter how many files it fetches, which is the
// behaviour we want to reward). Past the cap, reads stop being served and the
// model is told to make its edit — converting a runaway 6-read thrash into a
// bounded, predictable cost.
//
// Fail-safe (per design): the cap is generous (READ_CAP round-trips) and the
// over-cap message points the model to grepCode / making the edit, never to a
// blind write. Combined with batched readFiles, no legitimate edit reaches it.
// A write (patchFile / generateFiles) resets the budget — that's a new edit cycle.

const READ_CAP = 5
const WINDOW_MS = 120_000 // a fresh turn after 2 min idle resets the budget

const budgets = new Map<string, { count: number; ts: number }>()

export function recordRead(sandboxId: string): { allowed: boolean; count: number } {
  const now = Date.now()
  const entry = budgets.get(sandboxId)
  if (!entry || now - entry.ts > WINDOW_MS) {
    budgets.set(sandboxId, { count: 1, ts: now })
    return { allowed: true, count: 1 }
  }
  entry.count += 1
  entry.ts = now
  return { allowed: entry.count <= READ_CAP, count: entry.count }
}

export function resetReadBudget(sandboxId: string): void {
  budgets.delete(sandboxId)
}

export { READ_CAP }
