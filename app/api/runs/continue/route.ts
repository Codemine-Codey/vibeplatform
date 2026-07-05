import { NextResponse } from 'next/server'
import { Sandbox } from '@vercel/sandbox'
import {
  getRun,
  updateRun,
  claimRunForContinuation,
} from '@/lib/runs'
import { manifestFromFiles } from '@/ai/tools/plan-project'
import { runResumableEnrichment, makeLogWriter } from '@/lib/enrichment'
import {
  snapshotProject,
  updateProjectRow,
  restoreSnapshotInto,
  incrementProjectTokens,
} from '@/lib/projects-db'
import { restoreBakedDeps } from '@/lib/baked-deps'
import { tokenStore } from '@/lib/token-context'

// Durable-runs STEP 3: server-to-server continuation of a long build. A build runs as a
// CHAIN of <800s invocations; when one nears the Vercel function cap it snapshots, marks
// the run `continuing`, and fires THIS endpoint (fire-and-forget inside waitUntil). This
// is what makes walk-away native — the chain does not care whether a client is connected.
// The cron sweeper (/api/runs/sweep) re-fires any run whose chained call never landed.
//
// It is shared-secret authed (never user-facing). It resumes the SAME sandbox (fast path)
// or restores from the run's snapshot (sweeper path, sandbox may have been reclaimed), then
// runs the identical resumable enrichment engine from the run's phase_cursor.

export const maxDuration = 800

export async function POST(req: Request) {
  const invocationStart = Date.now()

  // ── Auth: shared internal secret only ────────────────────────────────────────
  const secret = process.env.CM_INTERNAL_SECRET || ''
  if (!secret || req.headers.get('x-cm-internal') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { runId?: string }
  const runId = body.runId
  if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 })

  // ── Claim: continuing → running (atomic) ─────────────────────────────────────
  // Exactly ONE invocation processes a run at a time. If we didn't win the claim, the
  // chained fetch and the sweeper both landed — the other one owns it. No-op success.
  const claimed = await claimRunForContinuation(runId)
  if (!claimed) return NextResponse.json({ ok: true, skipped: 'not-claimable' })

  const run = await getRun(runId)
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 })

  const manifest = manifestFromFiles(run.manifest)
  const fromPhase = run.phase_cursor ?? 0

  // Nothing left to build (all phases done, or a single-phase run reached here somehow) →
  // mark done and stop. Never leave a run stuck in `running`.
  if (!manifest.multiPhase || fromPhase >= manifest.phaseCount) {
    await updateRun(runId, { status: 'done' })
    return NextResponse.json({ ok: true, done: true })
  }

  // ── Resume the sandbox ───────────────────────────────────────────────────────
  // Fast path (the common case — the chain fires within seconds): the sandbox is still
  // alive, so attach to it directly. Fallback (sweeper path minutes later): restore the
  // run's snapshot into a fresh sandbox, re-install baked deps, and start the dev server.
  let sandbox: Sandbox | null = null
  if (run.sandbox_id) {
    try {
      sandbox = await Sandbox.get({ sandboxId: run.sandbox_id })
    } catch {
      sandbox = null
    }
  }
  if (!sandbox && run.snapshot_path) {
    sandbox = await restoreSandboxFromSnapshot(run.snapshot_path)
  }
  if (!sandbox) {
    // Can't resume — the user STILL has a live, working, deployable phase-1 site (the
    // shell-first guarantee). Enrichment stopping is graceful degradation, not a failure.
    console.warn('[continue] could not resume sandbox for run', runId, '— finishing with phase-1 site')
    await updateRun(runId, { status: 'done' })
    return NextResponse.json({ ok: true, degraded: 'no-sandbox' })
  }

  const deadline = invocationStart + (maxDuration * 1000 - 90_000)
  const writer = makeLogWriter(runId)
  const designContext = typeof run.brief === 'string' ? run.brief : undefined

  const tokenBox = { total: 0 }
  let chained = false
  try {
    const res = await tokenStore.run(tokenBox, () =>
      runResumableEnrichment({
        writer,
        sandbox: sandbox!,
        sandboxId: sandbox!.sandboxId,
        manifest,
        designContext,
        runId,
        projectId: run.project_id,
        userId: run.user_id,
        deadline,
        fromPhase,
      })
    )
    chained = res.chained
  } catch (e) {
    console.warn('[continue] enrichment failed (non-fatal):', e instanceof Error ? e.message : e)
  }

  // Token attribution — add this invocation's usage to the run + project totals.
  if (tokenBox.total > 0) {
    await updateRun(runId, { tokens_used: (run.tokens_used ?? 0) + tokenBox.total }).catch(() => {})
    if (run.project_id) incrementProjectTokens(run.project_id, tokenBox.total).catch(() => {})
  }

  // If it did NOT chain again, the whole build is done — final snapshot + mark done. If it
  // DID chain, the next invocation owns the finish (run stays `continuing`).
  if (!chained) {
    if (run.project_id && run.user_id) {
      const snapshotPath = await snapshotProject(sandbox, run.user_id, run.project_id).catch(() => null)
      await updateProjectRow(run.project_id, {
        sandbox_id: sandbox.sandboxId,
        ...(snapshotPath ? { snapshot_path: snapshotPath } : {}),
      }).catch(() => {})
    }
    await updateRun(runId, { status: 'done' })
  }

  return NextResponse.json({ ok: true, chained })
}

// Restore a run's file snapshot into a fresh sandbox and bring the dev server up. Used
// only when the original sandbox was reclaimed before the continuation ran (sweeper path).
async function restoreSandboxFromSnapshot(snapshotPath: string): Promise<Sandbox | null> {
  let sandbox: Sandbox
  try {
    sandbox = await Sandbox.create({ timeout: 1_800_000, ports: [3000] })
  } catch {
    return null
  }
  const restored = await restoreSnapshotInto(sandbox, snapshotPath).catch(() => false)
  if (!restored) return null

  const baked = await restoreBakedDeps(sandbox).catch(() => false)
  try {
    const install = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', baked
        ? 'command -v bun >/dev/null 2>&1 && bun install --no-save || pnpm install --prefer-offline'
        : 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'],
    })
    await Promise.race([
      install.wait(),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('install timeout')), 120_000)),
    ])
  } catch {
    /* non-fatal — dev may still start */
  }
  try {
    await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'],
    })
  } catch {
    /* non-fatal */
  }
  // Wait for Vite to be listening so enrichment's build gate has a live server.
  const url = sandbox.domain(3000)
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (res.status !== 502) break
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 2500))
  }
  return sandbox
}
