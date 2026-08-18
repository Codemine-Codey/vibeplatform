// Vercel Workflow SDK — durable build pipeline.
// 'use workflow' / 'use step' directives are compiled by @workflow/next's SWC plugin.
// Each 'use step' function gets its own fresh 800s Vercel invocation budget, so
// generation (stepGenerate) + verify (stepVerify) can each run the full 800s —
// breaking the single-function 13-min cap entirely.
//
// Streaming to client: steps call getWritable() which writes to run.readable.
// The chat route calls start(buildProject, [params]) and returns run.readable
// as the HTTP response body. Vercel's infrastructure serves the stream durably —
// the HTTP handler function invocation exits quickly; each step invocation runs
// independently and writes events that Vercel delivers to the client.

import { getWritable } from 'workflow'
import { Sandbox } from '@vercel/sandbox'
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
} from 'ai'
import { getModelOptions } from '@/ai/gateway'
import {
  DEFAULT_MODEL,
  FILE_GENERATION_MODEL,
  REPAIR_MODEL,
  LEAF_MODEL,
  getMaxOutputTokens,
} from '@/ai/constants'
import { getScaffoldFiles } from '@/ai/tools/scaffold'
import { restoreBakedDeps } from '@/lib/baked-deps'
import { buildFullIndexCss, lockPaletteInCss } from '@/lib/design-tokens'
import { ensureValidCss } from '@/lib/css-guard'
import { generateFiles } from '@/ai/tools/generate-files'
import { planProject, type NormalizedManifest } from '@/ai/tools/plan-project'
import { getUnsplashBatch } from '@/ai/tools/get-unsplash-batch'
import { lookupReference, tavilySearch } from '@/ai/tools/lookup-reference'
import { loadSkill } from '@/ai/tools/load-skill'
import { getSkillCatalog, loadSkillBody, designSkillFor } from '@/ai/skills'
import { generateSuggestions } from '@/ai/suggestions'
import { reviewGeneratedCode } from '@/lib/code-review-gate'
import { readSandboxFile, repairFile, generateMissingFile, installMissingModules } from '@/lib/sandbox-util'
import { plannedMissingFiles, SCAFFOLD_RESOLVABLE, localImportBasePath } from '@/lib/gates/checker.mjs'
import { scrubPart } from '@/lib/leak-guard'
import { logRepair } from '@/lib/telemetry'
import {
  checkAndStampMissingFiles,
  findStubPaths,
  findIncompletePages,
  verifyAndRepair,
  headlessRuntimeCheck,
  functionalVerify,
  aiDrivenQA,
  waitForDevServer,
  restartDevServer,
  ensureNavShells,
  applyFallbackTerminalState,
  sanitizeTsx,
  type PipelineWriter,
} from '@/lib/pipeline-helpers'
import { appendRunEventBatch, updateRun, getRun } from '@/lib/runs'
import {
  updateProjectRow,
  snapshotProject,
  incrementProjectTokens,
} from '@/lib/projects-db'
import { tokenStore } from '@/lib/token-context'
import { saveCheckpoint } from '@/ai/tools/checkpoint'
import type { Skill, ColorTokens, PageSpec } from '@/ai/types/project-brief'
import type { ChatUIMessage } from '@/components/chat/types'

// ── Serializable params passed to the workflow ───────────────────────────────
// ALL fields must be JSON-serializable — no Promises, no class instances.

export interface BuildPipelineParams {
  runId: string | null
  userId: string | null
  projectId: string | null
  /** Pre-created sandbox ID (parallel provision in route). Null = create fresh. */
  sandboxId: string | null
  messages: ChatUIMessage[]
  systemPrompt: string
  skill: Skill
  designContext: string
  tokens: ColorTokens | null
  brandName: string | null
  pageMap: PageSpec[] | null
  fontPairing: string | null
  firstUserText: string
  lastUserText: string
  invocationStart: number
  userText: string
  /** Technical PRD generated from the design brief — injected into the generation prompt */
  prdContext: string | null
}

// ── Internal step-to-step handoff (serializable) ─────────────────────────────

interface GenerateResult {
  sandboxId: string
  resolvedUrl: string
  manifestFilePaths: string[]
  planManifest: NormalizedManifest | null
  skill: Skill
  brandName: string | null
  projectId: string | null
  userId: string | null
  runId: string | null
  invocationStart: number
  firstUserText: string
  lastUserText: string
  userText: string
  // The EXACT system prompt stepGenerate used (params.systemPrompt + addenda). The
  // continuation step (stepGenerate2) reuses this byte-for-byte so round 2 runs with
  // identical rules to round 1 — no behavioral drift, no divergent prompt.
  fullSystem: string
  // false when stub/missing files still remain on disk after this step. This is DISK
  // TRUTH (findStubPaths), not an abort flag — it catches both the timeout case AND
  // the "AI finished but skipped a manifest file" case. buildProject re-chains
  // stepGenerate2 (capped) until this is true or the cap is hit.
  generationComplete: boolean
}

// Checkpoint passed from stepVerify → stepVerify2 when the 11-min deadline fires.
// All fields are JSON-serializable (no class instances, no Promises).
interface VerifyCheckpoint {
  sandboxId: string
  resolvedUrl: string
  manifestFilePaths: string[]
  skill: Skill
  brandName: string | null
  projectId: string | null
  userId: string | null
  runId: string | null
  firstUserText: string
  lastUserText: string
  devError: string | null       // null = server healthy, string = error text
  revealed: boolean             // true if URL was already emitted to the client
  rtStatus: 'ok' | 'broken' | 'skipped' | null  // headless check result
  revealChainCount?: number     // G3: # of times reveal was withheld (broken) + chained to a fresh
                                // stepVerify2 budget. Capped so a permanently-broken build can't loop.
}

// ── Helper: make a PipelineWriter backed by getWritable() + run_events ───────
// getWritable() MUST be called inside a 'use step' function.
// Returns { writer, flushAndRelease } — call flushAndRelease() at step end.
function makeStepWriter(runId: string | null): {
  writer: PipelineWriter
  flushAndRelease: () => Promise<void>
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writable = getWritable<Record<string, any>>()
  const gWriter = writable.getWriter()
  const pending: Promise<void>[] = []

  // Per-step token accounting. The durable workflow runs each 'use step' in its OWN
  // Vercel invocation, so the tokenStore context set in the chat route never reaches
  // here — which is why tokens_used logged 0. enterWith binds a fresh accumulator to
  // THIS step's async context; the metrics middleware's addTokens() sums every model
  // call into it, and flushAndRelease (called on every exit path) persists the delta
  // onto the run + project. Read-modify-write mirrors /api/runs/continue.
  const tokenBox = { total: 0 }
  tokenStore.enterWith(tokenBox)

  // Ordered batch Supabase writes — fixes garbled chat and tool-input-delta errors.
  // Concurrent fire-and-forget inserts race for seq values so a text-delta emitted
  // 2nd can land with a lower seq than the one emitted 1st, corrupting the stream
  // the client assembles. We accumulate events in call order and flush as a single
  // multi-row INSERT; PostgreSQL assigns seq in VALUES order, preserving ordering.
  // Flushes are chained so concurrent batches never interleave.
  const batchQueue: Array<{ type: string; payload: unknown }> = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let flushChain: Promise<void> = Promise.resolve()

  function flushBatch() {
    flushTimer = null
    if (!runId || batchQueue.length === 0) return
    const batch = batchQueue.splice(0)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    flushChain = flushChain.then(() => appendRunEventBatch(runId!, batch)).catch(() => {})
  }

  const writer: PipelineWriter = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    write(part: { id?: string; type: string; data?: any }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pending.push(gWriter.write(part as Record<string, any>).catch(() => {}))
      if (runId) {
        batchQueue.push({ type: part.type, payload: part })
        if (flushTimer === null) flushTimer = setTimeout(flushBatch, 0)
      }
    },
  }

  async function flushAndRelease() {
    // Drain remaining queued events before releasing
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null }
    flushBatch()
    await Promise.all(pending).catch(() => {})
    await flushChain.catch(() => {})
    gWriter.releaseLock()
    // Persist this step's token usage onto the run + project (best-effort).
    if (runId && tokenBox.total > 0) {
      try {
        const run = await getRun(runId)
        await updateRun(runId, { tokens_used: (run?.tokens_used ?? 0) + tokenBox.total })
        if (run?.project_id) await incrementProjectTokens(run.project_id, tokenBox.total)
      } catch { /* telemetry only — never fail a build over accounting */ }
    }
  }

  return { writer, flushAndRelease }
}

// ── Silence filter — suppresses ALL AI text after the first tool call ─────────
// The AI SDK UI stream sends text-start / text-delta / text-end triplets for each
// text part. Holding text-delta but passing text-start/text-end creates orphaned
// parts that crash the AI SDK client with "Received text-end for missing text part".
// Fix: after the first tool event, drop ALL text-* events (start, delta, end, text).
// Tool events always pass through. Non-text data events (data-*, tool-call-*) pass
// through always. Before first tool, everything passes (the opening line is fine).
function makeSilenceFilter() {
  let firstToolSeen = false

  return new TransformStream({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform(part: any, controller: TransformStreamDefaultController) {
      const t: string = part.type ?? ''

      // Any tool event: mark tools as seen, always pass through
      if (t.startsWith('tool-')) {
        firstToolSeen = true
        controller.enqueue(part)
        return
      }

      // Text events: DROP ALL of them. The opening line and the completion line are BOTH emitted
      // DETERMINISTICALLY by the workflow (srv-opening below + srv-ready-narration at reveal), so the
      // model's own text is redundant AND unreliable — Sonnet sometimes skips the opening entirely
      // (the "no AI reply" bug). Dropping every text-* event guarantees exactly one warm opening +
      // one completion, and can never orphan a text part. Tool events + data-* still pass (below).
      if (t === 'text-start' || t === 'text-delta' || t === 'text-end' || t === 'text') {
        return
      }
      void firstToolSeen

      // Everything else (step-start, step-finish, data-*, finish-step, etc.) passes always
      // — scrubbed so data-narration can never leak infra/model/"sandbox" to the user.
      controller.enqueue(scrubPart(part))
    },
    flush(_controller: TransformStreamDefaultController) { /* nothing held */ },
  })
}

// ── The workflow entry point ─────────────────────────────────────────────────

export async function buildProject(params: BuildPipelineParams): Promise<void> {
  'use workflow'

  // Generation chain (mirrors the verify chain below). Each step gets a fresh 800s
  // Vercel budget. stepGenerate2 completes ONLY the stub files still on disk, reusing
  // the exact same system prompt — so a handoff never re-does completed work and never
  // diverges from round-1's rules. generationComplete is disk truth (no stubs remain),
  // so this loop keeps handing off until the project is genuinely complete.
  //
  // Generation chains across fresh ~13-min Vercel budgets so a big build never hits the single-
  // invocation limit (no "13-min death"). Cap = 3 rounds ≈ 40 min total (user's ceiling); after that
  // verify's missing-file repair + ensureNavShells finish it deterministically. Verify chains
  // unlimited (while loop below). If we EXHAUST the rounds still incomplete, the user is told in
  // plain words (below) — never a silent hang.
  const MAX_CONT_ROUNDS = 3
  let genResult = await stepGenerate(params)
  let contRounds = 0
  while (!genResult.generationComplete && contRounds < MAX_CONT_ROUNDS) {
    genResult = await stepGenerate2(params, genResult)
    contRounds++
  }
  if (!genResult.generationComplete) {
    console.warn(`[buildProject] generation still incomplete after ${contRounds} continuation round(s) — proceeding to verify (repair backstop will finish it)`)
  }

  // Verify: same unlimited chain via while loop.
  let checkpoint = await stepVerify(params, genResult)
  while (checkpoint) checkpoint = await stepVerify2(checkpoint)
}

// ── Step 1: Scaffold + AI generation ────────────────────────────────────────

async function stepGenerate(params: BuildPipelineParams): Promise<GenerateResult> {
  'use step'

  const { writer, flushAndRelease } = makeStepWriter(params.runId)

  // Emit the run ID so the client can reconnect via /api/runs/[id]/stream
  if (params.runId) {
    writer.write({ id: 'srv-run', type: 'data-run', data: { runId: params.runId } })
  }

  // DETERMINISTIC WARM OPENING (fixes "no AI reply"): the model's own opening line is unreliable —
  // Sonnet sometimes skips it entirely — so the workflow ALWAYS emits one warm, brand-aware line
  // here. Paired with the deterministic completion line at reveal, the user always sees a friendly
  // bookended conversation. The model itself is kept silent (silence filter drops all its text).
  {
    const brand = (params.brandName ?? '').trim() || 'your project'
    const openings: Record<string, string> = {
      website: `Love this — I'm designing ${brand} now. Give me a few minutes and I'll have your preview ready to look at.`,
      game: `Nice — I'm building ${brand} now, physics and controls and all. Your playable preview is coming right up.`,
      webapp: `On it — I'm building ${brand} now and wiring everything up. I'll have your working preview ready shortly.`,
    }
    const text = openings[params.skill as string] ?? `On it — I'm building ${brand} now. I'll have your preview ready shortly.`
    writer.write({ id: 'srv-opening', type: 'data-narration', data: { text } })
  }

  // Sandbox: reconnect if pre-created, otherwise create fresh
  writer.write({ id: 'srv-sandbox', type: 'data-create-sandbox', data: { status: 'loading' } })
  let sandbox: Sandbox
  try {
    if (params.sandboxId) {
      sandbox = await Sandbox.get({ sandboxId: params.sandboxId })
    } else {
      sandbox = await Sandbox.create({ timeout: 1_800_000, ports: [3000] })
    }
  } catch (err) {
    // Keep the real error in the server logs, but show the USER a plain, calm line — never a raw
    // technical message or infra name.
    console.error('[stepGenerate] sandbox create failed:', err instanceof Error ? err.message : String(err))
    writer.write({ id: 'srv-sandbox', type: 'data-create-sandbox', data: { error: { message: "I couldn't get your workspace started just now — please hit send again in a moment and I'll pick it right back up." }, status: 'error' } })
    await flushAndRelease()
    if (params.runId) await updateRun(params.runId, { status: 'error' }).catch(() => {})
    return {
      sandboxId: params.sandboxId ?? '',
      resolvedUrl: '',
      manifestFilePaths: [],
      planManifest: null,
      skill: params.skill,
      brandName: params.brandName,
      projectId: params.projectId,
      userId: params.userId,
      runId: params.runId,
      invocationStart: params.invocationStart,
      firstUserText: params.firstUserText,
      lastUserText: params.lastUserText,
      userText: params.userText,
      fullSystem: params.systemPrompt,
      generationComplete: true,
    }
  }
  const sandboxId = sandbox.sandboxId

  if (params.projectId && params.sandboxId !== sandboxId) {
    updateProjectRow(params.projectId, { sandbox_id: sandboxId }).catch(() => {})
  }

  // Write scaffold + start background dep install
  let bgInstallPromise: Promise<void> | null = null
  try {
    const scaffoldBuffers = getScaffoldFiles().map(f => ({ path: f.path, content: Buffer.from(f.content, 'utf8') }))
    try {
      await sandbox.writeFiles(scaffoldBuffers)
    } catch {
      await sandbox.writeFiles(scaffoldBuffers)
    }
    bgInstallPromise = (async () => {
      const baked = await restoreBakedDeps(sandbox).catch(() => false)
      const installCmd = baked
        ? 'command -v bun >/dev/null 2>&1 && bun install --no-save || pnpm install --prefer-offline'
        : 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'
      await sandbox.runCommand({ detached: true, cmd: 'bash', args: ['-c', installCmd] })
        .then(cmd => cmd.wait())
        .catch(() => {})
    })().catch(() => {})
  } catch { /* non-fatal */ }

  writer.write({
    id: 'srv-sandbox',
    type: 'data-create-sandbox',
    data: { sandboxId, projectId: params.projectId ?? undefined, status: 'done' },
  })

  // Deterministic index.css from brief tokens
  if (params.tokens) {
    try {
      const brandCss = buildFullIndexCss(params.tokens, params.fontPairing ?? undefined)
      await sandbox.writeFiles([{ path: 'src/index.css', content: Buffer.from(brandCss, 'utf8') }])
    } catch { /* non-fatal */ }
  }

  // ── Prompt addendum ───────────────────────────────────────────────────────
  const { skill, brandName, pageMap, fontPairing, tokens } = params
  const designSkill = designSkillFor(skill)
  const designBody = loadSkillBody(designSkill) ?? ''
  const catalog = getSkillCatalog().map(s => `- ${s.name}: ${s.description}`).join('\n')

  // Tavily research (scoped to skill)
  let researchContext = ''
  try {
    const q = skill === 'game'
      ? `"${params.userText}" web game: the correct gameplay PARAMETERS — player/sprite size as %, gravity, jump strength, obstacle sizes, scroll speed, spawn cadence.`
      : skill === 'webapp'
      ? `"${params.userText}": core features, data fields, views, and user actions for a good version of this app.`
      : `${brandName || params.userText}: sections, services, and specific content for this business website.`
    const r = await tavilySearch(q).catch(() => '')
    if (r) researchContext = skill === 'game'
      ? `\n\n## REAL-WORLD GAME PARAMETERS (use these PROVEN values)\n${r}`
      : `\n\n## REAL-WORLD RESEARCH\n${r}`
  } catch { /* non-fatal */ }

  const designContext = params.designContext + researchContext

  const scaffoldFiles = getScaffoldFiles()
  const scaffoldPaths = scaffoldFiles.map(f => f.path).join(', ')
  const creativeSeed = Math.random().toString(36).slice(2, 10).toUpperCase()
  const activePageMap = (skill === 'website' && pageMap && pageMap.length > 0) ? pageMap : null
  const isMultiPage = !!activePageMap && activePageMap.length > 1
  const pageFileList = activePageMap
    ? activePageMap.map((p: PageSpec) => `src/pages/${p.page.replace(/[^A-Za-z0-9]/g, '')}.tsx (${p.route})`).join(', ')
    : 'src/pages/Home.tsx'

  const pipelineAddendum =
    `\n\n## SERVER PIPELINE — WORKSPACE READY\nsandboxId: ${sandboxId}\n` +
    `⛔ ZERO TECHNICAL NARRATION during the build. You speak ONLY twice: (1) the one-line opening, (2) the completion line after the preview is live. Between them: NOTHING.\n` +
    `Creative session ID: ${creativeSeed} — make UNIQUE design choices.\n` +
    `Scaffold pre-written (including shadcn/ui components). Dependencies installing in background.\n` +
    `DO NOT call createSandbox — it is already done.\nDO NOT call runCommand or getSandboxURL.\n` +
    `Scaffold files already written (exclude from generateFiles paths): ${scaffoldPaths}\n\n` +
    `WORKFLOW: ${skill === 'website'
      ? (isMultiPage
        ? `MULTI-PAGE website, ${activePageMap!.length} pages. (1) getUnsplashBatch for ALL images + planProject with the COMPLETE file list: index.css, Layout.tsx, ONE page file per route (${pageFileList}), one component per section. (2) generateFiles ALL of them, complete and detailed.`
        : `SINGLE-PASS, COMPLETE landing page. (1) getUnsplashBatch for ALL section images + planProject with the COMPLETE file list — ONE scrolling page. (2) generateFiles ALL those files in ONE call.`)
      : skill === 'webapp'
      ? `(1) call planProject with the COMPLETE file list, (2) FIRST generateFiles call: ONLY src/index.css + src/pages/Home.tsx, (3) SECOND generateFiles call: all remaining component files`
      : `(1) call planProject with the complete file list, (2) call generateFiles with sandboxId="${sandboxId}" and exactly the paths from planProject`}\n` +
    (skill !== 'website' ? `getUnsplashBatch is NOT available for this skill type.\n` : '') +
    `If you need packages not in the scaffold, include package.json in your generateFiles paths.\n`

  const fileCountGuidance = skill === 'website'
    ? (isMultiPage
      ? `WEBSITE — MULTI-PAGE (${activePageMap!.length} pages). Generate ALL files, every page fully realized: src/index.css, Layout.tsx, one src/pages/*.tsx per page, src/components/sections/*.tsx per section. MOBILE-ADAPTIVE (required): mobile-first Tailwind, working hamburger.`
      : `WEBSITE — SINGLE-PASS COMPLETE LANDING PAGE. Generate ALL files in ONE call: src/index.css, Layout.tsx, src/components/sections/*.tsx (6-7 sections), src/pages/Home.tsx. MOBILE-ADAPTIVE (required).`)
    : skill === 'webapp'
    ? `WEBAPP BUILD SPLIT: Phase 1 = EXACTLY 2 files (src/index.css + src/pages/Home.tsx). Phase 2 = all remaining component files.`
    : `TARGET FILE COUNT: 2 files ONLY — src/index.css + src/pages/Home.tsx. ALL game logic goes in Home.tsx.`

  const referenceGuidance =
    '\n\n## REFERENCE LOOKUP (optional, max 2-3 calls)\n' +
    (skill === 'game'
      ? 'Look up realistic physics/mechanics parameters if needed.'
      : skill === 'webapp' ? 'Look up correct formulas/values if computing real things.'
      : 'Look up factual CONTENT for specific real businesses.')

  const prdSection = params.prdContext
    ? `\n\n## TECHNICAL IMPLEMENTATION PRD (follow this exactly)\n${params.prdContext}`
    : ''
  const fullSystem = params.systemPrompt + pipelineAddendum + referenceGuidance + prdSection + `\n\n${fileCountGuidance}`

  // ── Tool setup ────────────────────────────────────────────────────────────
  const planBox: { manifest: NormalizedManifest | null } = { manifest: null }
  const capturePlan = planProject({ onPlan: (m) => { planBox.manifest = m } })

  const PHASE1_CORE = new Set(['src/index.css', 'src/components/Layout.tsx', 'src/pages/Home.tsx', 'src/components/Phase2Sections.tsx'])
  const WEBAPP_PHASE1_CORE = new Set(['src/index.css', 'src/pages/Home.tsx'])
  const activePhase1Core = skill === 'webapp' ? WEBAPP_PHASE1_CORE : PHASE1_CORE
  const SCAFFOLD_OWNED = new Set([
    'src/index.css', 'package.json', 'src/main.tsx', 'src/App.tsx',
    'vite.config.ts', 'vite.config.js', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
    'index.html', 'tailwind.config.ts', 'tailwind.config.js', 'postcss.config.js', 'postcss.config.mjs',
    'src/lib/utils.ts', 'src/styles/cm-ui.css', 'src/components/NotFound.tsx',
    'src/components/__fallback.tsx', 'src/components/blocks/index.tsx', 'src/components/blocks/sections.tsx',
    'public/_redirects', '.npmrc',
  ])

  let p1GFCalled = false

  const pageMapPaths: string[] = activePageMap
    ? activePageMap.map((p: PageSpec) => `src/pages/${p.page.replace(/[^A-Za-z0-9]/g, '')}.tsx`)
    : []

  // Build a writer-compatible object for generateFiles (needs write + merge stub)
  const rawWriterForGF = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    write: (part: any) => writer.write(part),
    merge: (_: ReadableStream) => { /* generateFiles never calls merge */ },
    get onError() { return undefined },
    set onError(_: unknown) {},
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawGF = generateFiles({ writer: rawWriterForGF as any, modelId: FILE_GENERATION_MODEL, designContext }) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phase1GF = generateFiles({ writer: rawWriterForGF as any, modelId: FILE_GENERATION_MODEL, designContext, skipQualityGates: true }) as any
  // Split a generateFiles call into SPINE (Sonnet, cross-file reasoning) + LEAVES (DeepSeek Pro,
  // self-contained sections). Sequential (the write-path has never seen concurrent writers). Leaves
  // = src/components/sections/*. Cuts the Sonnet output ~in half → the initial-build cost drop.
  const isLeafPath = (p: string) => /^src\/components\/sections\//.test(p)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fanoutGenerate = async (spineGF: any, args: { sandboxId: string; paths: string[] }, ctx: any) => {
    const leafPaths = args.paths.filter(isLeafPath)
    const spinePaths = args.paths.filter((p) => !isLeafPath(p))
    const out: string[] = []
    if (spinePaths.length > 0) out.push(await spineGF.execute({ ...args, paths: spinePaths }, ctx))
    if (leafPaths.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let leafCtx: any = { ...ctx, toolCallId: `${ctx?.toolCallId ?? 'gen'}-leaves` }
      // FEED THE LEAVES THE SPINE — the spine (Layout, pages, data/types, index.css tokens) is
      // already written, so read it back and pin its EXACT shapes into the leaf call's context so
      // the leaves import the right names/shapes (no drift → no extra repair rounds that eat the
      // cost win). Best-effort: read failure → generate without it (the gates still protect).
      try {
        const sandbox = await Sandbox.get({ sandboxId: args.sandboxId })
        const parts: string[] = []
        for (const p of spinePaths) {
          const content = (await readSandboxFile(sandbox, p).catch(() => null)) ?? ''
          if (content.trim()) parts.push(`// ${p}\n${content.slice(0, 2500)}`)
        }
        if (parts.length > 0) {
          const spineMsg = {
            role: 'user' as const,
            content:
              'These SPINE files are ALREADY WRITTEN and are READ-ONLY context. Your section components ' +
              'MUST import from them and match their EXACT export names, prop types, data shapes, and ' +
              'design tokens — never invent different names or shapes:\n\n' + parts.join('\n\n'),
          }
          leafCtx = { ...leafCtx, messages: [...(ctx?.messages ?? []), spineMsg] }
        }
      } catch { /* no spine context — leaves stay gate-protected */ }
      // Create the leaf generator KNOWING the spine files already exist (existingPaths=spinePaths),
      // so the leaf's import-closure never regenerates Layout/data/types the leaves import — that
      // would overwrite the spine with a leaf-model version = drift + a duplicate/inconsistent brand.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leafGF = generateFiles({ writer: rawWriterForGF as any, modelId: LEAF_MODEL, designContext, existingPaths: spinePaths }) as any
      out.push(await leafGF.execute({ ...args, paths: leafPaths }, leafCtx))
    }
    return out.filter(Boolean).join('\n') || 'Files generated.'
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const websiteGF: any = {
    ...rawGF,
    execute: async (args: { sandboxId: string; paths: string[] }, ctx: unknown) => {
      let paths = args.paths.filter((p) => p !== 'src/index.css')
      if (isMultiPage) {
        const have = new Set(paths)
        const inject = pageMapPaths.filter((p) => !have.has(p))
        if (inject.length > 0) paths = [...paths, ...inject]
      }
      // SINGLE-MODEL BY DEFAULT (2026-08-18). Fan-out (Sonnet spine + DeepSeek Pro leaves) is now
      // OPT-IN only (FANOUT_ENABLED=true) because a live build proved it DRIFTS: a DeepSeek leaf
      // (ValueProps.tsx) shipped no default export while the spine imported it as default → blank →
      // a 15-min repair loop + cost OVER a single-model build. One model = one consistent export/
      // prop/type contract across every file = no cross-boundary drift. The whole site routes on the
      // single FILE_GENERATION_MODEL unless fan-out is explicitly turned on.
      if (process.env.FANOUT_ENABLED === 'true') {
        return fanoutGenerate(rawGF, { ...args, paths }, ctx)
      }
      return rawGF.execute({ ...args, paths }, ctx)
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guardedGF: any = skill === 'webapp' ? {
    ...rawGF,
    execute: async (args: { sandboxId: string; paths: string[] }, ctx: unknown) => {
      if (!p1GFCalled) {
        p1GFCalled = true
        const nonScaffold = args.paths.filter((p: string) => !SCAFFOLD_OWNED.has(p))
        const phase1Paths = nonScaffold.filter((p: string) => activePhase1Core.has(p))
        const phase2Paths = nonScaffold.filter((p: string) => !activePhase1Core.has(p))
        if (phase2Paths.length > 0 && !planBox.manifest) {
          planBox.manifest = {
            files: [
              ...phase1Paths.map((p: string) => ({ path: p, phase: 1, exports: ['default'] })),
              ...phase2Paths.map((p: string) => ({ path: p, phase: 2, exports: ['default'] })),
            ],
            phaseCount: 2, multiPhase: true, extraPackages: [],
          }
        }
        const filteredPaths = phase1Paths.length > 0 ? phase1Paths : nonScaffold.length > 0 ? nonScaffold : args.paths
        return phase1GF.execute({ ...args, paths: filteredPaths }, ctx)
      }
      return rawGF.execute(args, ctx)
    },
  } : (skill === 'website' ? websiteGF : rawGF)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipelineTools: Record<string, any> = skill === 'website'
    ? { loadSkill: loadSkill(), generateFiles: guardedGF, getUnsplashBatch: getUnsplashBatch(), planProject: capturePlan, lookupReference: lookupReference() }
    : skill === 'webapp'
    ? { loadSkill: loadSkill(), generateFiles: guardedGF, planProject: capturePlan, lookupReference: lookupReference() }
    : { loadSkill: loadSkill(), generateFiles: rawGF, planProject: capturePlan, lookupReference: lookupReference() }

  const maxSteps = skill === 'website' ? 12 : skill === 'webapp' ? 10 : 9

  // Each step gets its own 800s Vercel budget. Generation uses up to 700s — leaving
  // ~100s for post-processing (stamp, snapshot, CSS fix). If the AI hits 700s, the
  // stream is aborted and we return generationComplete=false so buildProject chains
  // to stepGenerate2 which finishes the missing files in a fresh 800s budget.
  const genBudgetMs = 700_000
  const genAbort = AbortSignal.timeout(genBudgetMs)

  writer.write({ id: 'srv-phase-gen', type: 'data-build-phase', data: { phase: 'generating', label: 'Generating your files...' } })

  // Transform messages: convert data-report-errors parts to text
  const transformedMessages = params.messages.map(message => ({
    ...message,
    parts: message.parts.map(part => {
      if (part.type === 'data-report-errors') {
        return {
          type: 'text' as const,
          text: `There are errors in the generated code:\n\`\`\`${(part as { data: { summary: string } }).data.summary}\`\`\`\nFix the errors reported.`,
        }
      }
      return part
    }),
  }))

  const aiResult = streamText({
    ...getModelOptions(DEFAULT_MODEL),
    system: fullSystem,
    messages: await convertToModelMessages(transformedMessages as ChatUIMessage[]),
    stopWhen: stepCountIs(maxSteps),
    maxOutputTokens: getMaxOutputTokens(DEFAULT_MODEL),
    tools: pipelineTools,
    abortSignal: genAbort,
    onError: error => console.error('[workflow-gen] AI error:', error),
  })

  // Pipe the AI stream through the silence filter into the step's writable stream.
  // The silence filter passes: (1) the opening line before any tool call, and
  // (2) the completion line at stream end. All repair narration between tool calls
  // is silently discarded.
  const silenced = (aiResult.toUIMessageStream({ sendReasoning: false, sendStart: false }) as ReadableStream<unknown>).pipeThrough(makeSilenceFilter())

  // Heartbeat removed (user request 2026-08-08): the rotating "Building your
  // components... / Polishing the design..." filler statements are gone. The
  // real generateFiles tool narration + build-phase events carry progress.
  try {
    const reader = silenced.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writer.write(value as any)
    }
    reader.releaseLock()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/abort|timeout|cancel/i.test(msg)) {
      console.error('[workflow-gen] stream drain error:', msg)
    }
  }

  // Synthetic manifest for website when AI skipped planProject
  if (!planBox.manifest && skill === 'website') {
    try {
      const steps = await Promise.race([
        aiResult.steps,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('steps-timeout')), 5000)),
      ])
      const allGenPaths: string[] = []
      for (const step of steps) {
        for (const tc of ((step.toolCalls as unknown) as Array<{ toolName: string; args: { paths?: string[] } }> ?? [])) {
          if (tc.toolName === 'generateFiles' && Array.isArray(tc.args?.paths)) allGenPaths.push(...tc.args.paths)
        }
      }
      // Synthetic manifest fallback (model skipped planProject) — SINGLE-PHASE (no shells): every
      // file is phase 1 so nothing gets deferred as a "being crafted" placeholder.
      const allUnique = [...new Set(allGenPaths)]
      if (allUnique.length >= 2) {
        planBox.manifest = {
          files: allUnique.map(p => ({ path: p, phase: 1, exports: ['default'] })),
          phaseCount: 1, multiPhase: false, extraPackages: [],
        }
      }
    } catch { /* non-fatal */ }
  }

  // Website Phase2Sections guarantee
  if (skill === 'website') {
    try {
      const existing = await readSandboxFile(sandbox, 'src/components/Phase2Sections.tsx')
      if (!existing || existing.trim().length < 20) {
        await sandbox.writeFiles([{ path: 'src/components/Phase2Sections.tsx', content: Buffer.from(`export default function Phase2Sections() {\n  return <div className="bg-background" style={{ minHeight: '60vh' }} />\n}\n`, 'utf8') }])
      }
    } catch { /* non-fatal */ }
  }

  if (planBox.manifest) {
    await checkAndStampMissingFiles(sandbox, planBox.manifest.files.map(f => f.path)).catch(() => {})
  }

  // Generation completeness = DISK TRUTH. Scan the manifest for any file that is still
  // a stub (sentinel) or missing. This catches BOTH the timeout-abort case and the
  // "AI finished naturally but skipped/renamed a manifest file" case (e.g. it planned
  // ReservationPreview.tsx but wrote ReservationForm.tsx). If any stub remains,
  // buildProject re-chains stepGenerate2 to complete exactly those files.
  let remainingStubs: string[] = []
  if (planBox.manifest) {
    remainingStubs = await findStubPaths(sandbox, planBox.manifest.files.map(f => f.path)).catch(() => [])
    if (remainingStubs.length > 0) {
      console.warn(`[stepGenerate] ${remainingStubs.length} stub/missing file(s) remain — will chain stepGenerate2: ${remainingStubs.join(', ')}`)
    }
  }

  // ── END-OF-GENERATION RESOLVE GATE (Phase 2 hard gate → generateMissingFile) ──
  // Catch LOCAL imports to files that were NEVER created — undeclared imports the model
  // invented mid-file (e.g. @/components/MainViewTimer, ./pages/Game). These blank the
  // preview via a Vite "failed to resolve import"; repairFile CAN'T fix them (it can't
  // create a file) — only generateMissingFile can (infers the export shape from the
  // importer). Scans ALL src files on disk (a closure/repair-created file can also import
  // something undeclared — not just manifest files). Bounded to 5 created (a runaway
  // import-inventor must not mint 20 files on REPAIR_MODEL); the rest are logged only.
  // Cost: ~1 cheap DeepSeek call per invented import (~$0.001–0.01) vs a failed build.
  try {
    let srcFiles: string[] = []
    try {
      const listCmd = await sandbox.runCommand({ detached: true, cmd: 'bash', args: ['-c', "find src -type f \\( -name '*.tsx' -o -name '*.ts' \\) 2>/dev/null | tee /tmp/cm-srcls.log >/dev/null"] })
      await Promise.race([listCmd.wait(), new Promise<void>((_, rej) => setTimeout(() => rej(new Error('ls timeout')), 15_000))])
      const lsLog = (await readSandboxFile(sandbox, '/tmp/cm-srcls.log')) ?? ''
      srcFiles = lsLog.split('\n').map(s => s.trim()).filter(Boolean)
    } catch { /* fall back below */ }
    if (srcFiles.length === 0 && planBox.manifest) srcFiles = planBox.manifest.files.map(f => f.path)

    // Read every src file's content (skip stubs — their imports aren't real yet).
    const onDisk: Array<{ path: string; content: string }> = []
    for (const p of srcFiles) {
      const content = await readSandboxFile(sandbox, p)
      if (content && !content.includes('__CM_STUB__')) onDisk.push({ path: p, content })
    }
    // Shared planner (also unit-tested by the replay harness) decides WHAT to create.
    const planned = (await plannedMissingFiles(onDisk, SCAFFOLD_RESOLVABLE))
      .filter(p => !onDisk.some(f => f.path === p.createPath))

    let created = 0
    for (const info of planned) {
      if (created >= 5) { console.warn(`[end-resolve-gate] >5 undeclared imports — recording rest, not creating`); break }
      const importerContent = onDisk.find(f => f.path === info.importer)?.content ?? ''
      const gen = await generateMissingFile(info.createPath, info.spec, importerContent).catch(() => null)
      if (gen) {
        await sandbox.writeFiles([{ path: info.createPath, content: Buffer.from(gen, 'utf8') }])
        created++
        logRepair({ layer: 'stamp-local-alias', action: 'end-resolve-created', detail: `${info.createPath} <- "${info.spec}" (imported by ${info.importer})`, sandboxId })
        console.warn(`[end-resolve-gate] created missing ${info.createPath} for import "${info.spec}"`)
      }
    }
    if (created > 0 && planBox.manifest) {
      remainingStubs = await findStubPaths(sandbox, planBox.manifest.files.map(f => f.path)).catch(() => remainingStubs)
    }
  } catch (e) { console.warn('[end-resolve-gate] non-fatal:', e instanceof Error ? e.message : e) }

  // ── HOME PAGE GUARANTEE ──────────────────────────────────────────────────────
  // The glob-router's index route is src/pages/Home.tsx. A MISSING Home isn't an
  // "unresolved import" (the router globs, it doesn't import) — so the resolve gate can't
  // catch it, and "/" renders the NotFound 404 (the exact notes-app failure: a stalled
  // build's continuation made support files but never the Home page). Guarantee it exists
  // for every non-game skill; if absent/stub, create a REAL page from the request + Layout.
  if (skill !== 'game') {
    try {
      const home = await readSandboxFile(sandbox, 'src/pages/Home.tsx')
      if (!home || home.trim().length < 40 || home.includes('__CM_STUB__')) {
        const layout = (await readSandboxFile(sandbox, 'src/components/Layout.tsx')) ?? ''
        const ctx = `This is the MAIN PAGE at the index route "/". Build the app's primary content here.\n` +
          `Original request: ${params.userText}\n\n` +
          (layout ? `It renders inside this Layout:\n${layout.slice(0, 2500)}` : '')
        const gen = await generateMissingFile('src/pages/Home.tsx', 'the app main/home page (default export React component)', ctx).catch(() => null)
        if (gen) {
          await sandbox.writeFiles([{ path: 'src/pages/Home.tsx', content: Buffer.from(gen, 'utf8') }])
          logRepair({ layer: 'stamp-local-alias', action: 'home-guarantee-created', detail: 'created missing src/pages/Home.tsx (would have been a 404)', sandboxId })
          console.warn('[home-guarantee] created missing src/pages/Home.tsx')
        }
      }
    } catch (e) { console.warn('[home-guarantee] non-fatal:', e instanceof Error ? e.message : e) }
  }

  // CSS sanity fix + palette lock
  try {
    const cssStream = await sandbox.readFile({ path: 'src/index.css' })
    if (cssStream) {
      const chunks: Buffer[] = []
      for await (const c of cssStream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string))
      let css = Buffer.concat(chunks).toString('utf8')
      let changed = false
      if (css.includes("@import 'tailwindcss/base'") || css.includes('@import "tailwindcss/base"')) {
        css = css
          .replace(/@import ['"]tailwindcss\/base['"]\s*;?/g, '@tailwind base;')
          .replace(/@import ['"]tailwindcss\/components['"]\s*;?/g, '@tailwind components;')
          .replace(/@import ['"]tailwindcss\/utilities['"]\s*;?/g, '@tailwind utilities;')
        changed = true
      }
      if (params.tokens) {
        const locked = lockPaletteInCss(css, params.tokens)
        if (locked && locked !== css) { css = locked; changed = true }
      } else if (!css.includes(':root')) {
        css += `\n:root {\n  --background: 0 0% 100%;\n  --foreground: 222.2 84% 4.9%;\n  --primary: 221.2 83.2% 53.3%;\n  --primary-foreground: 210 40% 98%;\n  --border: 214.3 31.8% 91.4%;\n  --radius: 0.5rem;\n}\n`
        changed = true
      }
      if (css.includes('@apply') || /@apply/i.test(css)) {
        const before = css; css = css.replace(/@apply\s+[^;{}\n]*;?/gi, ''); if (css !== before) changed = true
      }
      const validated = ensureValidCss(css)
      if (validated !== css) { css = validated; changed = true }
      if (changed) await sandbox.writeFiles([{ path: 'src/index.css', content: Buffer.from(css, 'utf8') }])
    }
  } catch { /* non-fatal */ }

  // Snapshot + code review run in parallel. The snapshot MUST be awaited (not
  // fire-and-forget) — if the step exits before the upload completes, snapshot_path
  // stays null in the DB forever and every resume attempt fails with "couldn't restore".
  const [snapshotPath] = await Promise.all([
    params.projectId && params.userId
      ? Promise.race([
          snapshotProject(sandbox, params.userId, params.projectId).catch(() => null),
          new Promise<null>(r => setTimeout(() => r(null), 55_000)),
        ])
      : Promise.resolve(null),
    reviewGeneratedCode(sandbox, skill).catch(() => {}),
  ])
  if (snapshotPath && params.projectId) {
    updateProjectRow(params.projectId, { sandbox_id: sandboxId, snapshot_path: snapshotPath }).catch(() => {})
  }

  let sandboxUrl = ''
  try { sandboxUrl = sandbox.domain(3000) } catch { sandboxUrl = `https://${sandboxId}-3000.sandbox.vercel.app` }

  await flushAndRelease()

  return {
    sandboxId,
    resolvedUrl: sandboxUrl,
    manifestFilePaths: planBox.manifest?.files.map(f => f.path) ?? [],
    planManifest: planBox.manifest,
    skill: params.skill,
    brandName: params.brandName,
    projectId: params.projectId,
    userId: params.userId,
    runId: params.runId,
    invocationStart: params.invocationStart,
    firstUserText: params.firstUserText,
    lastUserText: params.lastUserText,
    userText: params.userText,
    fullSystem,
    // DISK TRUTH: complete only when zero stubs remain. Unifies the abort path and
    // the skipped-file path — never relies on whether the stream was aborted.
    generationComplete: remainingStubs.length === 0,
  }
}

// ── Step 1B: Seamless continuation ───────────────────────────────────────────
// Completes ONLY the stub files still on disk (detected by STUB_SENTINEL), reusing
// the EXACT system prompt from stepGenerate (partial.fullSystem) so round 2 follows
// identical rules to round 1 and never re-does completed work. Returns an updated
// GenerateResult whose generationComplete is disk truth — buildProject re-chains this
// step (capped) until no stubs remain. Idempotent and safe to re-enter.

async function stepGenerate2(params: BuildPipelineParams, partial: GenerateResult): Promise<GenerateResult> {
  'use step'

  const { writer, flushAndRelease } = makeStepWriter(partial.runId)
  writer.write({ id: 'srv-phase-gen2', type: 'data-build-phase', data: { phase: 'generating', label: 'Completing remaining files...' } })

  // Reconnect to the sandbox — retry once before giving up (transient network blips
  // shouldn't abort a continuation). On hard failure we hand OFF to verify (which does
  // its own reconnect + dead-man's-switch), rather than silently claiming success.
  let sandbox: Sandbox | null = null
  for (let attempt = 0; attempt < 2 && !sandbox; attempt++) {
    try {
      sandbox = await Sandbox.get({ sandboxId: partial.sandboxId })
    } catch (err) {
      console.warn(`[stepGenerate2] sandbox reconnect attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err)
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000))
    }
  }
  if (!sandbox) {
    console.error('[stepGenerate2] sandbox unreachable after 2 attempts — handing off to verify with generation incomplete')
    await flushAndRelease()
    // NOT complete — but buildProject's cap will stop the loop and proceed to verify,
    // whose repair backstop + dead-man's-switch guarantee a working preview.
    return { ...partial, generationComplete: false }
  }

  // Stubs = disk truth via the shared sentinel scanner (no length thresholds).
  const stubPaths = await findStubPaths(sandbox, partial.manifestFilePaths).catch(() => [] as string[])

  if (stubPaths.length === 0) {
    await flushAndRelease()
    return { ...partial, generationComplete: true }
  }

  console.log(`[stepGenerate2] completing ${stubPaths.length} stub files:`, stubPaths)

  const { skill, brandName } = partial
  const rawWriterForGF = {
    write: (part: Parameters<PipelineWriter['write']>[0]) => writer.write(part),
    merge: (_: ReadableStream) => {},
    get onError() { return undefined },
    set onError(_: unknown) {},
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const continuationGF = generateFiles({ writer: rawWriterForGF as any, modelId: FILE_GENERATION_MODEL, designContext: params.designContext }) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const continuationTools: Record<string, any> = { generateFiles: continuationGF }

  // Per-stub export contracts from the manifest — instruct EXACT paths + exports so
  // the model can't rename (the ReservationForm-vs-Preview class of bug).
  const exportsByPath = new Map<string, string[]>()
  for (const f of partial.planManifest?.files ?? []) {
    if (Array.isArray(f.exports) && f.exports.length > 0) exportsByPath.set(f.path, f.exports)
  }
  const stubContractLines = stubPaths.map(p => {
    const exp = exportsByPath.get(p)
    return exp && exp.length > 0 ? `  - ${p}  (must export: ${exp.join(', ')})` : `  - ${p}`
  }).join('\n')
  const alreadyGenerated = partial.manifestFilePaths.filter(p => !stubPaths.includes(p))

  // CRITICAL: system prompt is byte-identical to stepGenerate's (partial.fullSystem).
  // All continuation-specific instructions go in the USER message so round 2 runs with
  // exactly the same rules/persona as round 1 — no behavioral drift across the handoff.
  const continuationUserMessage =
    `CONTINUATION — the previous generation step ended before finishing every file. ` +
    `The sandbox and all completed files are already in place.\n\n` +
    `sandboxId: ${partial.sandboxId}\nBrand: ${brandName ?? 'the project'}\nSkill: ${skill}\n\n` +
    `DO NOT call createSandbox, runCommand, getSandboxURL, planProject, or getUnsplashBatch.\n\n` +
    `These files are ALREADY DONE — do NOT regenerate or touch them:\n${alreadyGenerated.map(p => `  - ${p}`).join('\n') || '  (none)'}\n\n` +
    `These files are still empty placeholders and must be completed:\n${stubContractLines}\n\n` +
    `Call generateFiles ONCE with EXACTLY this path list (no additions, no renames): ` +
    `[${stubPaths.map(p => `"${p}"`).join(', ')}]\n` +
    `Generate each file COMPLETELY — production-quality, no placeholders, no TODOs. ` +
    `Match the exports listed above so imports from the already-done files resolve.\n\n` +
    `Original request: ${params.userText}`

  const gen2Budget = AbortSignal.timeout(700_000)

  const aiResult2 = streamText({
    ...getModelOptions(DEFAULT_MODEL),
    system: partial.fullSystem,
    messages: [{ role: 'user', content: continuationUserMessage }],
    stopWhen: stepCountIs(4),
    maxOutputTokens: getMaxOutputTokens(DEFAULT_MODEL),
    tools: continuationTools,
    abortSignal: gen2Budget,
    onError: error => console.error('[workflow-gen2] AI error:', error),
  })

  const silenced2 = (aiResult2.toUIMessageStream({ sendReasoning: false, sendStart: false }) as ReadableStream<unknown>).pipeThrough(makeSilenceFilter())
  try {
    const reader = silenced2.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      writer.write(value as Parameters<PipelineWriter['write']>[0])
    }
    reader.releaseLock()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/abort|timeout|cancel/i.test(msg)) console.error('[workflow-gen2] stream error:', msg)
  }

  // Re-stamp anything the AI still left missing, then recompute disk truth so
  // buildProject's loop knows whether another continuation round is needed.
  let remainingStubs: string[] = []
  if (partial.planManifest) {
    await checkAndStampMissingFiles(sandbox, partial.planManifest.files.map(f => f.path)).catch(() => {})
    remainingStubs = await findStubPaths(sandbox, partial.planManifest.files.map(f => f.path)).catch(() => [])
  }

  await flushAndRelease()
  return { ...partial, generationComplete: remainingStubs.length === 0 }
}

// COMPLETENESS GATE (NEW1) — shared by stepVerify + stepVerify2. A stamped SHELL page
// ("being crafted…") and a STUB both COMPILE + RENDER, so vite build and the headless check
// pass them — that's how the lighthouse site revealed with empty Lighthouse/Book/About pages.
// This detects every still-incomplete page (stub OR shell marker, including nav-linked pages the
// model forgot), tries ONCE to fill each with real content, then returns whatever is STILL
// incomplete so the caller's G3 gate withholds the reveal. Never reveal a half-built site.
async function completeIncompletePages(opts: {
  sandbox: Sandbox
  manifestFilePaths: string[]
  brandName: string | null
  resolvedUrl: string
  sandboxId: string
  withinBudget: () => boolean
}): Promise<string[]> {
  const { sandbox, manifestFilePaths, brandName, resolvedUrl, sandboxId, withinBudget } = opts
  let incompletePaths = await findIncompletePages(sandbox, manifestFilePaths).catch(() => [] as string[])
  if (incompletePaths.length === 0) return []
  logRepair({ layer: 'reveal-gate', action: 'completeness-detect', detail: `${incompletePaths.length} incomplete page(s): ${incompletePaths.slice(0, 8).join(', ')}`, sandboxId })
  for (const p of incompletePaths.slice(0, 6)) {
    if (!withinBudget()) break
    const shellContent = await readSandboxFile(sandbox, p).catch(() => null)
    if (!shellContent) continue
    const filled = await repairFile(
      p,
      shellContent,
      `This page is an unfinished PLACEHOLDER (a shell/stub). Replace it ENTIRELY with a complete, production-quality page of REAL content for "${brandName ?? 'this site'}" that matches the site's existing design system and the original request. No placeholders, no "being crafted" text, no lorem ipsum — real sections, real copy.`,
      FILE_GENERATION_MODEL,
    ).catch(() => null)
    if (filled && filled !== shellContent && !filled.includes('__CM_STUB__') && !filled.includes('__CM_SHELL__')) {
      await sandbox.writeFiles([{ path: p, content: Buffer.from(sanitizeTsx(p, filled), 'utf8') }])
    }
  }
  try { await restartDevServer(sandbox); await waitForDevServer(resolvedUrl, 25_000, sandbox) } catch { /* best-effort */ }
  incompletePaths = await findIncompletePages(sandbox, manifestFilePaths).catch(() => incompletePaths)
  if (incompletePaths.length > 0) {
    logRepair({ layer: 'reveal-gate', action: 'completeness-still-incomplete', detail: incompletePaths.slice(0, 8).join(', '), sandboxId })
  }
  return incompletePaths
}

// ── Step 2: Install + verify + reveal preview URL ────────────────────────────
// Returns null when fully done, or a VerifyCheckpoint when the 11-min deadline
// fires mid-verify. buildProject then chains to stepVerify2 for a fresh 800s budget.

async function stepVerify(params: BuildPipelineParams, genResult: GenerateResult): Promise<VerifyCheckpoint | null> {
  'use step'

  const stepStart = Date.now() // stepVerify's OWN invocation start — independent of invocationStart
  const STEP_DEADLINE_MS = 700_000 // 11.6 min — leaves 100s for flushAndRelease + return before Vercel's 800s hard kill; stepVerify2 gets fresh 800s

  const { writer, flushAndRelease } = makeStepWriter(genResult.runId)
  const { sandboxId, resolvedUrl: initialUrl, manifestFilePaths, skill, brandName, projectId, userId, runId, firstUserText, lastUserText } = genResult

  if (!sandboxId) {
    // No workspace ever came back from generation — a failure, NOT a silent success.
    writer.write({ id: 'srv-no-workspace', type: 'data-narration', data: { text: "I couldn't finish setting up your workspace this time — please hit send again and I'll pick it right back up." } })
    await flushAndRelease()
    if (runId) await updateRun(runId, { status: 'error' }).catch(() => {})
    return null
  }

  let sandbox: Sandbox
  try {
    sandbox = await Sandbox.get({ sandboxId })
  } catch (err) {
    console.warn('[stepVerify] sandbox reconnect failed:', err instanceof Error ? err.message : err)
    // Sandbox died before verify — surface it (was silently 'done'). Never claim success.
    writer.write({ id: 'srv-sandbox-lost', type: 'data-narration', data: { text: "I lost your workspace before I could finish — please hit send again and I'll pick it right back up." } })
    await flushAndRelease()
    if (runId) await updateRun(runId, { status: 'error' }).catch(() => {})
    return null
  }

  // Install
  writer.write({ id: 'srv-phase-install', type: 'data-build-phase', data: { phase: 'installing', label: 'Installing packages...' } })
  writer.write({ id: 'srv-install', type: 'data-run-command', data: { sandboxId, command: 'bun', args: ['install'], status: 'waiting' } })
  try {
    const installCmd = await sandbox.runCommand({ detached: true, cmd: 'bash', args: ['-c', 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'] })
    await Promise.race([installCmd.wait(), new Promise<void>((_, rej) => setTimeout(() => rej(new Error('install timed out')), 90_000))])
    writer.write({ id: 'srv-install', type: 'data-run-command', data: { sandboxId, command: 'bun', args: ['install'], status: 'done', exitCode: 0 } })
  } catch {
    writer.write({ id: 'srv-install', type: 'data-run-command', data: { sandboxId, command: 'bun', args: ['install'], status: 'error' } })
  }

  // Start dev server
  writer.write({ id: 'srv-phase-build', type: 'data-build-phase', data: { phase: 'building', label: 'Building and starting preview...' } })
  writer.write({ id: 'srv-dev', type: 'data-run-command', data: { sandboxId, command: 'bun', args: ['run', 'dev'], status: 'executing' } })
  try {
    const devCmd = await sandbox.runCommand({ detached: true, cmd: 'bash', args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'] })
    writer.write({ id: 'srv-dev', type: 'data-run-command', data: { sandboxId, commandId: devCmd.cmdId, command: 'bun', args: ['run', 'dev'], status: 'running' } })
  } catch { /* non-fatal */ }

  let resolvedUrl = initialUrl
  try { resolvedUrl = sandbox.domain(3000) } catch { /* keep initialUrl */ }

  let revealed = false
  let devError: string | null = null
  let rtStatus: VerifyCheckpoint['rtStatus'] = null

  // Helper: returns true if we're inside 11 minutes of THIS step's own budget
  const withinBudget = () => Date.now() - stepStart < STEP_DEADLINE_MS

  try {
    // #7: guarantee EVERY nav-linked page exists (not just Home) so no nav link 404s.
    // Extended from website-only to all non-game skills — a webapp sidebar (Dashboard/
    // Settings/etc.) must not 404 either. Games are single-file (no nav).
    if (skill !== 'game') {
      try { await ensureNavShells(sandbox, brandName ?? undefined) } catch { /* non-fatal */ }
    }

    const { vitePassed } = await verifyAndRepair({ sandbox, sandboxId, writer })
    // G5a: a FAILED production build (unresolved import, type error, etc.) is disk truth that
    // the app is broken — seed rtStatus='broken' so the reveal gate MUST run its render-check +
    // missing-import repair before showing anything. Never let a failed build reveal a
    // "best-effort" preview (that is exactly how the ./lib/image-utils blank shipped).
    if (!vitePassed) rtStatus = 'broken'

    writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { status: 'loading' } })
    devError = await waitForDevServer(resolvedUrl)

    if (devError && (await installMissingModules(sandbox, devError))) {
      logRepair({ layer: 'dev-500', action: 'auto-installed-and-restarted', detail: devError.slice(0, 200), sandboxId })
      await restartDevServer(sandbox)
      devError = await waitForDevServer(resolvedUrl)
    }

    if (devError) {
      logRepair({ layer: 'dev-500', action: 'silent-fallback', detail: devError.slice(0, 200), sandboxId })
      writer.write({ id: 'srv-quality-check', type: 'data-narration', data: { text: 'Running a few quality checks to ensure your project is working smoothly — please wait a moment.' } })
      try { await applyFallbackTerminalState(sandbox, devError, { skill, brand: brandName || 'This project' }) } catch { /* non-fatal */ }
    }

    if (projectId) updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: resolvedUrl }).catch(() => {})

    // 502 gate
    if (!devError) {
      try {
        const probe = await fetch(resolvedUrl, { signal: AbortSignal.timeout(5000) }).then(r => r.status).catch(() => 0)
        if (probe === 502) {
          logRepair({ layer: 'dev-502', action: 'reveal-gate-restart', detail: 'url 502 at reveal gate', sandboxId })
          await restartDevServer(sandbox)
          const recheck = await waitForDevServer(resolvedUrl, 30_000, sandbox)
          if (recheck) {
            devError = recheck
            writer.write({ id: 'srv-quality-check-2', type: 'data-narration', data: { text: 'Running a few quality checks to ensure your project is working smoothly — please wait a moment.' } })
            try { await applyFallbackTerminalState(sandbox, recheck, { skill, brand: brandName || 'This project' }) } catch { /* non-fatal */ }
          }
        }
      } catch { /* non-fatal */ }
    }

    if (skill !== 'game' && !devError) {
      try { await ensureNavShells(sandbox, brandName ?? undefined) } catch { /* non-fatal */ }
    }

    // ── Proactive missing-module generation ────────────────────────────────────
    // The scaffold's Vite plugin (cmMissingImportFallback) intercepts any @/ import
    // whose file doesn't exist and writes it to .cm-missing.log. We read that log NOW,
    // before the headless check, and generate the real files. HMR replaces the null
    // stubs automatically — no error overlay ever reaches the user.
    if (!devError) {
      try {
        const missingLog = await readSandboxFile(sandbox, '.cm-missing.log')
        if (missingLog && missingLog.trim().length > 0) {
          const missingSpecs = [...new Set(missingLog.trim().split('\n').map(s => s.trim()).filter(Boolean))]
          console.log(`[stepVerify] proactive missing-module generation: ${missingSpecs.join(', ')}`)
          const generated: string[] = []
          for (const spec of missingSpecs.slice(0, 6)) {
            const rawPath = spec.startsWith('@/') ? `src/${spec.slice(2)}` : spec
            const missingPath = /\.(tsx?|jsx?|css|json)$/.test(rawPath) ? rawPath : `${rawPath}.tsx`
            // Find an importer to use as context
            const importerPath = manifestFilePaths.find(p => p.endsWith('.tsx') || p.endsWith('.ts')) ?? 'src/pages/Home.tsx'
            const importerContent = await readSandboxFile(sandbox, importerPath).catch(() => null) ?? ''
            const content = await generateMissingFile(missingPath, spec, importerContent).catch(() => null)
            if (content) {
              await sandbox.writeFiles([{ path: missingPath, content: Buffer.from(sanitizeTsx(missingPath, content), 'utf8') }])
              generated.push(missingPath)
            }
          }
          if (generated.length > 0) {
            // Clear the log so a subsequent headless repair pass doesn't re-process
            await sandbox.writeFiles([{ path: '.cm-missing.log', content: Buffer.from('', 'utf8') }])
            // Give HMR time to apply the new files before the headless check
            await new Promise(r => setTimeout(r, 3500))
          }
        }
      } catch { /* non-fatal — headless repair is the safety net */ }
    }

    // ── 11-min deadline check: if we're already close, hand off to stepVerify2 ─
    // This fires BEFORE headless check / functional verify / QA so stepVerify2
    // gets a full fresh 800s to run them. No URL revealed yet — stepVerify2 does it.
    if (!devError && !withinBudget()) {
      console.warn(`[stepVerify] 11-min deadline reached after install+build+repair — handing off to stepVerify2`)
      await flushAndRelease()
      return { sandboxId, resolvedUrl, manifestFilePaths, skill, brandName, projectId, userId, runId, firstUserText, lastUserText, devError, revealed: false, rtStatus: null }
    }

    // Headless render check
    let rtResult: { status: 'ok' | 'broken' | 'skipped'; detail: string } | null = null
    if (!devError) {
      try {
        writer.write({ id: 'srv-runtime', type: 'data-run-command', data: { sandboxId, command: 'Checking your preview renders correctly', args: [], status: 'executing' } })
        let rt = await headlessRuntimeCheck(resolvedUrl, sandboxId)
        for (let attempt = 1; attempt <= 5 && rt.status === 'broken'; attempt++) {
          // Budget guard: if close to 11-min deadline, break and let stepVerify2 continue
          if (!withinBudget()) break
          let repairedAny = false

          // ── Priority 1: Missing module errors (Vite overlay) ──────────────────
          // Pattern: `Failed to resolve import "@/components/blocks/Section" from "src/pages/About.tsx"`
          // The errFileMatch regex below targets stack-trace patterns (File.tsx:line) which
          // don't appear here. Detect and CREATE the missing file instead of repairing the importer.
          const missingModuleMatches = [...rt.detail.matchAll(/Failed to resolve import\s+["']([^"']+)['"]\s+from\s+["']([^"']+)['"]/g)]
          if (missingModuleMatches.length > 0) {
            const seen = new Set<string>()
            for (const [, spec, importerRaw] of missingModuleMatches.slice(0, 4)) {
              const rawPath = spec.startsWith('@/') ? `src/${spec.slice(2)}` : spec.replace(/^\.\//, 'src/')
              const missingPath = /\.(tsx?|jsx?|css|json)$/.test(rawPath) ? rawPath : `${rawPath}.tsx`
              if (seen.has(missingPath)) continue
              seen.add(missingPath)
              const importerPath = importerRaw.replace(/^\/+/, '')
              const importerContent = await readSandboxFile(sandbox, importerPath).catch(() => null) ?? ''
              const generated = await generateMissingFile(missingPath, spec, importerContent).catch(() => null)
              if (generated) {
                await sandbox.writeFiles([{ path: missingPath, content: Buffer.from(sanitizeTsx(missingPath, generated), 'utf8') }])
                repairedAny = true
              }
            }
          }

          // ── Priority 2: Stack-trace errors (e.g. "ReservationsSections.tsx:979") ──
          if (!repairedAny) {
            const errFileMatch = rt.detail.match(/([A-Za-z0-9_.-]+\.tsx?):\d+/g)
            const errFileNames = errFileMatch
              ? [...new Set(errFileMatch.map(m => m.replace(/:\d+$/, '')))]
              : []
            const candidates: string[] = []
            for (const fname of errFileNames) {
              const candidate = manifestFilePaths.find(p => p.endsWith('/' + fname) || p === fname || p.endsWith(fname))
                ?? ['src/pages', 'src/components', 'src'].map(dir => `${dir}/${fname}`).find(() => true)
                ?? `src/pages/${fname}`
              if (!candidates.includes(candidate)) candidates.push(candidate)
            }
            if (!candidates.includes('src/pages/Home.tsx')) candidates.push('src/pages/Home.tsx')
            for (const filePath of candidates.slice(0, 4)) {
              const content = await readSandboxFile(sandbox, filePath)
              if (!content) continue
              const fixed = await repairFile(filePath, content, rt.detail).catch(() => null)
              if (!fixed || fixed === content) continue
              await sandbox.writeFiles([{ path: filePath, content: Buffer.from(sanitizeTsx(filePath, fixed), 'utf8') }])
              repairedAny = true
            }
          }

          if (!repairedAny) break
          await new Promise(r => setTimeout(r, 2500))
          rt = await headlessRuntimeCheck(resolvedUrl, sandboxId)
        }
        rtResult = rt
        rtStatus = rt.status
        writer.write({ id: 'srv-runtime', type: 'data-run-command', data: { sandboxId, command: 'Checking your preview renders correctly', args: [], status: 'done', exitCode: 0 } })
      } catch (e) {
        console.warn('[verify] headless check failed:', e instanceof Error ? e.message : e)
      }
    }

    if (!devError && rtResult && rtResult.status === 'broken') {
      try {
        // Re-check after HMR may have applied a previous repair
        const finalCheck = await headlessRuntimeCheck(resolvedUrl, sandboxId).catch(() => null)
        if (finalCheck) rtStatus = finalCheck.status
      } catch { /* non-fatal */ }
    }

    // ── 11-min deadline check again: hand off functional verify + QA to stepVerify2 ─
    if (!devError && !withinBudget()) {
      console.warn(`[stepVerify] 11-min deadline reached after headless — handing off functional verify to stepVerify2`)
      await flushAndRelease()
      return { sandboxId, resolvedUrl, manifestFilePaths, skill, brandName, projectId, userId, runId, firstUserText, lastUserText, devError, revealed: false, rtStatus }
    }

    // Functional verify
    if (!devError) {
      writer.write({ id: 'srv-playtest', type: 'data-run-command', data: { sandboxId, command: skill === 'game' ? 'Playtesting your game and polishing it' : 'Testing every feature and polishing it', args: [], status: 'executing' } })
      try {
        const request = firstUserText || lastUserText || ''
        for (let round = 1; round <= 3; round++) {
          if (!withinBudget()) break
          const fv = await functionalVerify(resolvedUrl, request, skill)
          if (fv.ok || fv.issues.length === 0) break
          logRepair({ layer: 'runtime-check', action: `functional-issues-r${round}`, detail: fv.issues.slice(0, 3).join(' | ').slice(0, 180), sandboxId })
          const issueText = `Fix these SPECIFIC problems:\n- ${fv.issues.join('\n- ')}`
          let changedAny = false
          for (const path of ['src/pages/Home.tsx', ...manifestFilePaths.filter(p => /\.(tsx|ts)$/.test(p))].slice(0, 8)) {
            const content = await readSandboxFile(sandbox, path)
            if (!content) continue
            const fixed = await repairFile(path, content, issueText)
            if (fixed && fixed !== content) {
              await sandbox.writeFiles([{ path, content: Buffer.from(sanitizeTsx(path, fixed), 'utf8') }])
              changedAny = true
            }
          }
          if (!changedAny) break
          await new Promise(r => setTimeout(r, 2500))
        }
      } catch { /* non-fatal */ }
      writer.write({ id: 'srv-playtest', type: 'data-run-command', data: { sandboxId, command: 'Playtest complete', args: [], status: 'done', exitCode: 0 } })
    }

    // W6: AI QA — runs only if there's still budget
    if (!devError && withinBudget()) {
      try {
        const request = firstUserText || lastUserText || ''
        const w6 = await aiDrivenQA(resolvedUrl, request, skill)
        if (!w6.ok && w6.issues.length > 0) {
          logRepair({ layer: 'runtime-check', action: 'w6-ai-qa', detail: w6.issues.slice(0, 3).join(' | ').slice(0, 180), sandboxId })
          const issueText = `Fix these SPECIFIC UX/visual problems found during AI-directed QA:\n- ${w6.issues.join('\n- ')}`
          for (const path of ['src/pages/Home.tsx', ...manifestFilePaths.filter(p => /\.(tsx|ts)$/.test(p))].slice(0, 6)) {
            const content = await readSandboxFile(sandbox, path)
            if (!content) continue
            const fixed = await repairFile(path, content, issueText)
            if (fixed && fixed !== content) {
              await sandbox.writeFiles([{ path, content: Buffer.from(sanitizeTsx(path, fixed), 'utf8') }])
            }
          }
        }
      } catch { /* W6 is best-effort — never blocks reveal */ }
    }

    // Reveal — do one final headless check to confirm the preview actually renders
    // before telling the user it's ready. This prevents the "cream blank" problem
    // where a broken JS app passes all earlier checks.
    if (!revealed) {
      const finalDevError = await waitForDevServer(resolvedUrl, 20_000, sandbox).catch(() => null)
      if (finalDevError) {
        try { await restartDevServer(sandbox); await waitForDevServer(resolvedUrl, 25_000, sandbox) } catch { /* best-effort */ }
      }
      // NOTE (NEW1 reverted from reveal): completeness of phase-2 SHELLS is enforced in the
      // ENRICHMENT flow (lib/enrichment.ts), NOT here — shells at reveal are the INTENDED
      // fast-preview state that enrichment fills live via HMR. Blocking reveal on them broke the
      // fast-preview architecture + burned repairs on healthy builds. This gate only withholds a
      // genuinely BROKEN render (below).
      // ── PHASE 5: gate the reveal on a FRESH render-check PASS ─────────────────
      // Reveal only after a fresh headless check passes. rtStatus 'broken' OR null both
      // demand a fresh check — a stale 'fine' can hide a killing write that landed after
      // the last check (tonight's class). Bounded repair between checks; a write needs a
      // dev-server restart (Vite stale-resolve won't clear otherwise — tonight's lesson).
      // SAFETY NET (monotonic): on budget-exhaust OR an unavailable check we reveal ANYWAY
      // (today's behavior) so the gate can NEVER hold previews hostage on a false-negative.
      let gateAttempts = 0
      while (withinBudget() && gateAttempts < 3 && (rtStatus === 'broken' || rtStatus === null)) {
        let fresh: Awaited<ReturnType<typeof headlessRuntimeCheck>> | null = null
        try { fresh = await headlessRuntimeCheck(resolvedUrl, sandboxId) } catch { fresh = null }
        if (!fresh) break // check unavailable → don't block reveal (it logs loudly elsewhere)
        rtStatus = fresh.status
        if (fresh.status !== 'broken') break // fresh PASS → reveal
        // 3-TRY ESCALATION (user rule): attempts 1-2 use cheap Flash; the 3rd (final) uses
        // Claude — a stubborn error the cheap model can't crack gets the frontier model.
        const repairModel = gateAttempts >= 2 ? FILE_GENERATION_MODEL : REPAIR_MODEL
        logRepair({ layer: 'runtime-check', action: `reveal-gate-r${gateAttempts + 1}${gateAttempts >= 2 ? '-claude' : ''}`, detail: (fresh.detail || '').slice(0, 180), sandboxId })
        let wrote = false
        // Missing-file class: "Failed to resolve import X from Y" → CREATE X (repairFile
        // can't create a file — this is what let tonight's blank through). Parse from the
        // FULL detail (not the truncated log line).
        const resolveMatch = (fresh.detail || '').match(/Failed to resolve import "([^"]+)" from "([^"]+)"/)
        if (resolveMatch) {
          const spec = resolveMatch[1]
          const importerPath = resolveMatch[2].replace(/^.*\/(src\/)/, 'src/')
          const importerContent = await readSandboxFile(sandbox, importerPath).catch(() => null)
          const base = localImportBasePath(importerPath, spec)
          if (base) {
            const name = base.split('/').pop() ?? ''
            const usedAsJsx = name.length > 0 && new RegExp(`<${name}[\\s/>]`).test(importerContent ?? '')
            const ext = (usedAsJsx || /\/(components|pages|sections|screens|views|layouts)\//.test('/' + base)) ? '.tsx' : '.ts'
            const createPath = base + ext
            const gen = await generateMissingFile(createPath, spec, importerContent ?? '', repairModel).catch(() => null)
            if (gen) {
              await sandbox.writeFiles([{ path: createPath, content: Buffer.from(gen, 'utf8') }])
              wrote = true
              logRepair({ layer: 'stamp-local-alias', action: 'reveal-gate-created', detail: `${createPath} <- "${spec}"`, sandboxId })
            }
          }
        }
        if (!wrote) {
          for (const path of ['src/pages/Home.tsx', ...manifestFilePaths.filter(p => /\.(tsx|ts)$/.test(p))].slice(0, 6)) {
            const content = await readSandboxFile(sandbox, path)
            if (!content) continue
            const fixed = await repairFile(path, content, `The rendered page is broken/blank before reveal. Fix this so it renders:\n${fresh.detail || 'runtime error / blank render'}`, repairModel)
            if (fixed && fixed !== content) { await sandbox.writeFiles([{ path, content: Buffer.from(sanitizeTsx(path, fixed), 'utf8') }]); wrote = true }
          }
        }
        if (!wrote) break // nothing to change → fall through to the G3 gate below
        try { await restartDevServer(sandbox); await waitForDevServer(resolvedUrl, 25_000, sandbox) } catch { /* best-effort */ }
        gateAttempts++
      }
      // ── G3: NEVER reveal a broken build ──────────────────────────────────────
      // All three loop exits (budget-exhaust, check-unavailable, nothing-to-repair) fall
      // through here with rtStatus still 'broken' (G5a also seeds 'broken' when the production
      // build failed). Instead of the old "reveal ANYWAY" hatch, CHAIN to a fresh stepVerify2
      // budget so the repair keeps going — the loader stays up, no blank/URL is emitted.
      // stepVerify is always the FIRST attempt, so it always chains once; the cap + terminal
      // handoff live in stepVerify2. flushAndRelease runs in the finally — do NOT call it here.
      if (rtStatus === 'broken') {
        logRepair({ layer: 'reveal-gate', action: 'withhold-chain-1', detail: 'render still broken — chaining fresh budget instead of revealing', sandboxId })
        return { sandboxId, resolvedUrl, manifestFilePaths, skill, brandName, projectId, userId, runId, firstUserText, lastUserText, devError, revealed: false, rtStatus, revealChainCount: 1 }
      }
      writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { url: resolvedUrl, status: 'done' } })
      revealed = true
    }
    const brand = brandName ?? 'your project'
    // After G3, a 'broken' rtStatus never reaches reveal (it chains/terminal-fails above), so
    // the only residual "issue" at reveal is a dev-server warning.
    const isHavingIssues = !!devError
    const readyText = isHavingIssues
      ? `${brand.charAt(0).toUpperCase() + brand.slice(1)} is available — we're still polishing a few things. If the preview looks off, describe what you'd like changed and we'll fix it right away.`
      : `${brand.charAt(0).toUpperCase() + brand.slice(1)} is ready — open the Preview tab to see it live.`
    writer.write({ id: 'srv-ready-narration', type: 'data-narration', data: { text: readyText } })
    if (projectId) updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: resolvedUrl }).catch(() => {})

    void (async () => {
      try {
        const items = await generateSuggestions({ request: lastUserText, skill, filePaths: manifestFilePaths })
        if (items.length) writer.write({ id: 'srv-suggestions', type: 'data-suggestions', data: { items } })
      } catch { /* non-fatal */ }
    })()

    if (!devError) saveCheckpoint(sandbox).catch(() => {})
    if (projectId && userId) {
      let snapshotPath: string | null = null
      for (let attempt = 0; attempt < 2 && !snapshotPath; attempt++) {
        try { snapshotPath = await Promise.race([snapshotProject(sandbox, userId, projectId), new Promise<null>(r => setTimeout(() => r(null), 60_000))]) } catch { /* retry */ }
      }
      await updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: resolvedUrl, ...(snapshotPath ? { snapshot_path: snapshotPath } : {}) }).catch(() => {})
    }

  } catch (err) {
    console.error('[stepVerify] error:', err instanceof Error ? err.message : err)
    if (!revealed && resolvedUrl) {
      writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { url: resolvedUrl, status: 'done' } })
    }
  } finally {
    await flushAndRelease()
    if (runId && revealed) await updateRun(runId, { status: 'done' }).catch(() => {})
    // If not revealed we return a checkpoint — don't mark done yet (stepVerify2 will)
  }
  return null // fully done — stepVerify2 not needed
}

// ── Step 3: Continuation verify (runs only when stepVerify hit its 11-min deadline) ──
// Gets a fresh 800s budget to finish functional verify, QA, and reveal the preview URL.

// stepVerify2 is also the continuation for itself — returns another checkpoint if it also
// hits the 11-min deadline (extremely rare, but guaranteed-safe via the while loop above).
async function stepVerify2(checkpoint: VerifyCheckpoint): Promise<VerifyCheckpoint | null> {
  'use step'

  const stepStart = Date.now()
  const STEP_DEADLINE_MS = 700_000 // same 11.6-min soft deadline as stepVerify
  const withinBudget = () => Date.now() - stepStart < STEP_DEADLINE_MS

  const { sandboxId, resolvedUrl, manifestFilePaths, skill, brandName, projectId, userId, runId, firstUserText, lastUserText, devError } = checkpoint
  const { writer, flushAndRelease } = makeStepWriter(runId)

  let sandbox: Sandbox
  try {
    sandbox = await Sandbox.get({ sandboxId })
  } catch (err) {
    console.warn('[stepVerify2] sandbox reconnect failed:', err instanceof Error ? err.message : err)
    // Sandbox is DEAD. Revealing its URL now = a guaranteed blank. Only preserve a reveal that
    // ALREADY happened (user has a working preview from an earlier step); otherwise surface the
    // failure in plain words and mark 'error' — never freshly reveal a dead-sandbox URL.
    if (!checkpoint.revealed) {
      writer.write({ id: 'srv-sandbox-lost', type: 'data-narration', data: { text: "I lost your workspace before I could finish — please hit send again and I'll pick it right back up." } })
    }
    await flushAndRelease()
    if (runId) await updateRun(runId, { status: checkpoint.revealed ? 'done' : 'error' }).catch(() => {})
    return null
  }

  let revealed = false
  let rtStatus = checkpoint.rtStatus
  try {
    // If stepVerify timed out before running the headless check (rtStatus === null),
    // run it now with the same targeted repair logic before moving to functional verify.
    if (!devError && rtStatus === null) {
      // Proactive missing-module generation — read .cm-missing.log from the Vite plugin
      try {
        const missingLog = await readSandboxFile(sandbox, '.cm-missing.log')
        if (missingLog && missingLog.trim().length > 0) {
          const missingSpecs = [...new Set(missingLog.trim().split('\n').map(s => s.trim()).filter(Boolean))]
          for (const spec of missingSpecs.slice(0, 6)) {
            const rawPath = spec.startsWith('@/') ? `src/${spec.slice(2)}` : spec
            const missingPath = /\.(tsx?|jsx?|css|json)$/.test(rawPath) ? rawPath : `${rawPath}.tsx`
            const importerPath = manifestFilePaths.find(p => p.endsWith('.tsx') || p.endsWith('.ts')) ?? 'src/pages/Home.tsx'
            const importerContent = await readSandboxFile(sandbox, importerPath).catch(() => null) ?? ''
            const content = await generateMissingFile(missingPath, spec, importerContent).catch(() => null)
            if (content) await sandbox.writeFiles([{ path: missingPath, content: Buffer.from(sanitizeTsx(missingPath, content), 'utf8') }])
          }
          await sandbox.writeFiles([{ path: '.cm-missing.log', content: Buffer.from('', 'utf8') }])
          await new Promise(r => setTimeout(r, 3500))
        }
      } catch { /* non-fatal */ }

      try {
        writer.write({ id: 'srv-preview-starting', type: 'data-narration', data: { text: 'Checking your preview renders correctly — almost there.' } })
        let rt = await headlessRuntimeCheck(resolvedUrl, sandboxId)
        for (let attempt = 1; attempt <= 5 && rt.status === 'broken'; attempt++) {
          if (!withinBudget()) break
          let repairedAny = false

          // Priority 1: Missing module (Vite overlay) — create the missing file
          const missingModuleMatches = [...rt.detail.matchAll(/Failed to resolve import\s+["']([^"']+)['"]\s+from\s+["']([^"']+)['"]/g)]
          if (missingModuleMatches.length > 0) {
            const seen = new Set<string>()
            for (const [, spec, importerRaw] of missingModuleMatches.slice(0, 4)) {
              const rawPath = spec.startsWith('@/') ? `src/${spec.slice(2)}` : spec.replace(/^\.\//, 'src/')
              const missingPath = /\.(tsx?|jsx?|css|json)$/.test(rawPath) ? rawPath : `${rawPath}.tsx`
              if (seen.has(missingPath)) continue
              seen.add(missingPath)
              const importerPath = importerRaw.replace(/^\/+/, '')
              const importerContent = await readSandboxFile(sandbox, importerPath).catch(() => null) ?? ''
              const generated = await generateMissingFile(missingPath, spec, importerContent).catch(() => null)
              if (generated) {
                await sandbox.writeFiles([{ path: missingPath, content: Buffer.from(sanitizeTsx(missingPath, generated), 'utf8') }])
                repairedAny = true
              }
            }
          }

          // Priority 2: Stack-trace errors — repair the offending file
          if (!repairedAny) {
            const errFileMatch = rt.detail.match(/([A-Za-z0-9_.-]+\.tsx?):\d+/g)
            const errFileNames = errFileMatch ? [...new Set(errFileMatch.map(m => m.replace(/:\d+$/, '')))] : []
            const candidates: string[] = []
            for (const fname of errFileNames) {
              const candidate = manifestFilePaths.find(p => p.endsWith('/' + fname) || p === fname || p.endsWith(fname))
                ?? `src/pages/${fname}`
              if (!candidates.includes(candidate)) candidates.push(candidate)
            }
            if (!candidates.includes('src/pages/Home.tsx')) candidates.push('src/pages/Home.tsx')
            for (const filePath of candidates.slice(0, 4)) {
              const content = await readSandboxFile(sandbox, filePath)
              if (!content) continue
              const fixed = await repairFile(filePath, content, rt.detail).catch(() => null)
              if (!fixed || fixed === content) continue
              await sandbox.writeFiles([{ path: filePath, content: Buffer.from(sanitizeTsx(filePath, fixed), 'utf8') }])
              repairedAny = true
            }
          }

          if (!repairedAny) break
          await new Promise(r => setTimeout(r, 2500))
          rt = await headlessRuntimeCheck(resolvedUrl, sandboxId)
        }
        rtStatus = rt.status
        if (rt.status === 'broken') {
          // Re-check — HMR may have applied previous repairs
          const fc = await headlessRuntimeCheck(resolvedUrl, sandboxId).catch(() => null)
          if (fc) rtStatus = fc.status
        }
      } catch { /* non-fatal */ }
    }

    // Functional verify
    if (!devError) {
      writer.write({ id: 'srv-playtest', type: 'data-run-command', data: { sandboxId, command: skill === 'game' ? 'Playtesting your game and polishing it' : 'Testing every feature and polishing it', args: [], status: 'executing' } })
      try {
        const request = firstUserText || lastUserText || ''
        for (let round = 1; round <= 3; round++) {
          if (!withinBudget()) break
          const fv = await functionalVerify(resolvedUrl, request, skill)
          if (fv.ok || fv.issues.length === 0) break
          logRepair({ layer: 'runtime-check', action: `v2-functional-r${round}`, detail: fv.issues.slice(0, 3).join(' | ').slice(0, 180), sandboxId })
          const issueText = `Fix these SPECIFIC problems:\n- ${fv.issues.join('\n- ')}`
          let changedAny = false
          for (const path of ['src/pages/Home.tsx', ...manifestFilePaths.filter(p => /\.(tsx|ts)$/.test(p))].slice(0, 8)) {
            const content = await readSandboxFile(sandbox, path)
            if (!content) continue
            const fixed = await repairFile(path, content, issueText)
            if (fixed && fixed !== content) {
              await sandbox.writeFiles([{ path, content: Buffer.from(sanitizeTsx(path, fixed), 'utf8') }])
              changedAny = true
            }
          }
          if (!changedAny) break
          await new Promise(r => setTimeout(r, 2500))
        }
      } catch { /* non-fatal */ }
      writer.write({ id: 'srv-playtest', type: 'data-run-command', data: { sandboxId, command: 'Playtest complete', args: [], status: 'done', exitCode: 0 } })

      // 11-min deadline: hand off to another stepVerify2 if QA would exceed budget
      if (!withinBudget()) {
        console.warn('[stepVerify2] 11-min deadline reached after functional verify — chaining another stepVerify2')
        await flushAndRelease()
        return { sandboxId, resolvedUrl, manifestFilePaths, skill, brandName, projectId, userId, runId, firstUserText, lastUserText, devError, revealed: false, rtStatus }
      }

      // W6 QA
      try {
        const request = firstUserText || lastUserText || ''
        const w6 = await aiDrivenQA(resolvedUrl, request, skill)
        if (!w6.ok && w6.issues.length > 0) {
          const issueText = `Fix these SPECIFIC UX/visual problems:\n- ${w6.issues.join('\n- ')}`
          for (const path of ['src/pages/Home.tsx', ...manifestFilePaths.filter(p => /\.(tsx|ts)$/.test(p))].slice(0, 6)) {
            const content = await readSandboxFile(sandbox, path)
            if (!content) continue
            const fixed = await repairFile(path, content, issueText)
            if (fixed && fixed !== content) {
              await sandbox.writeFiles([{ path, content: Buffer.from(sanitizeTsx(path, fixed), 'utf8') }])
            }
          }
        }
      } catch { /* non-fatal */ }
    }

    // Reveal URL — PHASE 5 gate: reveal only on a FRESH render-check pass (same as
    // stepVerify). Budget-exhaust / unavailable-check reveals anyway (monotonic safety net).
    const finalDevError = await waitForDevServer(resolvedUrl, 20_000, sandbox).catch(() => null)
    if (finalDevError) {
      try { await restartDevServer(sandbox); await waitForDevServer(resolvedUrl, 25_000, sandbox) } catch { /* best-effort */ }
    }
    // NOTE (NEW1 reverted): shell completeness is enforced in enrichment (lib/enrichment.ts), not
    // at reveal — see stepVerify. This gate only withholds a genuinely BROKEN render.
    let gateAttempts = 0
    while (withinBudget() && gateAttempts < 3 && (rtStatus === 'broken' || rtStatus === null)) {
      let fresh: Awaited<ReturnType<typeof headlessRuntimeCheck>> | null = null
      try { fresh = await headlessRuntimeCheck(resolvedUrl, sandboxId) } catch { fresh = null }
      if (!fresh) break
      rtStatus = fresh.status
      if (fresh.status !== 'broken') break
      // 3-try escalation: attempts 1-2 Flash, 3rd Claude (same rule as stepVerify).
      // Escalation: a CHAINED attempt (revealChainCount>0) already burned 3 Flash tries in the
      // prior step, so start on the frontier model instead of repeating what failed.
      const repairModel = (gateAttempts >= 2 || (checkpoint.revealChainCount ?? 0) > 0) ? FILE_GENERATION_MODEL : REPAIR_MODEL
      logRepair({ layer: 'runtime-check', action: `reveal-gate2-r${gateAttempts + 1}${repairModel === FILE_GENERATION_MODEL ? '-claude' : ''}`, detail: (fresh.detail || '').slice(0, 180), sandboxId })
      let wrote = false
      const resolveMatch2 = (fresh.detail || '').match(/Failed to resolve import "([^"]+)" from "([^"]+)"/)
      if (resolveMatch2) {
        const spec = resolveMatch2[1]
        const importerPath = resolveMatch2[2].replace(/^.*\/(src\/)/, 'src/')
        const importerContent = await readSandboxFile(sandbox, importerPath).catch(() => null)
        const base = localImportBasePath(importerPath, spec)
        if (base) {
          const name = base.split('/').pop() ?? ''
          const usedAsJsx = name.length > 0 && new RegExp(`<${name}[\\s/>]`).test(importerContent ?? '')
          const ext = (usedAsJsx || /\/(components|pages|sections|screens|views|layouts)\//.test('/' + base)) ? '.tsx' : '.ts'
          const createPath = base + ext
          const gen = await generateMissingFile(createPath, spec, importerContent ?? '', repairModel).catch(() => null)
          if (gen) {
            await sandbox.writeFiles([{ path: createPath, content: Buffer.from(gen, 'utf8') }])
            wrote = true
            logRepair({ layer: 'stamp-local-alias', action: 'reveal-gate2-created', detail: `${createPath} <- "${spec}"`, sandboxId })
          }
        }
      }
      if (!wrote) {
        for (const path of ['src/pages/Home.tsx', ...manifestFilePaths.filter(p => /\.(tsx|ts)$/.test(p))].slice(0, 6)) {
          const content = await readSandboxFile(sandbox, path)
          if (!content) continue
          const fixed = await repairFile(path, content, `The rendered page is broken/blank before reveal. Fix this so it renders:\n${fresh.detail || 'runtime error / blank render'}`, repairModel)
          if (fixed && fixed !== content) { await sandbox.writeFiles([{ path, content: Buffer.from(sanitizeTsx(path, fixed), 'utf8') }]); wrote = true }
        }
      }
      if (!wrote) break
      try { await restartDevServer(sandbox); await waitForDevServer(resolvedUrl, 25_000, sandbox) } catch { /* best-effort */ }
      gateAttempts++
    }
    // ── G3: NEVER reveal a broken build (continuation) ───────────────────────
    // Same enforcement as stepVerify. This is a CHAINED attempt (revealChainCount>0 when it came
    // from a withheld reveal). Chain again until the cap (2), then TERMINAL-FAIL with plain words:
    // mark the run 'error', emit NO preview URL, return null. The loader stays up until then; the
    // 45-min reaper is the final backstop. flushAndRelease runs in the finally — not here.
    if (rtStatus === 'broken') {
      const nextChain = (checkpoint.revealChainCount ?? 0) + 1
      // Persistence: keep working across fresh budgets rather than revealing a broken render.
      if (nextChain <= 2) {
        logRepair({ layer: 'reveal-gate', action: `withhold-chain-${nextChain}`, detail: 'render still broken — chaining fresh budget', sandboxId })
        return { sandboxId, resolvedUrl, manifestFilePaths, skill, brandName, projectId, userId, runId, firstUserText, lastUserText, devError, revealed: false, rtStatus: 'broken', revealChainCount: nextChain }
      }
      logRepair({ layer: 'reveal-gate', action: 'terminal-broken', detail: `reveal withheld after ${nextChain - 1} chained attempt(s) — render still broken`, sandboxId })
      writer.write({ id: 'srv-broken-terminal', type: 'data-narration', data: { text: "I'm putting the final polish on your preview and didn't want to show you anything half-finished. Give me a moment and refresh, or send a quick nudge and I'll wrap it up right away." } })
      if (runId) await updateRun(runId, { status: 'error' }).catch(() => {})
      return null
    }
    writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { url: resolvedUrl, status: 'done' } })
    revealed = true

    const brand = brandName ?? 'your project'
    // After G3, a 'broken' rtStatus never reaches reveal (it chains/terminal-fails above), so
    // the only residual "issue" at reveal is a dev-server warning.
    const isHavingIssues = !!devError
    const readyText = isHavingIssues
      ? `${brand.charAt(0).toUpperCase() + brand.slice(1)} is available — we're still polishing a few things. If the preview looks off, describe what you'd like changed and we'll fix it right away.`
      : `${brand.charAt(0).toUpperCase() + brand.slice(1)} is ready — open the Preview tab to see it live.`
    writer.write({ id: 'srv-ready-narration', type: 'data-narration', data: { text: readyText } })
    if (projectId) updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: resolvedUrl }).catch(() => {})

    void (async () => {
      try {
        const items = await generateSuggestions({ request: lastUserText, skill, filePaths: manifestFilePaths })
        if (items.length) writer.write({ id: 'srv-suggestions', type: 'data-suggestions', data: { items } })
      } catch { /* non-fatal */ }
    })()

    if (!devError) saveCheckpoint(sandbox).catch(() => {})
    if (projectId && userId) {
      let snapshotPath: string | null = null
      for (let attempt = 0; attempt < 2 && !snapshotPath; attempt++) {
        try { snapshotPath = await Promise.race([snapshotProject(sandbox, userId, projectId), new Promise<null>(r => setTimeout(() => r(null), 60_000))]) } catch { /* retry */ }
      }
      await updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: resolvedUrl, ...(snapshotPath ? { snapshot_path: snapshotPath } : {}) }).catch(() => {})
    }

  } catch (err) {
    console.error('[stepVerify2] error:', err instanceof Error ? err.message : err)
    if (!revealed && resolvedUrl) {
      writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { url: resolvedUrl, status: 'done' } })
    }
  } finally {
    await flushAndRelease()
    if (runId && revealed) await updateRun(runId, { status: 'done' }).catch(() => {})
  }
  return null
}

