import { NextResponse } from 'next/server'
import { listStuckContinuingRuns, fireContinuation } from '@/lib/runs'

// Durable-runs STEP 3: cron backstop. The primary continuation mechanism is the chained
// self-call inside waitUntil; this sweeper is the safety net for the rare case where that
// call never landed (the invocation was killed, a network blip, a cold deploy mid-chain).
// It re-fires continuation for any run stuck in `continuing` past the staleness cutoff.
// Chain + sweeper together = a run is NEVER orphaned mid-build.
//
// Wired to a 1/min Vercel cron (vercel.json). Authed by Vercel's CRON_SECRET bearer, or
// the internal secret for manual/triggered runs.

export const maxDuration = 60

function authorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`) return true
  const internal = process.env.CM_INTERNAL_SECRET
  if (internal && req.headers.get('x-cm-internal') === internal) return true
  return false
}

async function sweep(): Promise<Response> {
  // Runs stuck >2 min are considered dropped (a live chain updates the row well within
  // that). Re-fire each; claimRunForContinuation inside /continue guards double-processing.
  const stuck = await listStuckContinuingRuns(120_000, 20)
  await Promise.all(stuck.map((r) => fireContinuation(r.id)))
  return NextResponse.json({ ok: true, refired: stuck.length })
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return sweep()
}

// POST allowed too (for manual triggering with the internal secret).
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return sweep()
}
