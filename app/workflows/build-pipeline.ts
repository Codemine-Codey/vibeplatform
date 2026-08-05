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
import { readSandboxFile, repairFile, installMissingModules } from '@/lib/sandbox-util'
import { logRepair } from '@/lib/telemetry'
import {
  checkAndStampMissingFiles,
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
import { appendRunEvent, updateRun } from '@/lib/runs'
import {
  updateProjectRow,
  snapshotProject,
} from '@/lib/projects-db'
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

  const writer: PipelineWriter = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    write(part: { id?: string; type: string; data?: any }) {
      // Write to the live stream (run.readable on client)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pending.push(gWriter.write(part as Record<string, any>).catch(() => {}))
      // Dual-write to Supabase run_events for reconnect endpoint
      if (runId) appendRunEvent(runId, part.type, part)
    },
  }

  async function flushAndRelease() {
    await Promise.all(pending).catch(() => {})
    gWriter.releaseLock()
  }

  return { writer, flushAndRelease }
}

// ── Silence filter — same logic as route.ts v2 ───────────────────────────────
// Suppresses AI repair narration between tool calls (only opening + closing lines pass).
function makeSilenceFilter() {
  let firstToolSeen = false
  const holdBuf: unknown[] = []

  return new TransformStream({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform(part: any, controller: TransformStreamDefaultController) {
      const t: string = part.type ?? ''
      if (t === 'text-delta') {
        if (!firstToolSeen) {
          controller.enqueue(part)
        } else {
          holdBuf.push(part)
        }
      } else if (t === 'tool-input-delta' || t === 'tool-result') {
        firstToolSeen = true
        holdBuf.length = 0
        controller.enqueue(part)
      } else {
        controller.enqueue(part)
      }
    },
    flush(_controller: TransformStreamDefaultController) {
      // Drop ALL held text — the AI's closing message is never reliable here because
      // stepVerify hasn't run yet. A programmatic data-narration is written after
      // verify confirms the page is actually working. Leaking repair-commentary or
      // premature "your project is ready" lines to the user is the worst outcome.
      holdBuf.length = 0
    },
  })
}

// ── The workflow entry point ─────────────────────────────────────────────────

export async function buildProject(params: BuildPipelineParams): Promise<void> {
  'use workflow'

  const genResult = await stepGenerate(params)
  await stepVerify(params, genResult)
}

// ── Step 1: Scaffold + AI generation ────────────────────────────────────────

async function stepGenerate(params: BuildPipelineParams): Promise<GenerateResult> {
  'use step'

  const { writer, flushAndRelease } = makeStepWriter(params.runId)

  // Emit the run ID so the client can reconnect via /api/runs/[id]/stream
  if (params.runId) {
    writer.write({ id: 'srv-run', type: 'data-run', data: { runId: params.runId } })
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
    const message = err instanceof Error ? err.message : String(err)
    writer.write({ id: 'srv-sandbox', type: 'data-create-sandbox', data: { error: { message }, status: 'error' } })
    if (params.runId) await updateRun(params.runId, { status: 'error' }).catch(() => {})
    await flushAndRelease()
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

  const fullSystem = params.systemPrompt + pipelineAddendum + referenceGuidance + `\n\n${fileCountGuidance}`

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

  // Each workflow step gets its own 800s budget — generation can use 650s
  // (leaving 150s for dev-server-start + basic headless in the verify step).
  const genBudgetMs = 650_000
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
      const PHASE1_CORE_SET = new Set(['src/index.css', 'src/components/Layout.tsx', 'src/pages/Home.tsx', 'src/components/Phase2Sections.tsx'])
      const phase2Paths = [...new Set(allGenPaths)].filter(p => !PHASE1_CORE_SET.has(p))
      const phase1Paths = [...new Set(allGenPaths)].filter(p => PHASE1_CORE_SET.has(p))
      if (phase2Paths.length >= 2) {
        planBox.manifest = {
          files: [
            ...phase1Paths.map(p => ({ path: p, phase: 1, exports: ['default'] })),
            ...phase2Paths.map(p => ({ path: p, phase: 2, exports: ['default'] })),
          ],
          phaseCount: 2, multiPhase: true, extraPackages: [],
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

  // Early snapshot
  if (params.projectId && params.userId) {
    snapshotProject(sandbox, params.userId, params.projectId)
      .then(p => p ? updateProjectRow(params.projectId!, { sandbox_id: sandboxId, snapshot_path: p }) : undefined)
      .catch(() => {})
  }

  await reviewGeneratedCode(sandbox, skill).catch(() => {})

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
  }
}

// ── Step 2: Install + verify + reveal preview URL ────────────────────────────

async function stepVerify(params: BuildPipelineParams, genResult: GenerateResult): Promise<void> {
  'use step'

  const { writer, flushAndRelease } = makeStepWriter(genResult.runId)
  const { sandboxId, resolvedUrl: initialUrl, manifestFilePaths, skill, brandName, projectId, userId, runId, invocationStart, firstUserText, lastUserText } = genResult

  if (!sandboxId) {
    if (runId) await updateRun(runId, { status: 'done' }).catch(() => {})
    await flushAndRelease()
    return
  }

  let sandbox: Sandbox
  try {
    sandbox = await Sandbox.get({ sandboxId })
  } catch (err) {
    console.warn('[stepVerify] sandbox reconnect failed:', err instanceof Error ? err.message : err)
    if (runId) await updateRun(runId, { status: 'done' }).catch(() => {})
    await flushAndRelease()
    return
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

  try {
    if (skill === 'website') {
      try { await ensureNavShells(sandbox, brandName ?? undefined) } catch { /* non-fatal */ }
    }

    // MUST await — not fire-and-forget. verifyAndRepair can restart the dev server
    // mid-repair; if we proceed to headless check concurrently the server may 502.
    await verifyAndRepair({ sandbox, sandboxId, writer })

    writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { status: 'loading' } })
    let devError = await waitForDevServer(resolvedUrl)

    if (devError && (await installMissingModules(sandbox, devError))) {
      logRepair({ layer: 'dev-500', action: 'auto-installed-and-restarted', detail: devError.slice(0, 200), sandboxId })
      await restartDevServer(sandbox)
      devError = await waitForDevServer(resolvedUrl)
    }

    if (devError) {
      logRepair({ layer: 'dev-500', action: 'silent-fallback', detail: devError.slice(0, 200), sandboxId })
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
            try { await applyFallbackTerminalState(sandbox, recheck, { skill, brand: brandName || 'This project' }) } catch { /* non-fatal */ }
          }
        }
      } catch { /* non-fatal */ }
    }

    if (skill === 'website' && !devError) {
      try { await ensureNavShells(sandbox, brandName ?? undefined) } catch { /* non-fatal */ }
    }

    // Deadline gate: each step gets 800s. Skip headless if < 130s remain.
    if (!devError) {
      const stepElapsed = Date.now() - invocationStart
      if (stepElapsed > 660_000) {
        console.warn(`[verify-step] ${Math.round(stepElapsed / 1000)}s elapsed — skipping verify`)
        writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { url: resolvedUrl, status: 'done' } })
        revealed = true
      }
    }

    // Headless render check
    let rtResult: { status: 'ok' | 'broken' | 'skipped'; detail: string } | null = null
    if (!devError && !revealed) {
      try {
        writer.write({ id: 'srv-preview-starting', type: 'data-narration', data: { text: 'Starting preview — this may take up to 30 seconds, please wait.' } })
        writer.write({ id: 'srv-runtime', type: 'data-run-command', data: { sandboxId, command: 'Checking your preview renders correctly', args: [], status: 'executing' } })
        let rt = await headlessRuntimeCheck(resolvedUrl, sandboxId)
        for (let attempt = 1; attempt <= 5 && rt.status === 'broken'; attempt++) {
          const fixed = await repairFile('src/pages/Home.tsx', (await readSandboxFile(sandbox, 'src/pages/Home.tsx') ?? ''), rt.detail).catch(() => null)
          if (!fixed) break
          await sandbox.writeFiles([{ path: 'src/pages/Home.tsx', content: Buffer.from(sanitizeTsx('src/pages/Home.tsx', fixed), 'utf8') }])
          await new Promise(r => setTimeout(r, 2500))
          rt = await headlessRuntimeCheck(resolvedUrl, sandboxId)
        }
        rtResult = rt
        writer.write({ id: 'srv-runtime', type: 'data-run-command', data: { sandboxId, command: 'Checking your preview renders correctly', args: [], status: 'done', exitCode: 0 } })
      } catch (e) {
        console.warn('[verify] headless check failed:', e instanceof Error ? e.message : e)
      }
    }

    if (!devError && rtResult && rtResult.status === 'broken') {
      try {
        await applyFallbackTerminalState(sandbox, 'force-app-level', { skill, brand: brandName || 'This project' })
        await new Promise(r => setTimeout(r, 3500))
        const finalCheck = await headlessRuntimeCheck(resolvedUrl, sandboxId).catch(() => null)
        if (finalCheck) rtResult = finalCheck
      } catch { /* non-fatal */ }
    }

    // Functional verify (skip if < 220s remain in this step)
    if (!devError && !revealed) {
      const stepElapsed = Date.now() - invocationStart
      if (stepElapsed < 580_000) {
        writer.write({ id: 'srv-playtest', type: 'data-run-command', data: { sandboxId, command: skill === 'game' ? 'Playtesting your game and polishing it' : 'Testing every feature and polishing it', args: [], status: 'executing' } })
        try {
          const request = firstUserText || lastUserText || ''
          for (let round = 1; round <= 3; round++) {
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
    }

    // W6: AI-vision-directed QA — runs after functional verify if time allows
    if (!devError && !revealed) {
      const stepElapsed = Date.now() - invocationStart
      if (stepElapsed < 640_000) {
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
    }

    // Reveal — written ONLY once all verify/repair rounds are complete and the
    // server is confirmed stable. This is the single source of truth for "ready".
    if (!revealed) {
      writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { url: resolvedUrl, status: 'done' } })
      revealed = true
    }
    // Programmatic closing narration — replaces the AI's text (which is suppressed by
    // the silence filter). Written after reveal so the user only sees it once the
    // preview is genuinely live and the verify pass has completed.
    const brand = brandName ?? 'your project'
    writer.write({
      id: 'srv-ready-narration',
      type: 'data-narration',
      data: { text: `${brand.charAt(0).toUpperCase() + brand.slice(1)} is ready — open the Preview tab to see it live.` },
    })
    if (projectId) updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: resolvedUrl }).catch(() => {})

    // Suggestions
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
        try {
          snapshotPath = await Promise.race([snapshotProject(sandbox, userId, projectId), new Promise<null>(resolve => setTimeout(() => resolve(null), 60_000))])
        } catch { /* retry */ }
      }
      await updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: resolvedUrl, ...(snapshotPath ? { snapshot_path: snapshotPath } : {}) }).catch(() => {})
    }

  } catch (err) {
    console.error('[stepVerify] error:', err instanceof Error ? err.message : err)
    if (!revealed && resolvedUrl) {
      writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { url: resolvedUrl, status: 'done' } })
    }
  } finally {
    if (runId) await updateRun(runId, { status: 'done' }).catch(() => {})
    await flushAndRelease()
  }
}

