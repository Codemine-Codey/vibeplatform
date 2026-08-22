// Shared OpenRouter balance reader — used by the e2e harness cost-watchdog and
// or-cost.mjs. OpenRouter's balance is the GROUND TRUTH for spend (per-token
// telemetry under-reports through the workflow stream transforms). Global balance,
// so "spend since start" is only isolated when ONE build runs at a time — exactly
// the single-build test scenario the harness runs.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV = join(__dirname, '..', '.env.local')

export function readOrKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  try {
    const txt = readFileSync(ENV, 'utf8')
    const m = txt.match(/^OPENROUTER_API_KEY=(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  } catch { /* ignore */ }
  return null
}

// Returns remaining USD (number) or null on any failure (fail-open: a flaky read
// must never falsely trip the kill or block a start).
export async function remainingUsd(key, timeoutMs = 6000) {
  const k = key || readOrKey()
  if (!k) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${k}` },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const { data } = await res.json()
    return data.total_credits - data.total_usage
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
