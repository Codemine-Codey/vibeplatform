import { NextResponse } from 'next/server'
import { getRun, computeRunMetrics } from '@/lib/runs'
import { getCurrentUser } from '@/lib/supabase/server'

// Durable-runs STEP 4: read the reliability metrics for one run (time-to-first-preview,
// total build time, phases planned/completed, tokens). The run + its event log ARE the
// source of truth — this just derives the numbers. Authed by the run's owner OR the
// internal secret (the deep-test harness). Never exposes another user's run.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const internal = process.env.CM_INTERNAL_SECRET
  const isInternal = !!internal && req.headers.get('x-cm-internal') === internal

  if (!isInternal) {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const run = await getRun(id)
    if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (run.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const metrics = await computeRunMetrics(id)
  if (!metrics) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(metrics)
}
