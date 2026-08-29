import { getCurrentUser } from '@/lib/supabase/server'
import { getRun, getRunEventsSince, isTerminalRunStatus } from '@/lib/runs'

// SHORT-POLL endpoint — the 740s-cap eliminator.
// GET /api/runs/:id/events?since=<seq>
//
// Unlike /stream (a long-lived SSE connection that Vercel kills at 740s, forcing
// reconnection), this returns a SMALL JSON snapshot and CLOSES IMMEDIATELY. The client
// polls it every ~1.5s until the run is terminal. Because no single request is ever
// long-lived, there is NO 740s boundary to hit and NO reconnection to orchestrate — the
// durable run (Vercel Workflow steps or the Trigger.dev task) keeps producing events into
// run_events, and the client simply keeps reading the next batch by cursor.
//
// Returns: { events: [{ seq, payload }], nextCursor, terminal }
// - events: run_events after `since`, in seq order (payload = the exact UIMessageChunk).
// - nextCursor: pass back as `since` on the next poll (monotonic, no re-processing).
// - terminal: true once the run status is done/error — the client stops polling.

export const maxDuration = 15 // a poll never needs more than a few seconds

const BATCH = 500

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: runId } = await params

  // Auth + ownership gate (same as /stream) — a run's events are private.
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const run = await getRun(runId)
  if (!run || run.user_id !== user.id) {
    // 404 (not 403) so a run's existence isn't leaked to non-owners.
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const sinceParam = Number(url.searchParams.get('since') ?? '0')
  const cursor = Number.isFinite(sinceParam) && sinceParam > 0 ? Math.floor(sinceParam) : 0

  const rows = await getRunEventsSince(runId, cursor, BATCH)
  let nextCursor = cursor
  const events = rows.map((ev) => {
    if (ev.seq > nextCursor) nextCursor = ev.seq
    return { seq: ev.seq, payload: ev.payload }
  })

  // Re-read status AFTER fetching events so we never report terminal while a final
  // event is still un-drained (client keeps polling until it has caught up AND terminal).
  const latest = await getRun(runId)
  const terminal = isTerminalRunStatus(latest?.status) && events.length < BATCH

  return new Response(JSON.stringify({ events, nextCursor, terminal }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
