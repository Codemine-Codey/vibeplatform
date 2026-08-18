#!/usr/bin/env node
// OpenRouter balance snapshot / per-build cost tool.
//
// WHY: "how much did that build cost?" — OpenRouter's balance is the GROUND TRUTH
// (per-token telemetry doesn't propagate through the workflow's stream transforms,
// so it under-reports). This tool snapshots remaining credits with a timestamp and,
// on the next run, prints the delta since the last snapshot = the exact spend of
// whatever happened in between. Isolates one build at a time (global balance), which
// is exactly the single-build test scenario we run.
//
// USAGE:
//   node scripts/or-cost.mjs            # snapshot now + show delta since last snapshot
//   node scripts/or-cost.mjs --mark A   # snapshot + tag it (e.g. "before flappy build")
//   node scripts/or-cost.mjs --reset    # clear the snapshot log
//
// Snapshots are appended to scripts/.or-cost-log.json (gitignored-safe: it's local).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOG = join(__dirname, '.or-cost-log.json')
const ENV = join(__dirname, '..', '.env.local')

function readKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  try {
    const txt = readFileSync(ENV, 'utf8')
    const m = txt.match(/^OPENROUTER_API_KEY=(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  } catch { /* ignore */ }
  return null
}

async function remainingCredits(key) {
  const res = await fetch('https://openrouter.ai/api/v1/credits', {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`OpenRouter /credits HTTP ${res.status}`)
  const { data } = await res.json()
  return {
    remaining: data.total_credits - data.total_usage,
    total: data.total_credits,
    usage: data.total_usage,
  }
}

function loadLog() {
  if (!existsSync(LOG)) return []
  try { return JSON.parse(readFileSync(LOG, 'utf8')) } catch { return [] }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--reset')) {
    writeFileSync(LOG, '[]')
    console.log('Snapshot log cleared.')
    return
  }
  const markIdx = args.indexOf('--mark')
  const mark = markIdx >= 0 ? (args[markIdx + 1] ?? '') : ''

  const key = readKey()
  if (!key) { console.error('No OPENROUTER_API_KEY (env or .env.local).'); process.exit(1) }

  const now = await remainingCredits(key)
  const log = loadLog()
  const prev = log[log.length - 1]

  console.log(`\n  OpenRouter remaining: $${now.remaining.toFixed(4)}  (used $${now.usage.toFixed(4)} of $${now.total.toFixed(2)})`)
  if (prev) {
    const spent = prev.remaining - now.remaining
    const since = prev.mark ? `"${prev.mark}"` : new Date(prev.at).toLocaleString()
    console.log(`  Since last snapshot (${since}):  $${spent.toFixed(4)} spent`)
  } else {
    console.log('  (first snapshot — run again after a build to see the delta)')
  }
  // Warn against the test floor the project runs by.
  if (now.remaining < 4) console.log(`  ⚠️  Below the $4 test floor — do not start live builds.`)

  log.push({ at: new Date().toISOString(), remaining: now.remaining, mark: mark || undefined })
  writeFileSync(LOG, JSON.stringify(log, null, 2))
  console.log('')
}

main().catch((e) => { console.error(e.message); process.exit(1) })
