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

// Minimum remaining balance required to START a new build, in USD. 0/unset = disabled
// (production default). Set CM_MIN_START_BALANCE_USD=4 to enforce the test floor.
export function minStartBalanceUsd(): number {
  const v = Number(process.env.CM_MIN_START_BALANCE_USD ?? '0')
  return Number.isFinite(v) && v > 0 ? v : 0
}
