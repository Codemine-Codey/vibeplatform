import { getAdminSupabase } from '@/lib/supabase/server'

// ── Durable runs (STEP 1 of the durable-runs system) ──────────────────────────
// A `run` is one generation invocation. `run_events` is the CANONICAL, append-only
// log of every server-emitted stream part for that run — a shadow copy of the live
// SSE stream. The live stream is unaffected: these writes are fire-and-forget and
// NEVER throw into the generation pipeline. This lands concurrency-isolation +
// walk-away reading (via GET /api/runs/:id/stream) with ZERO pipeline change.
//
// All writes use the service-role admin client (RLS bypass) because the pipeline
// runs server-side, post-auth, and often after the response has begun streaming
// (no request cookies to rely on). Read access from the browser is RLS-scoped to
// the owning user by the policies created in the migration.

export interface RunRow {
  id: string
  user_id: string | null
  project_id: string | null
  status: string
  phase_cursor: number
  manifest: unknown | null
  brief: unknown | null
  sandbox_id: string | null
  snapshot_path: string | null
  tokens_used: number
  created_at: string
  updated_at: string
}

export interface RunEventRow {
  id: number
  run_id: string
  seq: number
  type: string | null
  payload: unknown | null
  created_at: string
}

// Terminal statuses — the reconnect stream stops live-tailing once a run reaches one.
export const TERMINAL_RUN_STATUSES = ['done', 'error'] as const
export function isTerminalRunStatus(status: string | null | undefined): boolean {
  return status === 'done' || status === 'error'
}

// Create a run row for this generation invocation. Returns the new runId, or null
// if the insert failed (the caller then simply skips dual-writing — the live stream
// is unaffected either way).
export async function createRun(input: {
  userId: string | null
  projectId?: string | null
}): Promise<string | null> {
  try {
    const sb = getAdminSupabase()
    const { data, error } = await sb
      .from('runs')
      .insert({
        user_id: input.userId,
        project_id: input.projectId ?? null,
        status: 'running',
      })
      .select('id')
      .single()
    if (error) {
      console.warn('[runs] createRun failed:', error.message)
      return null
    }
    return data.id as string
  } catch (e) {
    console.warn('[runs] createRun threw:', e instanceof Error ? e.message : e)
    return null
  }
}

// Append one event to the canonical run log. FIRE-AND-FORGET by contract: it must
// NEVER throw into (or slow) the live pipeline. The live SSE stream has already been
// written by the time this runs; this is a shadow copy for replay/reconnect.
export function appendRunEvent(
  runId: string | null,
  type: string,
  payload: unknown
): void {
  if (!runId) return
  try {
    const sb = getAdminSupabase()
    void sb
      .from('run_events')
      .insert({ run_id: runId, type, payload: payload ?? null })
      .then(({ error }) => {
        if (error) console.warn('[runs] appendRunEvent failed:', error.message)
      })
  } catch (e) {
    // Swallow everything — the log is best-effort and must never affect generation.
    console.warn('[runs] appendRunEvent threw:', e instanceof Error ? e.message : e)
  }
}

// Patch a run row (status, phase_cursor, manifest, brief, sandbox_id, snapshot_path,
// tokens_used, …). Non-throwing; keeps updated_at fresh.
export async function updateRun(
  runId: string,
  patch: Partial<
    Pick<
      RunRow,
      | 'status'
      | 'phase_cursor'
      | 'manifest'
      | 'brief'
      | 'sandbox_id'
      | 'snapshot_path'
      | 'tokens_used'
      | 'project_id'
    >
  >
): Promise<void> {
  try {
    const sb = getAdminSupabase()
    await sb
      .from('runs')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', runId)
  } catch (e) {
    console.warn('[runs] updateRun failed:', e instanceof Error ? e.message : e)
  }
}

// Read a run row (admin — RLS bypass; callers that expose this must own-check first).
export async function getRun(runId: string): Promise<RunRow | null> {
  try {
    const sb = getAdminSupabase()
    const { data, error } = await sb.from('runs').select('*').eq('id', runId).single()
    if (error) return null
    return data as RunRow
  } catch {
    return null
  }
}

// ── Durable-runs STEP 3: server-chained continuation ──────────────────────────
// A long build runs as a CHAIN of <800s invocations. When an invocation nears the
// Vercel function cap it snapshots, sets status `continuing`, and fires the next
// invocation (POST /api/runs/continue) inside waitUntil. These helpers implement the
// claim/handoff so a run is processed by exactly ONE invocation at a time and never
// orphaned (a cron sweeper re-fires any run stuck in `continuing`).

// Base URL for the server-to-server continuation self-call. Prefer the CURRENT
// deployment (VERCEL_URL) so the chain runs the SAME code/version that started the
// build; fall back to an explicit override or the public alias, then localhost.
function internalBaseUrl(): string {
  if (process.env.CM_INTERNAL_BASE_URL) return process.env.CM_INTERNAL_BASE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return process.env.CM_PUBLIC_BASE_URL || 'http://localhost:3000'
}

// Fire the internal continuation for a run (server-to-server, shared-secret authed).
// Fire-and-forget: the CALLER is responsible for wrapping this in waitUntil so the
// request survives the invocation ending. Never throws.
export async function fireContinuation(runId: string): Promise<void> {
  try {
    const secret = process.env.CM_INTERNAL_SECRET || ''
    const res = await fetch(`${internalBaseUrl()}/api/runs/continue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cm-internal': secret },
      body: JSON.stringify({ runId }),
    })
    if (!res.ok) console.warn('[runs] fireContinuation non-ok:', res.status)
  } catch (e) {
    console.warn('[runs] fireContinuation failed:', e instanceof Error ? e.message : e)
  }
}

// Atomically CLAIM a run for a continuation invocation: flip status `continuing` →
// `running` ONLY if it is currently `continuing`. Returns true if THIS caller won the
// claim (a row was updated), false if it was already claimed/terminal — the guard
// against double-processing when both the chained fetch and the sweeper land.
export async function claimRunForContinuation(runId: string): Promise<boolean> {
  try {
    const sb = getAdminSupabase()
    const { data, error } = await sb
      .from('runs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', runId)
      .eq('status', 'continuing')
      .select('id')
    if (error) {
      console.warn('[runs] claimRunForContinuation failed:', error.message)
      return false
    }
    return Array.isArray(data) && data.length > 0
  } catch (e) {
    console.warn('[runs] claimRunForContinuation threw:', e instanceof Error ? e.message : e)
    return false
  }
}

// Sweeper query: runs stuck in `continuing` whose updated_at is older than the cutoff
// (a chained fetch that never landed — killed invocation, network drop). The cron
// re-fires continuation for each so no run is ever orphaned mid-chain.
export async function listStuckContinuingRuns(
  olderThanMs = 120_000,
  limit = 20
): Promise<RunRow[]> {
  try {
    const sb = getAdminSupabase()
    const cutoff = new Date(Date.now() - olderThanMs).toISOString()
    const { data, error } = await sb
      .from('runs')
      .select('*')
      .eq('status', 'continuing')
      .lt('updated_at', cutoff)
      .order('updated_at', { ascending: true })
      .limit(limit)
    if (error) {
      console.warn('[runs] listStuckContinuingRuns failed:', error.message)
      return []
    }
    return (data ?? []) as RunRow[]
  } catch (e) {
    console.warn('[runs] listStuckContinuingRuns threw:', e instanceof Error ? e.message : e)
    return []
  }
}

// Fetch events after a cursor (seq strictly greater than `since`), ordered ascending.
// Used by the reconnect stream to replay-from-cursor then live-tail. Admin client;
// the HTTP route owns-checks the run before calling this.
export async function getRunEventsSince(
  runId: string,
  since: number,
  limit = 500
): Promise<RunEventRow[]> {
  try {
    const sb = getAdminSupabase()
    const { data, error } = await sb
      .from('run_events')
      .select('*')
      .eq('run_id', runId)
      .gt('seq', since)
      .order('seq', { ascending: true })
      .limit(limit)
    if (error) {
      console.warn('[runs] getRunEventsSince failed:', error.message)
      return []
    }
    return (data ?? []) as RunEventRow[]
  } catch (e) {
    console.warn('[runs] getRunEventsSince threw:', e instanceof Error ? e.message : e)
    return []
  }
}
