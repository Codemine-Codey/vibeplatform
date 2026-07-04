import { getCurrentUser } from '@/lib/supabase/server'
import { getRun, getRunEventsSince, isTerminalRunStatus } from '@/lib/runs'

// Durable-runs STEP 1 — reconnect / replay stream.
// GET /api/runs/:id/stream?since=<seq>
//
// Auth-gated (the signed-in user must OWN the run). Replays the canonical run_events
// log from the `since` cursor (default 0), then LIVE-TAILS by polling the log ~every
// 1s and emitting new events, until the run reaches a terminal status (done/error) or
// the client disconnects. Uses the SAME SSE framing the chat client already
// understands: each event payload is the exact UIMessageChunk that was written to the
// live stream, emitted as `data: <json>\n\n`.
//
// STEP 1 delivers the endpoint + replay; wiring the client to switch to it on stream
// drop is a later step. This is purely additive — it never touches generation.

// A reconnect can tail an in-flight generation, which itself can run for the full
// function budget. Match the chat route's ceiling so a live tail isn't cut short.
export const maxDuration = 800

const BATCH = 500
const POLL_MS = 1000

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: runId } = await params

  // ── Auth + ownership gate ───────────────────────────────────────────────────
  const user = await getCurrentUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const run = await getRun(runId)
  if (!run || run.user_id !== user.id) {
    // 404 (not 403) so a run's existence isn't leaked to non-owners.
    return new Response(JSON.stringify({ error: 'Run not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(request.url)
  const sinceParam = Number(url.searchParams.get('since') ?? '0')
  let cursor = Number.isFinite(sinceParam) && sinceParam > 0 ? Math.floor(sinceParam) : 0

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      // Emit one stored event payload using the client's SSE framing. The payload IS
      // the original UIMessageChunk, so the client parses it exactly as a live part.
      const emit = (payload: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        } catch {
          close()
        }
      }

      try {
        // Loop: drain everything after the cursor, then decide to stop (terminal +
        // caught up) or sleep and poll again. Client disconnect breaks out via signal.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (request.signal.aborted || closed) break

          const events = await getRunEventsSince(runId, cursor, BATCH)
          for (const ev of events) {
            emit(ev.payload)
            if (ev.seq > cursor) cursor = ev.seq
          }

          // A full batch means there may be more immediately — catch up without waiting.
          if (events.length === BATCH) continue

          // Caught up. If the run is terminal, we're done (no more events will arrive).
          const latest = await getRun(runId)
          if (isTerminalRunStatus(latest?.status)) {
            // Drain any final events that landed between the last fetch and the status
            // read, then close.
            const tail = await getRunEventsSince(runId, cursor, BATCH)
            for (const ev of tail) {
              emit(ev.payload)
              if (ev.seq > cursor) cursor = ev.seq
            }
            break
          }

          await new Promise((r) => setTimeout(r, POLL_MS))
        }
      } catch (e) {
        console.warn('[runs/stream] tail error:', e instanceof Error ? e.message : e)
      } finally {
        close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-vercel-ai-ui-message-stream': 'v1',
      'x-accel-buffering': 'no',
    },
  })
}
