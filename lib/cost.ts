// ── Cost guardrails ───────────────────────────────────────────────────────────
// OpenRouter balance is the GROUND TRUTH for spend (per-token telemetry under-reports
// because it doesn't propagate through the workflow's stream transforms). These helpers
// let the pipeline read remaining credits so it can mechanically refuse to START a build
// when the balance is below a configured floor — the safe, no-workflow-surgery half of
// the user's kill-cap ask. Everything here is ENV-GATED and OFF by default, so production
// (funded, paying users) is unaffected; it's a test-balance protection you opt into.

export async function getOpenRouterRemaining(): Promise<number | null> {
  try {
    const key = process.env.OPENROUTER_API_KEY
    if (!key) return null
    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${key}` },
      // never let a slow billing endpoint stall a build request
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { total_credits?: unknown; total_usage?: unknown } }
    const total = json?.data?.total_credits
    const usage = json?.data?.total_usage
    if (typeof total !== 'number' || typeof usage !== 'number') return null
    return total - usage
  } catch {
    return null // FAIL-OPEN: a flaky balance read must NEVER block a build
  }
}

// Moonshot (direct Kimi) balance — the GENERATION provider now that file gen runs on
// kimi-k2.6 via api.moonshot.ai. Same fail-open contract as OpenRouter's reader.
export async function getMoonshotRemaining(): Promise<number | null> {
  try {
    const key = process.env.KIMI_API_KEY
    if (!key) return null
    const res = await fetch('https://api.moonshot.ai/v1/users/me/balance', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { available_balance?: unknown } }
    const bal = json?.data?.available_balance
    return typeof bal === 'number' ? bal : null
  } catch {
    return null // FAIL-OPEN
  }
}

// Reads the balance of whichever provider bears the GENERATION cost, based on the active
// generation model id. Kimi → Moonshot; anything else (deepseek/…) → OpenRouter. This is
// the fix for a stale gate that guarded OpenRouter after generation moved to Moonshot —
// it would block every build on a low OpenRouter balance even though Moonshot was funded.
export async function getGenerationProviderRemaining(genModelId: string): Promise<{ provider: string; remaining: number | null }> {
  if (/kimi/i.test(genModelId)) return { provider: 'moonshot', remaining: await getMoonshotRemaining() }
  return { provider: 'openrouter', remaining: await getOpenRouterRemaining() }
}

// Minimum remaining balance required to START a new build, in USD. 0/unset = disabled
// (production default). Set CM_MIN_START_BALANCE_USD=4 to enforce the test floor.
// This floor now applies to the GENERATION provider (Moonshot for Kimi).
export function minStartBalanceUsd(): number {
  const v = Number(process.env.CM_MIN_START_BALANCE_USD ?? '0')
  return Number.isFinite(v) && v > 0 ? v : 0
}

// Small secondary floor on OpenRouter — it still does the cheap orchestration/repair calls,
// so a bone-dry OpenRouter would stall a build mid-way. Default $0.20 (orchestration for one
// build is ~$0.10-0.15). Only enforced when the generation provider is NOT OpenRouter.
export function minOrchBalanceUsd(): number {
  const v = Number(process.env.CM_MIN_ORCH_BALANCE_USD ?? '0.20')
  return Number.isFinite(v) && v > 0 ? v : 0
}
