import type { Sandbox } from '@vercel/sandbox'
import type { ModelMessage, UIMessage, UIMessageStreamWriter } from 'ai'
import { after } from 'next/server'
import type { DataPart } from '@/ai/messages/data-parts'
import { FILE_GENERATION_MODEL } from '@/ai/constants'
import { generateFiles } from '@/ai/tools/generate-files'
import type { NormalizedManifest } from '@/ai/tools/plan-project'
import { SCAFFOLD_PATH_SET } from '@/ai/tools/scaffold'
import { ensureValidCss } from '@/lib/css-guard'
import { logRepair } from '@/lib/telemetry'
import { appendRunEvent, updateRun, fireContinuation } from '@/lib/runs'
import { snapshotProject, updateProjectRow } from '@/lib/projects-db'
import {
  readSandboxFile,
  extractBuildError,
  extractErrorFiles,
  installMissingModules,
  repairFile,
  viteBuildOnce,
} from '@/lib/sandbox-util'

// ── Durable-runs STEP 3: resumable, deadline-aware enrichment engine ──────────
// The phase loop (phases 2..N) that turns branded shells into full pages. Extracted
// from the chat route so BOTH the first invocation (POST /api/chat) and every chained
// continuation (POST /api/runs/continue) run the IDENTICAL logic. It is:
//   • resumable — starts at `fromPhase + 1` (the run row's phase_cursor), reads all
//     other state (design reference) back from the live sandbox, needs ZERO model
//     context, and dual-writes every event to the canonical run_events log so the
//     reconnect stream shows one continuous flow regardless of which invocation runs.
//   • deadline-aware — before each phase it checks the invocation budget; if too little
//     remains it snapshots, marks the run `continuing`, and fires the next invocation
//     (fire-and-forget inside waitUntil), then ends cleanly. A hard AbortSignal on the
//     phase's model call is the inner guard for a phase that overruns.
// Single-phase / small builds never reach here (manifest.multiPhase === false).

type Writer = UIMessageStreamWriter<UIMessage<never, DataPart>>

// Per-phase budget estimate. We only START a phase if at least this much of the SOFT
// budget (deadline) remains. A phase = model call (~90–180s) + build gate (vite build +
// up to 2 repair rounds, ~150s worst case). Sized to cover BOTH so a phase that starts
// can also finish its gate before the deadline — otherwise gate work could spill past the
// hard 800s cap and orphan the run. Generous by design: chaining is cheap + invisible.
const PHASE_ESTIMATE_MS = 330_000

// Time reserved AFTER the model call for the build gate (build + repair rounds) + the
// checkpoint/chain. The inner AbortSignal fires the model call this many ms BEFORE the
// deadline so the gate always has room to run (or roll back) inside the budget.
const GATE_RESERVE_MS = 170_000

const sanitizeCss = ensureValidCss

function isAbortError(e: unknown): boolean {
  if (!e) return false
  const name = (e as { name?: string }).name
  const msg = e instanceof Error ? e.message : String(e)
  return name === 'AbortError' || name === 'TimeoutError' || /abort|timeout/i.test(msg)
}

// ── Log-only writer (continuation invocations) ────────────────────────────────
// A continuation runs server-to-server with no client SSE stream attached. This
// writer simply appends every part to the canonical run_events log; the client's
// reconnect stream (GET /api/runs/:id/stream) reads that log and renders progress.
// merge() is a no-op — the enrichment path only uses write() (narrate + generateFiles
// via getWriteFiles), never merge().
export function makeLogWriter(runId: string): Writer {
  let onErrorHandler: ((error: unknown) => string) | undefined
  const w: Writer = {
    write(part) {
      const type = (part as { type?: string }).type ?? 'unknown'
      appendRunEvent(runId, type, part)
    },
    merge() {
      /* no client stream to merge into — enrichment never calls this */
    },
    get onError() {
      return onErrorHandler
    },
    set onError(handler) {
      onErrorHandler = handler
    },
  } as Writer
  return w
}

// Post a warm, plain-English chat message at a phase boundary. Goes through the writer
// so it is dual-written to run_events and rendered in chat like an assistant line.
export function narrate(writer: Writer, text: string): void {
  writer.write({
    id: `srv-narr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'data-narration',
    data: { text },
  })
}

// Human-friendly label for a phase from its page file names ("menu and gallery pages").
function prettyPhaseLabel(paths: string[]): string {
  const names = [
    ...new Set(
      paths
        .map((p) => p.split('/').pop() ?? '')
        .map((n) => n.replace(/\.(tsx|jsx|ts|js)$/i, ''))
        .filter((n) => n && !/^index$/i.test(n) && !/^App$/.test(n))
        .map((n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
  if (names.length === 0) return 'next section'
  if (names.length === 1) return `${names[0]} page`
  if (names.length === 2) return `${names[0]} and ${names[1]} pages`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} pages`
}

// Read the design-reference files an enrichment pass must match (App routing + tokens
// + the persistent chrome) so a full page keeps the exact fonts/colors the shell set.
async function readDesignReference(sandbox: Sandbox, manifest: NormalizedManifest): Promise<string> {
  const wanted = new Set<string>(['src/App.tsx', 'src/index.css'])
  for (const f of manifest.files) {
    if (f.phase === 1 && /(Nav(bar|igation)?|Header|Footer|Layout)\.(tsx|jsx)$/i.test(f.path)) wanted.add(f.path)
  }
  const parts: string[] = []
  for (const p of wanted) {
    const c = await readSandboxFile(sandbox, p)
    if (c) parts.push(`// ${p}\n${c.slice(0, 3000)}`)
  }
  return parts.join('\n\n')
}

// Per-phase transaction gate: the build MUST stay green after an enrichment phase.
// Bounded repair on the phase's own files; if it still won't compile, ROLL BACK to
// the pre-phase content (the shells) so the live preview never regresses to broken.
async function gateEnrichmentPhase({
  sandbox,
  phasePaths,
  before,
}: {
  sandbox: Sandbox
  phasePaths: string[]
  before: Array<{ path: string; content: string }>
}): Promise<boolean> {
  let { ok, log } = await viteBuildOnce(sandbox, '/tmp/cm-enrich.log')
  for (let round = 0; round < 2 && !ok; round++) {
    const errorBlock = extractBuildError(log)
    if (await installMissingModules(sandbox, log)) {
      ;({ ok, log } = await viteBuildOnce(sandbox, '/tmp/cm-enrich.log'))
      continue
    }
    const files = extractErrorFiles(log).filter((p) => !SCAFFOLD_PATH_SET.has(p))
    let repairedAny = false
    for (const path of files.slice(0, 3)) {
      const content = await readSandboxFile(sandbox, path)
      if (!content) continue
      const fixed = await repairFile(path, content, errorBlock)
      if (fixed && fixed !== content) {
        const finalContent = path.endsWith('.css') ? sanitizeCss(fixed) : fixed
        await sandbox.writeFiles([{ path, content: Buffer.from(finalContent, 'utf8') }])
        repairedAny = true
      }
    }
    if (!repairedAny) break
    ;({ ok, log } = await viteBuildOnce(sandbox, '/tmp/cm-enrich.log'))
  }
  if (!ok) {
    if (before.length > 0) {
      await sandbox
        .writeFiles(before.map((b) => ({ path: b.path, content: Buffer.from(b.content, 'utf8') })))
        .catch(() => {})
    }
    logRepair({ layer: 'phase-gate', action: 'rolled-back', detail: phasePaths.join(', ').slice(0, 200) })
    return false
  }
  return true
}

// Snapshot + mark the run `continuing` at the given cursor, then fire the next chained
// invocation (fire-and-forget inside waitUntil so it survives this invocation ending).
async function checkpointAndChain(opts: {
  writer: Writer
  sandbox: Sandbox
  runId?: string | null
  projectId?: string | null
  userId?: string | null
  phaseCursor: number
}): Promise<void> {
  const { writer, sandbox, runId, projectId, userId, phaseCursor } = opts
  narrate(
    writer,
    "Your site's already live and usable — I'll keep filling in the remaining pages in the background; they'll appear as they're ready."
  )
  let snapshotPath: string | null = null
  if (projectId && userId) {
    // Bounded — a checkpoint snapshot must NEVER eat the hard-cap margin. If it times out
    // the continuation still resumes via Sandbox.get (sandbox stays alive), so a missed
    // snapshot only costs the sweeper-path fallback, never the build.
    snapshotPath = await Promise.race([
      snapshotProject(sandbox, userId, projectId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 45_000)),
    ]).catch(() => null)
    if (snapshotPath) {
      await updateProjectRow(projectId, { sandbox_id: sandbox.sandboxId, snapshot_path: snapshotPath }).catch(() => {})
    }
  }
  if (runId) {
    await updateRun(runId, {
      status: 'continuing',
      phase_cursor: phaseCursor,
      sandbox_id: sandbox.sandboxId,
      ...(snapshotPath ? { snapshot_path: snapshotPath } : {}),
    }).catch(() => {})
    // Fire the next invocation. next/server `after` keeps the request alive past this
    // function's return until the fetch completes; the sweeper cron re-fires if it
    // somehow never lands (killed invocation / cold deploy mid-chain).
    after(fireContinuation(runId))
  }
}

// Run enrichment phases starting AFTER `fromPhase` (the run's phase_cursor). Returns
// { chained } — when true, the run was checkpointed + handed to a fresh invocation and
// this invocation must end WITHOUT marking the run done. When false, all phases landed.
export async function runResumableEnrichment(opts: {
  writer: Writer
  sandbox: Sandbox
  sandboxId: string
  manifest: NormalizedManifest
  designContext?: string
  genContext?: ModelMessage[]
  runId?: string | null
  projectId?: string | null
  userId?: string | null
  // Absolute ms timestamp: invocationStart + (800s − 90s margin). Phases only start
  // while the budget holds; otherwise the run chains to a new invocation.
  deadline: number
  // Last COMPLETED phase (run.phase_cursor). Enrichment resumes at fromPhase + 1.
  fromPhase: number
}): Promise<{ chained: boolean }> {
  const {
    writer,
    sandbox,
    sandboxId,
    manifest,
    designContext,
    genContext = [],
    runId,
    projectId,
    userId,
    deadline,
    fromPhase,
  } = opts

  const allPaths = manifest.files.map((f) => f.path)
  const reference = await readDesignReference(sandbox, manifest)
  const startPhase = Math.max(2, (fromPhase || 0) + 1)

  // Intro narration + set cursor=1 ONLY on the very first entry (phase 1 just shipped).
  if ((fromPhase || 0) < 1) {
    narrate(
      writer,
      "Your site is live and clickable — go ahead and try it while I work. I'm filling in the rest of the pages now…"
    )
    if (runId) await updateRun(runId, { phase_cursor: 1 }).catch(() => {})
  }

  for (let phase = startPhase; phase <= manifest.phaseCount; phase++) {
    const phaseFiles = manifest.files.filter((f) => f.phase === phase)
    if (phaseFiles.length === 0) continue
    const phasePaths = phaseFiles.map((f) => f.path)

    // ── DEADLINE BOUNDARY CHECK (primary guard) ──────────────────────────────
    // Not enough budget to safely run this phase → checkpoint at the last completed
    // phase (phase - 1) and chain. Almost always the guard that fires (phases fit or
    // they don't); the inner AbortSignal below is the rare-overrun backstop.
    if (deadline - Date.now() < PHASE_ESTIMATE_MS) {
      await checkpointAndChain({ writer, sandbox, runId, projectId, userId, phaseCursor: phase - 1 })
      return { chained: true }
    }

    const label = prettyPhaseLabel(phasePaths)
    narrate(writer, `Building the ${label} now…`)

    // Capture the shells so a failed/aborted phase can roll back to a known-good state.
    const before: Array<{ path: string; content: string }> = []
    for (const p of phasePaths) {
      const c = await readSandboxFile(sandbox, p)
      if (c) before.push({ path: p, content: c })
    }

    try {
      const enrichMessages: ModelMessage[] = [
        ...genContext,
        {
          role: 'user',
          content:
            'The app is ALREADY LIVE. The pages at the paths I will generate currently exist only as branded SHELLS. ' +
            'Replace each with the COMPLETE, full production page: keep the SAME exports and route wiring, and match the ' +
            'EXISTING design system exactly (fonts, color tokens, spacing, shared components) as shown in these reference ' +
            'files. Write real, on-brief content — no placeholders, no lorem, no "coming soon". Do NOT change routing or ' +
            'any file outside the requested paths.\n\nDesign reference files:\n' +
            reference,
        },
      ]
      // Hard inner guard: abort the model call GATE_RESERVE_MS before the deadline so the
      // build gate (which follows) still fits inside the budget. Any file whose CMEND fence
      // already landed is written (salvaged); the gate then rolls back a partial + we chain.
      const phaseAbort = AbortSignal.timeout(Math.max(20_000, deadline - Date.now() - GATE_RESERVE_MS))
      const gf = generateFiles({
        writer,
        modelId: FILE_GENERATION_MODEL,
        designContext,
        existingPaths: allPaths,
        abortSignal: phaseAbort,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (gf as any).execute(
        { sandboxId, paths: phasePaths },
        { toolCallId: `srv-gen-p${phase}`, messages: enrichMessages }
      )

      const green = await gateEnrichmentPhase({ sandbox, phasePaths, before })
      narrate(
        writer,
        green
          ? `${label[0].toUpperCase()}${label.slice(1)} done ✓${phase < manifest.phaseCount ? ' — building the next section.' : ''}`
          : `Keeping the ${label} on the current version for now — moving on.`
      )
    } catch (e) {
      // Roll the phase back to its shells so the preview never regresses.
      if (before.length > 0) {
        await sandbox
          .writeFiles(before.map((b) => ({ path: b.path, content: Buffer.from(b.content, 'utf8') })))
          .catch(() => {})
      }
      // Deadline abort mid-phase → salvage (rolled back above) + chain from the SAME
      // cursor (this phase didn't complete, so phase - 1 stays the last good phase).
      if (isAbortError(e)) {
        console.warn('[enrichment] phase', phase, 'aborted at deadline — chaining')
        await checkpointAndChain({ writer, sandbox, runId, projectId, userId, phaseCursor: phase - 1 })
        return { chained: true }
      }
      console.warn('[enrichment] phase', phase, 'failed (non-fatal):', e instanceof Error ? e.message : e)
    }

    // Phase completed (green or rolled back) — advance the cursor + refresh snapshot.
    if (runId) await updateRun(runId, { phase_cursor: phase }).catch(() => {})
    if (projectId && userId) {
      const pid = projectId
      const uid = userId
      snapshotProject(sandbox, uid, pid)
        .then((p) => (p ? updateProjectRow(pid, { snapshot_path: p }) : undefined))
        .catch(() => {})
    }

    // ── TEST HOOK (env-gated, no-op in prod) ─────────────────────────────────
    // CM_TEST_FORCE_CHAIN_EVERY=N forces a checkpoint+chain after every N completed
    // phases, so the full cross-invocation handoff/resume/completion path can be proven
    // deterministically on a normal-length build (no need to burn the real 680s deadline).
    const forceEvery = Number(process.env.CM_TEST_FORCE_CHAIN_EVERY) || 0
    if (forceEvery > 0 && phase < manifest.phaseCount && phase % forceEvery === 0) {
      console.warn('[enrichment] TEST force-chain after phase', phase)
      await checkpointAndChain({ writer, sandbox, runId, projectId, userId, phaseCursor: phase })
      return { chained: true }
    }
  }

  narrate(writer, 'All the pages are built — your site is complete. 🎉')
  if (runId) await updateRun(runId, { phase_cursor: manifest.phaseCount }).catch(() => {})
  return { chained: false }
}
