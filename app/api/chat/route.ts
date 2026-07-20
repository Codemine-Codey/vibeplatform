import { type ChatUIMessage } from '@/components/chat/types'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  streamText,
} from 'ai'
import type { UIMessage, UIMessageStreamWriter } from 'ai'
import type { DataPart } from '@/ai/messages/data-parts'
import { DEFAULT_MODEL, FILE_GENERATION_MODEL, EDIT_MODEL, VISION_MODEL, getMaxOutputTokens } from '@/ai/constants'
import { NextResponse } from 'next/server'
import { getModelOptions } from '@/ai/gateway'
import { tools } from '@/ai/tools'
import { generateSuggestions } from '@/ai/suggestions'
import { generateFiles } from '@/ai/tools/generate-files'
import { getUnsplashBatch } from '@/ai/tools/get-unsplash-batch'
import { generateImageBatch } from '@/ai/tools/generate-image-batch'
import { planProject, type NormalizedManifest } from '@/ai/tools/plan-project'
import { lookupReference, tavilySearch } from '@/ai/tools/lookup-reference'
import { classifyPrompt } from '@/ai/classifier'
import { expandPrompt } from '@/ai/expander'
import { formatBrief, type PageSpec } from '@/ai/types/project-brief'
import { lockPaletteInCss } from '@/lib/design-tokens'
import type { ColorTokens } from '@/ai/types/project-brief'
import { getSkillPack } from '@/ai/packs'
import { getSkillCatalog, loadSkillBody, designSkillFor } from '@/ai/skills'
import { loadSkill } from '@/ai/tools/load-skill'
import type { Skill } from '@/ai/types/project-brief'
import { Sandbox } from '@vercel/sandbox'
import { SCAFFOLD_FILES, SCAFFOLD_PATH_SET, getScaffoldFiles } from '@/ai/tools/scaffold'
import { saveCheckpoint } from '@/ai/tools/checkpoint'
import { getWarmEntry } from '@/ai/warm-pool'
import { restoreBakedDeps } from '@/lib/baked-deps'
import { logRepair, logDesign } from '@/lib/telemetry'
import { getCurrentUser } from '@/lib/supabase/server'
import { createRun, appendRunEvent, updateRun } from '@/lib/runs'
import { runResumableEnrichment } from '@/lib/enrichment'
import { stampShellsForManifest, stampShell, navTargetPageFiles } from '@/lib/shell-template'
import { reviewGeneratedCode } from '@/lib/code-review-gate'
import {
  readSandboxFile,
  extractBuildError,
  extractErrorFiles,
  installMissingModules,
  repairFile,
} from '@/lib/sandbox-util'
import { createProjectRow, getProject, snapshotProject, updateProjectRow, getProjectBySandboxId, incrementProjectTokens, restoreSnapshotInto } from '@/lib/projects-db'
import { tokenStore } from '@/lib/token-context'
import { ensureValidCss } from '@/lib/css-guard'
import { trimStaleReadResults } from '@/lib/trim-history'
import prompt from './prompt.md'

export const maxDuration = 800

type Writer = UIMessageStreamWriter<UIMessage<never, DataPart>>

// ── Durable-runs STEP 1: log-writer wrapper (pass-through + shadow log) ────────
// Wraps a Writer so EVERY writer.write(part) ALSO appends the part to the canonical
// run_events log. The live SSE stream is byte-for-byte unchanged — the original
// write happens first and identically; the log append is fire-and-forget and can
// never throw into or slow the pipeline (see lib/runs.appendRunEvent). merge() and
// onError delegate straight through untouched (merged AI-token parts bypass write(),
// so they are intentionally NOT logged in step 1 — the server pipeline parts are).
function wrapWriterWithLog(writer: Writer, runId: string): Writer {
  return {
    write(part) {
      writer.write(part)
      const type = (part as { type?: string }).type ?? 'unknown'
      appendRunEvent(runId, type, part)
    },
    merge(stream) {
      writer.merge(stream)
    },
    get onError() {
      return writer.onError
    },
    set onError(handler) {
      writer.onError = handler
    },
  }
}

interface BodyData {
  messages: ChatUIMessage[]
}

function getLastUserText(messages: ChatUIMessage[]): string {
  const last = [...messages].reverse().find(m => m.role === 'user')
  if (!last) return ''
  return last.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join(' ')
    .trim()
}

// The ORIGINAL request that started this project — the first user text turn. Used to
// keep the AI anchored to what it's building across many edit turns (anti-drift).
function getFirstUserText(messages: ChatUIMessage[]): string {
  const first = messages.find(m => m.role === 'user')
  if (!first) return ''
  return (first.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join(' ')
    .replace(/\n\nMy preferences for this build:[\s\S]*$/, '')
    .trim()
}

// Per-project anti-drift constraints injected into EVERY edit turn's system prompt
// (Lovable's #1 anti-drift lever). Pins the original intent so the AI never wanders into
// a different kind of app, and GATES structural additions (auth / database / routing /
// new frameworks) behind an explicit user request — for ALL project types (a game CAN get
// auth or a database, but only when the user actually asks for it).
function buildProjectConstraints(messages: ChatUIMessage[]): string {
  const original = getFirstUserText(messages)
  if (!original) return ''
  return (
    `\n\n## THIS PROJECT — re-read before every change (anti-drift)\n` +
    `The user's original request: "${original.slice(0, 400)}"\n` +
    `Stay true to this. Do NOT turn it into a different kind of app or add unrelated sections. ` +
    `Read the existing files before editing and match their structure, style, and design system.\n` +
    `Do NOT add authentication, a database/persistence, user accounts, extra pages/routing, or a new ` +
    `framework UNLESS the user explicitly asks for that in a message. If adding it would change what ` +
    `kind of app this is, wait for the user to ask by name — then build it fully.`
  )
}

// Read the LIVE codebase tree + installed packages from the sandbox and format them for
// the edit system prompt (Lovable/Google "active codebase tree every turn" pattern). This
// grounds the AI in the REAL current files — more reliable than the message-derived list,
// which goes stale after enrichment or a reopen. One cheap round-trip (~1-2s).
async function readActiveCodebase(sandboxId: string): Promise<string> {
  try {
    const sandbox = await Sandbox.get({ sandboxId })
    const treeCmd = await sandbox.runCommand({
      detached: true, cmd: 'bash',
      args: ['-c', "cd /vercel/sandbox && find src -type f \\( -name '*.tsx' -o -name '*.ts' -o -name '*.css' \\) 2>/dev/null | sort | head -100"],
    })
    const tree = (await (await treeCmd.wait()).stdout()).trim()
    if (!tree) return ''
    let deps = ''
    try {
      const pkgCmd = await sandbox.runCommand({ detached: true, cmd: 'cat', args: ['package.json'] })
      const pkg = JSON.parse(await (await pkgCmd.wait()).stdout())
      deps = Object.keys(pkg.dependencies ?? {}).join(', ')
    } catch { /* deps optional */ }
    return (
      `\n\n## CURRENT FILES ON DISK (the live project — edit THESE, never invent paths)\n` +
      tree +
      (deps ? `\n\nInstalled packages: ${deps}` : '')
    )
  } catch {
    return ''
  }
}

function hasActiveSandbox(messages: ChatUIMessage[]): boolean {
  return messages.some(
    msg =>
      Array.isArray(msg.parts) && msg.parts.some(p => p.type === 'data-create-sandbox')
  )
}

// Scans message history to extract sandboxId + projectId + every file generated so far.
// Injected into edit-turn system prompt so AI knows exactly what files exist.
function getProjectContext(messages: ChatUIMessage[]): { sandboxId: string | null; projectId: string | null; filePaths: string[]; hasPartialBuild: boolean } {
  let sandboxId: string | null = null
  let projectId: string | null = null
  const seen = new Set<string>()
  const filePaths: string[] = []
  let hasPartialBuild = false

  for (const msg of messages) {
    if (!Array.isArray(msg.parts)) continue
    for (const part of msg.parts) {
      if (
        part.type === 'data-create-sandbox' &&
        part.data?.sandboxId
      ) {
        sandboxId = part.data.sandboxId
        // projectId is included in the event since Phase 2 — use the most recent one.
        if (part.data?.projectId) projectId = part.data.projectId as string
      }
      if (
        part.type === 'data-generating-files' &&
        Array.isArray(part.data?.paths)
      ) {
        // Include ALL paths from generating-files — even if status wasn't 'done' (interrupted
        // stream). Files written before a connection drop ARE on disk even though status=uploading.
        for (const p of part.data.paths as string[]) {
          if (!seen.has(p)) {
            seen.add(p)
            filePaths.push(p)
          }
        }
        // Track if any generateFiles call didn't finish (status ≠ done → interrupted build)
        if (part.data?.status !== 'done') hasPartialBuild = true
      }
    }
  }

  return { sandboxId, projectId, filePaths, hasPartialBuild }
}

function transformMessages(messages: ChatUIMessage[]): ChatUIMessage[] {
  return messages.map(message => {
    message.parts = message.parts.map(part => {
      if (part.type === 'data-report-errors') {
        return {
          type: 'text' as const,
          text:
            `There are errors in the generated code. This is the summary of the errors we have:\n` +
            `\`\`\`${part.data.summary}\`\`\`\n` +
            (part.data.paths?.length
              ? `The following files may contain errors:\n` +
                `\`\`\`${part.data.paths?.join('\n')}\`\`\`\n`
              : '') +
            `Fix the errors reported.`,
        }
      }
      return part
    })
    return message
  })
}

// ── Build verification + auto-repair (the guarantee against blank previews) ───
// CSS is validated with the real PostCSS parser (lib/css-guard) — the same
// engine that would crash in the sandbox. Alias kept for the call sites below.
const sanitizeCss = ensureValidCss

// Post-repair TSX/JSX sanitizer — mirrors the generation-time sanitizeContent fixes
// so that repaired files are also clean. Applied before every sandbox.writeFiles call.
function sanitizeTsx(path: string, content: string): string {
  if (!/\.(tsx?|jsx?)$/.test(path)) return content
  // Fix backslash-escaped quotes (Vite parse error: "Expecting Unicode escape \uXXXX")
  if (content.includes('\\"')) content = content.replace(/\\"/g, '"')
  // Fix wrong import specifiers (same rewrite table as sanitizeContent in get-contents.ts)
  content = content
    .replace(/from\s+['"]motion\/react['"]/g, "from 'framer-motion'")
    .replace(/from\s+['"]motion['"]/g, "from 'framer-motion'")
    .replace(/from\s+['"]@phosphor-icons\/react['"]/g, "from 'lucide-react'")
    .replace(/from\s+['"]@radix-ui\/react-icons['"]/g, "from 'lucide-react'")
    .replace(/from\s+['"]@tabler\/icons-react['"]/g, "from 'lucide-react'")
    .replace(/from\s+['"]@heroicons\/react(\/[^'"]+)?['"]/g, "from 'lucide-react'")
    .replace(/process\.env\.NEXT_PUBLIC_(\w+)/g, 'import.meta.env.VITE_$1')
    .replace(/process\.env\.REACT_APP_(\w+)/g, 'import.meta.env.VITE_$1')
  return content
}

// Restart the dev server after a fix that the running process can't pick up via
// HMR (e.g. a newly installed package referenced by tailwind.config.js — jiti
// caches the failed require). Kill anything holding port 3000, then start fresh.
async function restartDevServer(sandbox: Sandbox): Promise<void> {
  try {
    const kill = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', 'fuser -k 3000/tcp 2>/dev/null; pkill -f vite 2>/dev/null; sleep 1; exit 0'],
    })
    await kill.wait()
  } catch { /* best-effort */ }
  try {
    await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'],
    })
  } catch { /* best-effort */ }
}

// THE GUARANTEE: run `vite build` (compile oracle), and if it fails, auto-repair
// the offending files with Flash — up to 3 rounds — BEFORE the dev server starts.
// Catches every blank-preview cause: @apply/CSS crashes, missing imports, syntax
// errors, truncated files. Worst case (3 rounds exhausted) = previous behaviour.
async function verifyAndRepair({
  sandbox,
  sandboxId,
  writer,
}: {
  sandbox: Sandbox
  sandboxId: string
  writer: Writer
}): Promise<void> {
  // One friendly, user-facing status. The repair rounds are internal — we never
  // surface "failed" to the user (that's alarming and meaningless to them).
  writer.write({
    id: 'srv-finalize',
    type: 'data-run-command',
    data: { sandboxId, command: 'Getting your project ready', args: [], status: 'executing' },
  })
  // P0-B: hard overall budget covering BOTH vite build rounds AND the typeCheckGate.
  // Reduced to 90s so gen(~4min) + verify(<90s) stays well under the 10-min user target.
  // Paired with repairFile's own 45s per-call ceiling.
  const repairDeadline = Date.now() + 90_000
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (Date.now() > repairDeadline) {
        console.warn('[verify] repair budget (90s) exhausted — proceeding with current build')
        break
      }
      // vite build only (no tsc — type errors don't blank the preview; CSS/import/
      // syntax errors do, and vite build catches all of those deterministically).
      let log = ''
      try {
        const cmd = await sandbox.runCommand({
          detached: true,
          cmd: 'bash',
          args: [
            '-c',
            '(./node_modules/.bin/vite build 2>&1; echo "##EXIT:$?") | tee /tmp/cm-verify.log >/dev/null',
          ],
        })
        await Promise.race([
          cmd.wait(),
          new Promise<void>((_, rej) => setTimeout(() => rej(new Error('build timeout')), 50_000)),
        ])
      } catch {
        /* timeout — read whatever was logged */
      }

      log = (await readSandboxFile(sandbox, '/tmp/cm-verify.log')) ?? ''
      const exitMatch = log.match(/##EXIT:(\d+)/)
      const ok = exitMatch ? exitMatch[1] === '0' : !/error/i.test(log)
      if (ok) {
        // vite build passes (no CSS/import/syntax crash). NOW run a filtered type-check
        // to catch the contract class vite-build can't see — wrong props, missing
        // exports, undefined names, wrong arity (the KanbanBoardWrapper bug) — and repair
        // them BEFORE the preview, not at runtime. Share the same deadline so it can never
        // blow the budget independently.
        await typeCheckGate({ sandbox, sandboxId, deadline: repairDeadline })
        return
      }

      const errorBlock = extractBuildError(log)

      // Missing package? Install it — deterministic, fixes the whole error class
      // (AI-referenced packages, config-required packages) without any LLM call.
      if (await installMissingModules(sandbox, log)) continue

      const files = extractErrorFiles(log)
      console.warn(`[verify] attempt ${attempt} failed. files=${files.join(',')} err=${errorBlock.slice(0, 160)}`)
      logRepair({ layer: 'build-verify', action: `attempt-${attempt}-failed`, detail: errorBlock.slice(0, 200), sandboxId })

      // Update the label so the user sees a natural, contextual progression
      if (attempt <= 2 && files.length > 0) {
        writer.write({
          id: 'srv-finalize',
          type: 'data-run-command',
          data: { sandboxId, command: attempt === 1 ? 'Smoothing out a couple of things' : 'One final pass', args: [], status: 'executing' },
        })
      }

      if (files.length === 0) {
        // Can't localize — last-ditch: re-sanitize the CSS, the most common
        // un-localized crash (PostCSS error without a clear file path).
        const css = await readSandboxFile(sandbox, 'src/index.css')
        if (css) {
          const fixed = sanitizeCss(css)
          if (fixed !== css) {
            await sandbox.writeFiles([{ path: 'src/index.css', content: Buffer.from(fixed, 'utf8') }])
            continue
          }
        }
        return
      }

      let repairedAny = false
      for (const path of files.slice(0, 3)) {
        if (Date.now() > repairDeadline) break // P0-B: never blow the budget mid-loop
        const content = await readSandboxFile(sandbox, path)
        if (!content) continue
        const fixed = await repairFile(path, content, errorBlock)
        if (fixed && fixed !== content) {
          const finalContent = path.endsWith('.css') ? sanitizeCss(fixed) : sanitizeTsx(path, fixed)
          await sandbox.writeFiles([{ path, content: Buffer.from(finalContent, 'utf8') }])
          repairedAny = true
        }
      }
      if (!repairedAny) return
    }
    // All repair rounds exhausted — vite build still failing. Emit a phase event so
    // the BuildingIndicator shows a meaningful label instead of "Building..." indefinitely.
    // The fallback page + dev-500 handler below will handle the actual preview state.
    writer.write({
      id: 'srv-phase-repair-failed',
      type: 'data-build-phase',
      data: { phase: 'repair-failed', label: 'Launching best-effort preview...' },
    })
  } finally {
    // Always close the status — repair is best-effort, never user-facing failure.
    writer.write({
      id: 'srv-finalize',
      type: 'data-run-command',
      data: { sandboxId, command: 'Getting your project ready', args: [], status: 'done', exitCode: 0 },
    })
  }
}

// Contract-level TS error codes — wrong/missing props, missing exports, undefined
// names, wrong arity, no-overload-match. These are REAL bugs (the KanbanBoardWrapper
// class). We deliberately EXCLUDE strict-null / implicit-any noise (2531/2532/18047/
// 18048/7006/7053) so the gate fixes contracts without looping on harmless nits.
const CONTRACT_TS_CODES = new Set([
  '2304', '2305', '2307', '2322', '2339', '2345', '2551', '2554', '2555',
  '2613', '2614', '2739', '2740', '2741', '2769',
])
function contractTypeErrors(log: string): { files: string[]; block: string; total: number } {
  const hits = log.split('\n').filter((l) => {
    const m = l.match(/error TS(\d+)/)
    return m && CONTRACT_TS_CODES.has(m[1])
  })
  const files = [
    ...new Set(
      hits
        .map((l) => {
          // Handles BOTH tsc output formats: "src/x.ts(12,5): error" (legacy) AND
          // "src/x.ts:12:5 - error" (TS5 pretty/non-pretty). The old regex only matched
          // the legacy paren form, so every modern tsc run reported zero files = silent pass.
          const m = l.match(/^\s*(\S+\.(?:tsx|ts|jsx|js))[(:]/)
          return m ? m[1].trim() : ''
        })
        .filter(Boolean)
        // Only repair AI-written files — never the baked, type-clean scaffold.
        .filter((p) => !SCAFFOLD_PATH_SET.has(p))
    ),
  ]
  return { files, block: hits.slice(0, 25).join('\n'), total: hits.length }
}

// Type-check gate — runs AFTER vite build passes. Catches the contract class vite's
// esbuild ignores (it strips types). Repairs the offending AI files for up to 2 rounds,
// then proceeds (the runtime monitor is the final backstop). This is the deterministic
// rail that turns "wrong props slip to runtime" into "wrong props fixed before preview".
// deadline: shared with verifyAndRepair so the total verify phase is time-bounded.
async function typeCheckGate({ sandbox, sandboxId, deadline }: { sandbox: Sandbox; sandboxId: string; deadline?: number }): Promise<void> {
  // Skip if the shared deadline has already been consumed by vite build rounds.
  if (deadline && Date.now() > deadline) {
    console.warn('[tsc-gate] skipped — deadline already passed')
    return
  }
  for (let round = 1; round <= 2; round++) {
    if (deadline && Date.now() > deadline) {
      console.warn(`[tsc-gate] deadline reached at round ${round} — stopping`)
      return
    }
    let log = ''
    try {
      const cmd = await sandbox.runCommand({
        detached: true,
        cmd: 'bash',
        // --pretty false → deterministic "file(line,col): error TSxxxx" output. The
        // ##DONE marker proves tsc actually ran (vs missing binary / silent failure).
        args: ['-c', '(./node_modules/.bin/tsc --noEmit --skipLibCheck --pretty false 2>&1; echo "##DONE:$?") | tee /tmp/cm-tsc.log >/dev/null'],
      })
      await Promise.race([
        cmd.wait(),
        new Promise<void>((_, rej) => setTimeout(() => rej(new Error('tsc timeout')), 35_000)),
      ])
    } catch {
      /* timeout — read whatever was logged */
    }
    log = (await readSandboxFile(sandbox, '/tmp/cm-tsc.log')) ?? ''
    const ran = log.includes('##DONE')
    const { files, block, total } = contractTypeErrors(log)
    logRepair({ layer: 'type-check', action: `round-${round}`, detail: `ran=${ran} totalErrs=${total} files=${files.length}`, sandboxId })
    if (!ran) return // tsc didn't run (missing binary / timed out) — don't loop blindly
    if (files.length === 0) return // GREEN — type-clean, safe to show the preview
    let repairedAny = false
    for (const path of files.slice(0, 6)) {
      const content = await readSandboxFile(sandbox, path)
      if (!content) continue
      // Give the repair the CONTRACTS this file depends on (the source of its local
      // imports) so it can fix a property/shape mismatch correctly — e.g. the file uses
      // `bill.tax` but types.ts defines `taxAmount`. Without this the fixer is guessing.
      const ctx = await readLocalImportSources(sandbox, path, content)
      const ctxText = ctx.length
        ? '\n\nThe files this imports — match their EXACT names, fields, and shapes:\n' +
          ctx.map((c) => `// ${c.path}\n${c.content.slice(0, 2500)}`).join('\n\n')
        : ''
      const fixed = await repairFile(
        path,
        content,
        'TypeScript errors — fix the names / props / types / object shapes so everything matches. Do NOT change unrelated code:\n' + block + ctxText
      )
      if (fixed && fixed !== content) {
        await sandbox.writeFiles([{ path, content: Buffer.from(fixed, 'utf8') }])
        repairedAny = true
      }
    }
    if (!repairedAny) return
  }
}

// Read the source of a file's LOCAL imports (so a type repair sees the real contracts it
// must conform to). Skips the type-clean baked scaffold. Bounded to keep it fast.
async function readLocalImportSources(
  sandbox: Sandbox,
  filePath: string,
  content: string
): Promise<{ path: string; content: string }[]> {
  const dir = filePath.split('/').slice(0, -1)
  const resolve = (spec: string): string => {
    if (spec.startsWith('@/')) return 'src/' + spec.slice(2)
    const parts = [...dir]
    for (const p of spec.split('/')) {
      if (p === '.' || p === '') continue
      else if (p === '..') parts.pop()
      else parts.push(p)
    }
    return parts.join('/')
  }
  const specs = [...content.matchAll(/from\s*['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .filter((s) => s.startsWith('.') || s.startsWith('@/'))
  const out: { path: string; content: string }[] = []
  for (const spec of [...new Set(specs)].slice(0, 6)) {
    const base = resolve(spec)
    for (const cand of [base, base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx']) {
      if (SCAFFOLD_PATH_SET.has(cand)) break
      const c = await readSandboxFile(sandbox, cand)
      if (c) {
        out.push({ path: cand, content: c })
        break
      }
    }
  }
  return out
}

// Vision verdict: the AI literally SEES the screenshot and judges whether the
// page is visually broken — catching failures the DOM can't reveal (white-on-white
// text, off-screen content, overlapping unreadable layouts, raw unstyled HTML).
// Stage 6: when the page is NOT broken, it ALSO scores design quality 1-10
// (distinctiveness, hierarchy, contrast, polish) and logs it as [cm-design] — one
// vision call, no extra latency, makes design quality trackable over time.
// Uses Claude Haiku (vision-capable). Conservative by design; graceful on failure.
async function visualVerdict(
  screenshot: Buffer,
  sandboxId?: string
): Promise<{ broken: boolean; reason: string; score: number | null }> {
  try {
    const res = await generateText({
      ...getModelOptions(VISION_MODEL),
      maxOutputTokens: 220,
      abortSignal: AbortSignal.timeout(30_000), // P0-B: never let the vision check hang the pipeline
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'You are a senior design reviewer for a freshly generated web preview (website, web app, or game). ' +
                'First decide if it is BROKEN or FINE.\n' +
                'BROKEN = a blank or solid-color page with no real content; raw unstyled HTML; an error/stack-trace screen; ' +
                'text invisible because it matches the background; or content so overlapping/cut-off it is unusable.\n' +
                'FINE = any legitimately rendered UI, including minimal/clean designs, hero sections, dashboards, forms, ' +
                'game start screens, or game canvases.\n\n' +
                'If BROKEN, answer EXACTLY: "BROKEN: <short reason>".\n' +
                'If FINE, rate the DESIGN 1-10 (10 = looks like a top studio shipped it; consider distinctiveness vs templated, ' +
                'visual hierarchy, spacing/alignment consistency, contrast/readability, and overall polish) and answer EXACTLY: ' +
                '"SCORE: <n> | <one concrete sentence on the weakest aspect>".',
            },
            { type: 'image', image: screenshot },
          ],
        },
      ],
    })
    const t = res.text.trim()
    if (/^BROKEN/i.test(t)) return { broken: true, reason: t.replace(/^BROKEN:?\s*/i, '').slice(0, 300), score: null }
    const m = t.match(/SCORE:\s*(\d+(?:\.\d+)?)\s*\|?\s*(.*)/i)
    if (m) {
      const score = Number(m[1])
      logDesign({ score, note: m[2] || '', sandboxId })
      return { broken: false, reason: m[2] || '', score }
    }
    return { broken: false, reason: '', score: null }
  } catch (e) {
    console.warn('[visual-verdict] skipped:', e instanceof Error ? e.message : e)
    return { broken: false, reason: '', score: null } // graceful — never block on a vision failure
  }
}

// ── Headless runtime check (the screenshot/DOM/vision layer) ──────────────────
// Loads the live preview in a REAL headless browser server-side and inspects what
// actually rendered — catching the silent failures `vite build` can't see:
// runtime exceptions, empty #root, hydration crashes, AND (via the vision model)
// pages that render but look visually broken. Fully graceful: if Chromium can't
// launch, it returns ok (never worse than before). Returns the error detail (with
// file paths from the stack where available) so the offending files can be repaired.
async function headlessRuntimeCheck(
  url: string,
  sandboxId?: string
): Promise<{ status: 'ok' | 'broken' | 'skipped'; detail: string; score?: number | null; screenshot?: Buffer }> {
  let browser: unknown = null
  try {
    const chromiumMod = await import('@sparticuz/chromium')
    const puppeteer = await import('puppeteer-core')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromium = (chromiumMod as any).default ?? chromiumMod
    const execPath = await chromium.executablePath()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browser = await (puppeteer as any).launch({
      args: chromium.args,
      executablePath: execPath,
      headless: true,
    })
    console.log('[runtime-check] chromium launched OK — inspecting live preview')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (browser as any).newPage()
    // Inject RAF frame counter BEFORE any game code loads
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page as any).evaluateOnNewDocument(() => {
      (window as typeof window & { __cmFrameCount: number }).__cmFrameCount = 0
      const _raf = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        (window as typeof window & { __cmFrameCount: number }).__cmFrameCount++
        return _raf(cb)
      }
      // Capture uncaught exceptions + unhandled promise rejections that fire BEFORE
      // puppeteer's own listeners attach (React render throws during mount — e.g.
      // useScroll without a target, a missing import used as a component). These are
      // the exact throws that produced the user-facing "Something went wrong" screen.
      const w = window as typeof window & { __cmErrors: string[] }
      w.__cmErrors = []
      window.addEventListener('error', (e) => {
        const m = (e && (e.error?.stack || e.error?.message || e.message)) || 'window error'
        w.__cmErrors.push(String(m))
      })
      window.addEventListener('unhandledrejection', (e) => {
        const r = (e && ((e as PromiseRejectionEvent).reason)) as { stack?: string; message?: string } | string
        const m = typeof r === 'string' ? r : (r?.stack || r?.message || 'unhandled rejection')
        w.__cmErrors.push(String(m))
      })
    }).catch(() => {})
    const errors: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on('console', (msg: any) => {
      if (msg.type() === 'error') errors.push(String(msg.text()))
    })
    // Uncaught exceptions surfaced by Chromium (page context throws) — the primary signal
    // for a component that throws during render. Without this, a render-time throw only
    // showed as a blank/near-empty root and lost the actual stack + culprit file.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on('pageerror', (err: any) => {
      errors.push(String(err?.stack || err?.message || err))
    })

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {})
    // Let React mount + effects settle. 2s is enough for update-depth loops to throw.
    await new Promise(r => setTimeout(r, 2000))
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
    await new Promise(r => setTimeout(r, 500))

    // Pull in-page captured throws (error/unhandledrejection listeners set above) + detect
    // the two "looks-like-content-but-is-actually-broken" states that slipped past the blank
    // check before: the Vite dev error overlay, and a React error-boundary fallback ("Something
    // went wrong"). Either means the app threw — must be repaired, never revealed.
    const domSignals = await page
      .evaluate(() => {
        const w = window as typeof window & { __cmErrors?: string[] }
        const captured = Array.isArray(w.__cmErrors) ? w.__cmErrors.slice(0, 8) : []
        // Vite injects <vite-error-overlay> (custom element) on a compile/runtime error.
        const overlay = document.querySelector('vite-error-overlay')
        let overlayText = ''
        if (overlay) {
          const sr = (overlay as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot
          overlayText = (sr?.textContent || overlay.textContent || 'Vite error overlay present').trim().slice(0, 400)
        }
        // React error-boundary fallbacks almost always render one of these phrases AND are
        // sparse (a fallback card, not a full page). Gate on short body text so a rich page
        // that merely CONTAINS the phrase in its copy is never falsely flagged.
        const bodyText = (document.body?.innerText || '').trim()
        const boundaryHit = bodyText.length < 400 &&
          /something went wrong|this section (couldn'?t|could not) load|an error occurred|failed to render|oops[,! ]/i.test(bodyText)
        return { captured, overlayText, boundaryHit, bodyTextSample: bodyText.slice(0, 200) }
      })
      .catch(() => ({ captured: [] as string[], overlayText: '', boundaryHit: false, bodyTextSample: '' }))

    // P1-B: require MEANINGFUL PAINT, not merely "a node exists". Read the root's
    // child count, innerHTML length (the paint floor), total descendant element count,
    // and whether a canvas is present (games legitimately paint a bare canvas with
    // little HTML). A page that mounts an empty/near-empty root is treated as broken and
    // routed back into the bounded repair → fallback path — never shown to the user.
    const paint = await page
      .evaluate(() => {
        const r = document.getElementById('root')
        if (!r) return { children: -1, htmlLen: 0, elCount: 0, textLen: 0, hasCanvas: false }
        return {
          children: r.childElementCount,
          htmlLen: r.innerHTML.trim().length,
          elCount: r.querySelectorAll('*').length,
          textLen: document.body?.innerText?.trim()?.length ?? 0,
          hasCanvas: !!document.querySelector('canvas'),
        }
      })
      .catch(() => ({ children: -1, htmlLen: 0, elCount: 0, textLen: 0, hasCanvas: false }))

    // Fold the in-page captured throws into the error list (dedup, keep order).
    for (const c of domSignals.captured) if (c && !errors.includes(c)) errors.push(c)

    // Vite dev overlay or a React error-boundary fallback = the app threw. These PAINT real
    // DOM, so the meaningful-paint check alone would pass them — but the user would see
    // "Something went wrong". Treat as broken and hand the captured stack to the repair loop.
    if (domSignals.overlayText) {
      return { status: 'broken', detail: 'Vite compile/runtime error overlay is showing:\n' + domSignals.overlayText + (errors.length ? '\n' + errors.slice(0, 6).join('\n') : '') }
    }
    if (domSignals.boundaryHit) {
      return {
        status: 'broken',
        detail:
          `A React error boundary rendered its fallback ("${domSignals.bodyTextSample}") — a child component threw during render. ` +
          `Identify the throwing component and fix the actual bug (do NOT just widen the boundary).\n` +
          (errors.length ? errors.slice(0, 8).join('\n') : 'No console stack captured; inspect the section components most recently added.'),
      }
    }

    // Meaningful paint = a real subtree mounted. A canvas (game) is always enough; every
    // other page must clear a small innerHTML floor + have ≥1 real element. This catches
    // the "single empty child" / whitespace-only render the old blank check let through.
    const meaningfulPaint = paint.children >= 1 && paint.elCount >= 1 && (paint.htmlLen >= 40 || paint.hasCanvas)
    if (!meaningfulPaint) {
      return {
        status: 'broken',
        detail:
          `Blank or near-empty render: #root has no meaningful content after load ` +
          `(children=${paint.children}, htmlLen=${paint.htmlLen}, elements=${paint.elCount}) — a component threw during render or returned nothing.\n` +
          errors.slice(0, 6).join('\n'),
      }
    }
    if (errors.length > 0) {
      return { status: 'broken', detail: 'Runtime errors detected on the live page:\n' + errors.slice(0, 8).join('\n') }
    }

    // Double-nav / hidden-content bug: a page that renders its OWN nav while Layout already
    // wraps every page with a nav gives TWO navs and buries the real content (footer-only
    // homepage). High-confidence structural break — precise repair instruction.
    const navCount = await page.evaluate(() => document.querySelectorAll('nav').length).catch(() => 1)
    if (navCount > 1) {
      return {
        status: 'broken',
        detail:
          `Double navigation bar (${navCount} <nav> elements): a page (e.g. src/pages/Home.tsx) renders its OWN <nav>/<header>/<footer>, but src/components/Layout.tsx ALREADY wraps every page with the nav + footer — so there are two navs and the page content is hidden. FIX: remove <nav>, <header>, and <footer> from Home.tsx (and any page file). Home must render ONLY its section components; Layout provides the nav + footer. Do this as a patchFile on Home.tsx.`,
      }
    }

    // ── Per-route verification: home renders, but do the OTHER pages? ──────────
    // Navigate every internal link the page exposes and confirm each route renders
    // without error. Catches a broken /shop or /about even when home is fine — the
    // "did the AI actually build all the pages correctly" check, not just the entry.
    try {
      const links: string[] = await page
        .evaluate(() => {
          const hrefs = new Set<string>()
          document.querySelectorAll('a[href^="/"]').forEach((a) => {
            const h = (a as HTMLAnchorElement).getAttribute('href') || ''
            if (h && h !== '/' && !h.startsWith('//') && !h.includes('#')) hrefs.add(h)
          })
          return [...hrefs].slice(0, 6)
        })
        .catch(() => [] as string[])
      for (const href of links) {
        const routeErrors: string[] = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onErr = (e: any) => routeErrors.push(String(e?.stack || e?.message || e))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onConsole = (msg: any) => { if (msg.type() === 'error') routeErrors.push(String(msg.text())) }
        page.on('pageerror', onErr)
        page.on('console', onConsole)
        const dest = new URL(href, url).toString()
        await page.goto(dest, { waitUntil: 'networkidle2', timeout: 8_000 }).catch(() => {})
        await new Promise(r => setTimeout(r, 600))
        // P1-B: same meaningful-paint floor per route (not just childElementCount>0), PLUS the
        // overlay / error-boundary / captured-throw signals used on the home page — a broken
        // sub-page must fail exactly as strongly as a broken home page. No errors allowed.
        const rp = await page
          .evaluate(() => {
            const r = document.getElementById('root')
            const w = window as typeof window & { __cmErrors?: string[] }
            const captured = Array.isArray(w.__cmErrors) ? w.__cmErrors.slice(0, 6) : []
            const overlay = document.querySelector('vite-error-overlay')
            const overlayText = overlay ? ((overlay as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot?.textContent || overlay.textContent || 'Vite error overlay present').trim().slice(0, 300) : ''
            const bodyText = (document.body?.innerText || '').trim()
            const boundaryHit = bodyText.length < 400 &&
              /something went wrong|this section (couldn'?t|could not) load|an error occurred|failed to render|oops[,! ]/i.test(bodyText)
            // The router's catch-all renders <NotFound> for any path without a page. It PAINTS
            // content, so the paint check passes it — but a NAV LINK that lands here is a 404.
            // The scaffold marks NotFound with data-cm-notfound so we can detect it precisely.
            const notFound = !!document.querySelector('[data-cm-notfound]')
            if (!r) return { children: -1, htmlLen: 0, elCount: 0, hasCanvas: false, captured, overlayText, boundaryHit, notFound }
            return { children: r.childElementCount, htmlLen: r.innerHTML.trim().length, elCount: r.querySelectorAll('*').length, hasCanvas: !!document.querySelector('canvas'), captured, overlayText, boundaryHit, notFound }
          })
          .catch(() => ({ children: -1, htmlLen: 0, elCount: 0, hasCanvas: false, captured: [] as string[], overlayText: '', boundaryHit: false, notFound: false }))
        page.off('pageerror', onErr)
        page.off('console', onConsole)
        for (const c of rp.captured) if (c && !routeErrors.includes(c)) routeErrors.push(c)
        const routePainted = rp.children >= 1 && rp.elCount >= 1 && (rp.htmlLen >= 40 || rp.hasCanvas)
        if (rp.notFound) {
          // A nav link points to a page that doesn't exist → 404. Name the nav-bearing files so
          // the repair loop rewrites them: either scroll to an on-page section (single-page site)
          // or build the missing page. Route-links to nothing are never acceptable.
          const slug = href.replace(/^\//, '')
          return {
            status: 'broken',
            detail:
              `The navigation link "${href}" points to a page that does not exist — it lands on the 404 screen. ` +
              `A user clicking it hits a dead end. FIX the navigation in src/components/Layout.tsx (and src/components/Navbar.tsx / src/components/Header.tsx if present): ` +
              `if this is a single-page site, change that link to an in-page anchor that scrolls to the matching section — use <a href="#${slug}"> and add id="${slug}" to that section on src/pages/Home.tsx. ` +
              `If it should be a real separate page, create src/pages/${slug.charAt(0).toUpperCase() + slug.slice(1)}.tsx with full content. Never leave a nav link that 404s.`,
          }
        }
        if (!routePainted || routeErrors.length > 0 || rp.overlayText || rp.boundaryHit) {
          const why = rp.overlayText
            ? `Vite error overlay on "${href}":\n${rp.overlayText}`
            : rp.boundaryHit
              ? `An error boundary rendered its fallback on "${href}" — a component on that route threw during render.`
              : `The page "${href}" is broken (blank or threw a runtime error) even though Home works.`
          return {
            status: 'broken',
            detail: `${why} Fix the component for that route.\n` + routeErrors.slice(0, 4).join('\n'),
          }
        }
      }
      // Return to home so the screenshot below captures the entry page.
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 8_000 }).catch(() => {})
      await new Promise(r => setTimeout(r, 500))
    } catch { /* per-route check is best-effort — never blocks the preview */ }

    // ── Game smoke test: a canvas game must ANIMATE + RESPOND to input ──────────
    // Only fires for a large (game-sized) canvas so a small decorative canvas on a website
    // is never flagged. Samples pixel regions across the canvas at multiple time points after
    // interaction — catches both "never starts" AND "starts but immediately freezes" bugs.
    try {
      const bigCanvas: boolean = await page
        .evaluate(() => {
          const c = document.querySelector('canvas') as HTMLCanvasElement | null
          if (!c) return false
          const r = c.getBoundingClientRect()
          // Any REAL game canvas (≥240px each side) — not just full-viewport ones. Fixed-size
          // canvases (300×600 flappy, 480×480 board) were being skipped and never smoke-tested.
          return r.width >= 240 && r.height >= 240
        })
        .catch(() => false)
      if (bigCanvas) {
        // Sample 3 non-overlapping 16×16 regions spread across the canvas.
        // getImageData is cross-origin safe (canvas is same-origin), avoids toDataURL taint issues.
        // Returns a compact hex string representing those pixels.
        const snap = (): Promise<string> =>
          page
            .evaluate(() => {
              const c = document.querySelector('canvas') as HTMLCanvasElement | null
              if (!c) return ''
              try {
                const ctx = c.getContext('2d')
                if (!ctx) return c.toDataURL().slice(500, 2000)
                const w = c.width, h = c.height
                const regions = [
                  ctx.getImageData(Math.floor(w * 0.25), Math.floor(h * 0.25), 16, 16).data,
                  ctx.getImageData(Math.floor(w * 0.5),  Math.floor(h * 0.5),  16, 16).data,
                  ctx.getImageData(Math.floor(w * 0.75), Math.floor(h * 0.75), 16, 16).data,
                ]
                return regions.map(d => Array.from(d).slice(0, 64).join(',')).join('|')
              } catch {
                return 'tainted'
              }
            })
            .catch(() => '')

        const snap0 = await snap()
        await page.evaluate(() => (document.querySelector('canvas') as HTMLElement | null)?.focus?.()).catch(() => {})
        // Click the canvas center first (dismiss start overlays), then keyboard
        await page.mouse.click(320, 300).catch(() => {})
        await new Promise((r) => setTimeout(r, 200))
        for (const key of ['Space', 'Enter', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
          await page.keyboard.press(key).catch(() => {})
          await new Promise((r) => setTimeout(r, 100))
        }
        // Wait for game to start and run a few frames
        await new Promise((r) => setTimeout(r, 1200))
        const snap1 = await snap()
        await new Promise((r) => setTimeout(r, 450))
        const snap2 = await snap()
        await new Promise((r) => setTimeout(r, 450))
        const snap3 = await snap()

        // RAF frame count — only meaningful when the baked engine is used (it sets
        // __cmFrameCount). For a CUSTOM game loop it's undefined → we must NOT flag the
        // game broken on that alone (that false-positive was repairing working games).
        const frameInfo = await page
          .evaluate(() => {
            const fc = (window as typeof window & { __cmFrameCount?: number }).__cmFrameCount
            return { defined: typeof fc === 'number', count: typeof fc === 'number' ? fc : 0 }
          })
          .catch(() => ({ defined: false, count: 0 }))
        const frameCount = frameInfo.count
        console.log(`[runtime-check] canvas game: frameCount=${frameCount} (engine=${frameInfo.defined})`)

        if (snap0 && snap1 && snap2 && snap3 && snap0 !== 'tainted') {
          const noResponseAtAll = snap0 === snap1 && snap1 === snap2 && snap2 === snap3
          const frozeAfterStart = snap0 !== snap1 && snap1 === snap2 && snap2 === snap3
          // Engine present but loop stalled = broken. Custom loop (frameInfo undefined) →
          // trust the pixels only, so a working custom-RAF game is never wrongly flagged.
          const engineLoopStalled = frameInfo.defined && frameCount < 10

          if (noResponseAtAll || engineLoopStalled) {
            return {
              status: 'broken',
              detail:
                `The game canvas is not animating or responding to any input (frameCount=${frameCount}). Pressing Space/Enter/arrows and clicking did not animate the canvas. The game loop is not running. Most likely: the \`running\` prop to useGameLoop is always false, or the gameState never transitions to "playing", or the keydown/click handlers are not attached. Fix the running condition and ensure click/Space/Enter update gameState.`,
            }
          }
          if (frozeAfterStart) {
            return {
              status: 'broken',
              detail:
                `The game started (canvas changed after input, frameCount=${frameCount}) but animation froze immediately — canvas was identical at t+1.2s, t+1.65s, and t+2.1s. The requestAnimationFrame loop stopped after one frame. Ensure the RAF callback always re-schedules itself with requestAnimationFrame(loop) while running is true.`,
            }
          }
        }
      }
    } catch { /* game smoke test is best-effort — never blocks the preview */ }

    // DOM looks populated and no console errors — now the AI LOOKS at it.
    // Catches visually-broken-but-not-erroring pages (white-on-white, off-screen).
    try {
      const shot: Buffer = await page.screenshot({ type: 'png', fullPage: false })
      const verdict = await visualVerdict(shot, sandboxId)
      if (verdict.broken) {
        return {
          status: 'broken',
          detail:
            'The page renders but looks visually broken (a vision check flagged it). Issue: ' +
            verdict.reason +
            '\nLikely causes: text color matching the background, a section with zero height, content positioned off-screen, or missing styles. Check src/index.css and src/App.tsx.',
        }
      }
      // Renders fine — return the score + the screenshot so the caller can run the
      // gated design-improvement pass without re-capturing.
      return { status: 'ok', detail: '', score: verdict.score, screenshot: shot }
    } catch (e) {
      console.warn('[runtime-check] screenshot/vision step skipped:', e instanceof Error ? e.message : e)
    }

    return { status: 'ok', detail: '' }
  } catch (e) {
    console.warn('[runtime-check] skipped (chromium unavailable):', e instanceof Error ? e.message : e)
    return { status: 'skipped', detail: '' } // graceful — never block the preview
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { if (browser) await (browser as any).close() } catch { /* ignore */ }
  }
}

// Add `import Fallback from './components/__fallback'` to an App file if it's absent.
function ensureFallbackImport(content: string): string {
  if (/from\s*['"](?:\.\/components\/__fallback|@\/components\/__fallback)['"]/.test(content)) return content
  return `import Fallback from './components/__fallback'\n` + content
}

// Q1 / P0-B TERMINAL STATE: the bounded repair budget is spent and a page STILL will
// not render. Swap the offending route to the scaffold-baked __fallback so the preview
// is NEVER blank. Two tiers (Q1): prefer a PAGE-level swap (replace only the broken
// <Route> element, so the rest of the app keeps working); fall back to an APP-level
// swap (rewrite App.tsx to render ONLY the fallback) when home/App itself is broken,
// the route can't be localized, or `force-app-level` is passed. The fallback imports
// nothing beyond React, so it always compiles and mounts. This is the terminal state —
// there is no path from here that leaves the user on a blank/errored preview.
async function applyFallbackTerminalState(
  sandbox: Sandbox,
  rtDetail: string,
  meta: { skill: Skill; brand: string }
): Promise<boolean> {
  const brand = (meta.brand || 'This project').replace(/[`\\<>{}]/g, '').trim().slice(0, 60) || 'This project'
  const fallbackEl = `<Fallback brand={${JSON.stringify(brand)}} skill={${JSON.stringify(meta.skill)}} />`

  // Locate the routing file (where <Routes> live) — usually src/App.tsx.
  let appPath: string | null = null
  let appContent: string | null = null
  for (const p of ['src/App.tsx', 'src/App.jsx']) {
    const c = await readSandboxFile(sandbox, p)
    if (c) { appPath = p; appContent = c; break }
  }

  // TIER 1 — page-level: a specific route was flagged broken and we can find its
  // <Route path="/x" element={<X .../>} /> → swap ONLY that element for the fallback.
  const routeMatch = rtDetail.match(/The page "([^"]+)" is broken/)
  if (routeMatch && appPath && appContent) {
    const esc = routeMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(<Route\\b[^>]*\\bpath\\s*=\\s*["']${esc}["'][^>]*\\belement\\s*=\\s*\\{)([\\s\\S]*?)(\\}\\s*/?>)`)
    if (re.test(appContent)) {
      const next = ensureFallbackImport(appContent.replace(re, `$1${fallbackEl}$3`))
      await sandbox.writeFiles([{ path: appPath, content: Buffer.from(next, 'utf8') }])
      console.warn(`[fallback] page-level swap: route ${routeMatch[1]} → __fallback in ${appPath}`)
      return true
    }
  }

  // TIER 2 — app-level: rewrite App.tsx to render ONLY the fallback (App/home broke, or
  // the route couldn't be localized). Nothing else is imported → cannot fail to render.
  const appLevel = `import Fallback from './components/__fallback'\n\nexport default function App() {\n  return ${fallbackEl}\n}\n`
  const target = appPath ?? 'src/App.tsx'
  await sandbox.writeFiles([{ path: target, content: Buffer.from(appLevel, 'utf8') }])
  console.warn(`[fallback] app-level swap: ${target} → __fallback only`)
  return true
}

// Run `vite build` once and report whether it compiled — used to guard the design
// pass: a design rewrite is only kept if it still builds, otherwise we restore.
async function viteBuildPasses(sandbox: Sandbox): Promise<boolean> {
  try {
    const cmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', '(./node_modules/.bin/vite build 2>&1; echo "##EXIT:$?") | tee /tmp/cm-dq.log >/dev/null'],
    })
    await Promise.race([
      cmd.wait(),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('build timeout')), 90_000)),
    ])
  } catch { /* timeout — treat as fail below */ }
  const log = (await readSandboxFile(sandbox, '/tmp/cm-dq.log')) ?? ''
  const m = log.match(/##EXIT:(\d+)/)
  return m ? m[1] === '0' : false
}

// ── Stage 6: gated design-improvement pass ───────────────────────────────────
// Fires ONLY when the rendered result scored below the threshold (rare after the
// structured brief + locked tokens), so the common path pays nothing. Sonnet SEES
// the screenshot + the low-score critique and rewrites the two highest-leverage
// design files (index.css + App.tsx) to lift the craft. Fully safe: originals are
// restored if the rewrite fails to build, so we never ship a broken "improvement".
async function improveDesignPass({
  sandbox,
  screenshot,
  critique,
  writer,
  sandboxId,
}: {
  sandbox: Sandbox
  screenshot: Buffer
  critique: string
  writer: Writer
  sandboxId: string
}): Promise<void> {
  const targets = ['src/index.css', 'src/App.tsx']
  const originals: Record<string, string> = {}
  for (const p of targets) {
    const c = await readSandboxFile(sandbox, p)
    if (c) originals[p] = c
  }
  if (Object.keys(originals).length === 0) return

  writer.write({
    id: 'srv-design',
    type: 'data-run-command',
    data: { sandboxId, command: 'Refining the design', args: [], status: 'executing' },
  })
  logRepair({ layer: 'runtime-check', action: 'design-improve-fired', detail: critique.slice(0, 160), sandboxId })

  try {
    const res = await generateText({
      ...getModelOptions(DEFAULT_MODEL), // Sonnet 4.6 — vision-capable + strong code
      maxOutputTokens: getMaxOutputTokens(DEFAULT_MODEL),
      abortSignal: AbortSignal.timeout(60_000), // P0-B: bounded — never hang the pipeline
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'This freshly generated page scored LOW on visual design. A reviewer noted: "' +
                critique +
                '".\nRewrite ONLY the two files below to make the design genuinely excellent — strong visual hierarchy, ' +
                'confident use of the existing brand color tokens, generous and consistent spacing, real typographic scale, ' +
                'and the page\'s intended personality. Keep ALL functionality, component imports, and routing identical. ' +
                'Do NOT use <svg> or raw hex in components — use the CSS variables/token classes already defined. ' +
                'Return EXACTLY each file in this format and nothing else:\n' +
                '<<<FILE src/index.css>>>\n<full file>\n<<<END>>>\n<<<FILE src/App.tsx>>>\n<full file>\n<<<END>>>\n\n' +
                Object.entries(originals)
                  .map(([p, c]) => `Current ${p}:\n${c}`)
                  .join('\n\n'),
            },
            { type: 'image', image: screenshot },
          ],
        },
      ],
    })

    const text = res.text
    let wroteAny = false
    for (const p of targets) {
      const re = new RegExp(`<<<FILE ${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>>>\\n([\\s\\S]*?)\\n<<<END>>>`)
      const m = text.match(re)
      if (m && m[1] && m[1].trim().length > 20) {
        const content = p.endsWith('.css') ? ensureValidCss(m[1]) : m[1]
        await sandbox.writeFiles([{ path: p, content: Buffer.from(content, 'utf8') }])
        wroteAny = true
      }
    }

    if (wroteAny) {
      // Safety: only keep the rewrite if it still compiles; otherwise restore.
      if (await viteBuildPasses(sandbox)) {
        logRepair({ layer: 'runtime-check', action: 'design-improve-applied', sandboxId })
      } else {
        await sandbox.writeFiles(
          Object.entries(originals).map(([path, content]) => ({ path, content: Buffer.from(content, 'utf8') }))
        )
        logRepair({ layer: 'runtime-check', action: 'design-improve-reverted-build-fail', sandboxId })
      }
    }
  } catch (e) {
    console.warn('[design-improve] skipped:', e instanceof Error ? e.message : e)
  } finally {
    writer.write({
      id: 'srv-design',
      type: 'data-run-command',
      data: { sandboxId, command: 'Refining the design', args: [], status: 'done', exitCode: 0 },
    })
  }
}

// A generation cut off mid-tool-call (e.g. by the function timeout) leaves an
// assistant tool-call part with NO result. convertToModelMessages then throws
// "Tool result is missing for tool call …", which breaks "Continue generation".
// Drop any incomplete tool part (state not output-available/-error) so the history
// is always valid and continue/resume works after any interruption.
function sanitizeMessages(messages: ChatUIMessage[]): ChatUIMessage[] {
  return messages.map((m) => {
    if (m.role !== 'assistant' || !Array.isArray(m.parts)) return m
    const parts = m.parts.filter((p) => {
      const t = typeof (p as { type?: string }).type === 'string' ? (p as { type: string }).type : ''
      if (t.startsWith('tool-') || t === 'dynamic-tool') {
        const state = (p as { state?: string }).state
        return state === 'output-available' || state === 'output-error'
      }
      return true
    })
    return { ...m, parts }
  })
}

// Per-user generation rate limit — each call spins a Firecracker VM + burns model
// tokens, so it's the most expensive endpoint. Best-effort sliding window (per
// instance): 12 generations / 5 min. Bounds runaway/abusive spend.
const genRate = new Map<string, number[]>()
function genRateOk(userId: string): boolean {
  const now = Date.now()
  const arr = (genRate.get(userId) || []).filter((t) => now - t < 300_000)
  if (arr.length >= 12) { genRate.set(userId, arr); return false }
  arr.push(now)
  genRate.set(userId, arr)
  return true
}

export async function POST(req: Request) {
  // Durable-runs STEP 3: anchor the invocation deadline to the moment the request was
  // received (classify/expand/plan all run before the pipeline and eat into the 800s
  // function cap). deadline = invocationStart + (maxDuration − 90s safety margin).
  const invocationStart = Date.now()
  const { messages: rawMessages } = (await req.json()) as BodyData
  const messages = sanitizeMessages(rawMessages)

  // AUTH GATE — generation creates a real sandbox VM and spends model tokens. Require a
  // signed-in user (no anonymous cost-abuse) + a per-user rate cap. BotID was removed
  // earlier (it silently blocked the POST); this is the real protection.
  const authedUser = await getCurrentUser(req)
  if (!authedUser) {
    return new Response(JSON.stringify({ error: 'Please sign in to build.' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  }
  if (!genRateOk(authedUser.id)) {
    return new Response(JSON.stringify({ error: 'Too many builds in a short time — please wait a moment.' }), { status: 429, headers: { 'Content-Type': 'application/json' } })
  }

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer: rawWriter }) => {
        // ── Durable-runs STEP 1 ─────────────────────────────────────────────
        // Create a run row for this invocation and wrap the writer so every server
        // stream part is ALSO appended to the canonical run_events log (dual-write).
        // Purely additive: if run creation fails we fall back to the raw writer and
        // the live stream is completely unaffected. The early `data-run` event tells
        // the client which run this stream belongs to (for later reconnect/replay).
        const runId = await createRun({ userId: authedUser.id })
        if (runId) {
          rawWriter.write({ id: 'srv-run', type: 'data-run', data: { runId } })
        }
        const writer = runId ? wrapWriterWithLog(rawWriter, runId) : rawWriter
        let terminalStatus = 'done'
        let chainedHandoff = false
        try {
          // ── EDIT MODE: sandbox already active → standard agentic loop ──────
          if (hasActiveSandbox(messages)) {
            // Anti-drift: pin the original intent + gate structural additions behind an
            // explicit request, so many edit turns never wander off-project (#69).
            return await runAgenticLoop({ writer, messages, systemPrompt: prompt + buildProjectConstraints(messages) })
          }

          // ── NEW PROJECT: classify + expand ────────────────────────────────
          const userText = getLastUserText(messages)
          if (!userText) {
            return await runAgenticLoop({ writer, messages, systemPrompt: prompt })
          }

        let skill: Skill | null = null
        let clarify = false

        try {
          const classResult = await classifyPrompt(userText)
          skill = classResult.skill
          clarify = classResult.clarify
        } catch {
          // Classification failed — fallback to agentic loop
        }

        if (clarify || !skill) {
          return await runAgenticLoop({ writer, messages, systemPrompt: prompt })
        }

        let brief = null
        try {
          brief = await expandPrompt(userText, skill)
        } catch {
          // Expansion failed — fallback
        }

        if (!brief) {
          return await runAgenticLoop({ writer, messages, systemPrompt: prompt })
        }

        // Now we're committed to building — provision the workspace VM in parallel with
        // the remaining setup (project row, planner prompt) and the planner's first
        // turn, so its ~35s cold-create overlaps work instead of blocking afterward.
        // Started only here (post-brief) so a clarify/bail never orphans a VM. runPipeline
        // awaits it; the no-op catch prevents an unhandled rejection while it provisions.
        const sandboxPromise: Promise<Sandbox> = Sandbox.create({ timeout: 1_200_000, ports: [3000] })
        sandboxPromise.catch(() => {})

        // PLANNER system prompt — LEAN (progressive disclosure): the planner plans
        // structure from the brief; it does NOT carry the full design skill (~22k).
        // It gets only the skill CATALOG (tiny) and can pull optional skills on
        // demand with loadSkill. The full design law is injected into the WRITER
        // (get-contents) via designContext below — that's where the painting happens.
        const designSkill = designSkillFor(skill)
        const designBody = loadSkillBody(designSkill) ?? ''
        const catalog = getSkillCatalog()
          .map(s => `- ${s.name}: ${s.description}`)
          .join('\n')
        const systemPrompt =
          `${prompt}\n\n## DESIGN LAW IS ACTIVE\n` +
          `The "${designSkill}" design skill is loaded for the file generator and is binding. ` +
          `Plan the project structure to honor the brief's design direction.\n` +
          `\n## OPTIONAL SKILLS (only if truly needed — do NOT load by default)\n` +
          `${catalog}\n` +
          `The core design law is ALREADY active — do NOT loadSkill for design/components. ` +
          `Call loadSkill AT MOST ONCE, and ONLY if the user explicitly asked for 3D/three.js or advanced custom animation. ` +
          `For a normal website, skip loadSkill entirely and go straight to planProject then generateFiles.\n` +
          `\n## PROJECT BRIEF (authoritative design spec — use this, do not ask clarifying questions)\n` +
          `Your first message MUST be one sentence confirming what you're building, derived from this brief. Then immediately call generateFiles.\n\n` +
          formatBrief(brief)

        // Create a durable project row for the signed-in user (RLS-scoped). The
        // snapshot at the end of the pipeline makes it reopenable from the dashboard.
        const user = await getCurrentUser()
        let projectId: string | null = null
        if (user) {
          const created = await createProjectRow({
            name: brief.brandName || 'Untitled project',
            prompt: userText,
            skill,
          })
          if (created) {
            projectId = created.id
            // Inject the Codemine Codey AI proxy creds into the workspace as `.env`
            // (separate from the DB tool's `.env.local`, so Vite loads BOTH — no clobber).
            // The generated app reads import.meta.env.VITE_CODEMINE_AI_URL/_TOKEN to call
            // AI with no provider key. Vite auto-restarts on `.env` change, so this is
            // picked up even after the dev server is already running.
            const aiBase = process.env.CM_PUBLIC_BASE_URL || 'https://codemineapp.com'
            const createdId = created.id
            sandboxPromise
              .then(async (sb) => {
                // Inject all platform env vars the generated app may need:
                // - AI proxy creds (VITE_CODEMINE_AI_URL / _TOKEN)
                // - DB write proxy (VITE_CODEMINE_API / VITE_PROJECT_ID)
                // - Auth creds injected separately by the auth/setup route when enabled
                const envContent = [
                  `VITE_CODEMINE_AI_URL=${aiBase}/api/ai/proxy`,
                  `VITE_CODEMINE_AI_TOKEN=${created.aiToken}`,
                  `VITE_CODEMINE_API=${aiBase}`,
                  `VITE_PROJECT_ID=${createdId}`,
                ].join('\n') + '\n'
                await sb.writeFiles([{ path: '.env', content: Buffer.from(envContent, 'utf8') }])
                // Persist sandbox_id EARLY (right after creation, minutes before the
                // end-of-pipeline snapshot) so the project is resumable even if a long or
                // interrupted generation never reaches the snapshot step. This alone makes
                // the same-sandbox resume path work.
                await updateProjectRow(createdId, { sandbox_id: sb.sandboxId })
              })
              .catch(() => {})
          }
        }

        // Forced light research (WEBSITES only) — one fast Tavily lookup so the copy and
        // sections are grounded in REAL specifics for that business/industry instead of
        // generic filler (agency-level content). Fail-safe: no key / error / 6s timeout →
        // empty → the build proceeds unchanged. ~1 credit, cached in-process.
        let researchContext = ''
        if (skill === 'website') {
          const q = `${brief.brandName || userText}: what sections, services/offerings, and specific content does this kind of business's website typically include? Give concrete real-world specifics.`
          const r = await tavilySearch(q).catch(() => '')
          if (r) researchContext = `\n\n## REAL-WORLD RESEARCH (ground the sections + copy in these facts — no generic filler)\n${r}`
        }

        // The design contract the FILE-WRITER must follow (brief tokens + fonts +
        // the active design skill). This is what makes generated code actually
        // match the design — without it the file-writer is blind to colors/fonts.
        const designContext = `${formatBrief(brief)}${researchContext}\n\n## DESIGN SKILL — ${designSkill}\n${designBody}`

        // ── SERVER-SIDE PIPELINE ────────────────────────────────────────────
        // Wrap in a token-accounting context so every model call this generation
        // makes is summed into tokens_used on the project row.
        const tokenBox = { total: 0 }
        const pipelineResult = await tokenStore.run(tokenBox, () =>
          runPipeline({ writer, messages, systemPrompt, skill, projectId, userId: user?.id ?? null, designContext, sandboxPromise, tokens: brief.colorTokens, brandName: brief.brandName, pageMap: brief.pageMap, runId, invocationStart })
        )
        // Durable-runs STEP 3: a chained handoff means enrichment ran out of invocation
        // budget and passed the run to a fresh continuation (status already 'continuing').
        // The finally below must NOT overwrite that back to 'done' — the LAST invocation
        // in the chain marks it done.
        if (pipelineResult?.chained) chainedHandoff = true
        if (projectId && tokenBox.total > 0) {
          updateProjectRow(projectId, { tokens_used: tokenBox.total }).catch(() => {})
        }
        // Durable-runs STEP 4: also record this invocation's tokens on the RUN row (the
        // reliability-metrics source). A single-invocation run gets its full, exact total
        // here; a chained run records the primary invocation's usage and each /continue
        // adds its own delta on top.
        if (runId && tokenBox.total > 0) {
          await updateRun(runId, { tokens_used: tokenBox.total }).catch(() => {})
        }
        } catch (err) {
          // The pipeline reports most failures as data-report-errors rather than
          // throwing; a genuine throw here means the run ended in error.
          terminalStatus = 'error'
          throw err
        } finally {
          // Mark the run terminal so the reconnect stream stops live-tailing. Runs
          // after all user-facing stream content is written, so it adds no latency to
          // the perceived generation; guarded so it can never affect the response.
          // Skip when the run was handed off to a continuation (still 'continuing').
          if (runId && !chainedHandoff) await updateRun(runId, { status: terminalStatus }).catch(() => {})
        }
      },
    }),
  })
}

// ── Standard agentic loop (edits, clarification fallback, unknown skill) ─────
async function runAgenticLoop({
  writer,
  messages,
  systemPrompt,
}: {
  writer: Writer
  messages: ChatUIMessage[]
  systemPrompt: string
}) {
  // Edits use Haiku — patchFile/readFile are surgical tasks; fast + cheap beats powerful.
  // Fallback (clarification / unknown skill) uses Pro — it may end up doing full generation.
  const isEdit = hasActiveSandbox(messages)

  // For edit turns: inject the sandboxId so the AI edits the EXISTING project
  // instead of rebuilding. The file list is included when known; when it isn't,
  // the AI is told to discover files with grepCode/readFiles — it must NEVER
  // create a new sandbox or regenerate the project just because the list is absent.
  // Ensure a LIVE sandbox for edits. If the stored one has TERMINATED (past its hard timeout),
  // transparently reopen it from the Supabase snapshot into a fresh sandbox and use that id for
  // the rest of the turn — so the AI edits instead of hitting a dead workspace and telling the
  // user to "rebuild" (which wipes their project).
  let editSandboxId: string | null = null
  const projectCtx = isEdit ? getProjectContext(messages) : null
  if (isEdit && projectCtx) {
    const { sandboxId, projectId: ctxProjectId } = projectCtx
    if (sandboxId) {
      editSandboxId = sandboxId
      let alive = false
      try { await Sandbox.get({ sandboxId }); alive = true } catch { alive = false }
      if (!alive) {
        const reopened = await reopenFromSnapshot(sandboxId, writer, ctxProjectId).catch(() => null)
        if (reopened) editSandboxId = reopened
      }
    }
  }

  let resolvedSystemPrompt = systemPrompt
  if (isEdit) {
    const { filePaths } = projectCtx ?? getProjectContext(messages)
    const sandboxId = editSandboxId
    if (sandboxId) {
      resolvedSystemPrompt +=
        `\n\n## YOUR CURRENT PROJECT\n` +
        `sandboxId: ${sandboxId} — this workspace ALREADY EXISTS. Edit it. NEVER call createSandbox or rebuild.\n\n` +
        (filePaths.length > 0
          ? `Files in this project (these all exist — use readFiles + patchFile to edit them):\n` +
            filePaths.map(p => `- ${p}`).join('\n')
          : `The project's files exist in this workspace but the list isn't provided here. ` +
            `Use grepCode to locate code and readFiles to read it before patching. Do NOT guess paths or rebuild.`) +
        `\n\nScaffold files that also exist (do NOT regenerate): package.json, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig.json, src/lib/utils.ts, src/components/ui/*`
      // Auto-inject the LIVE codebase tree (authoritative on-disk state) so the AI is grounded
      // in the real files even when the message-derived list above is stale (#85).
      const liveTree = await readActiveCodebase(sandboxId)
      if (liveTree) resolvedSystemPrompt += liveTree
    }
  }

  // RESUME an interrupted build — the "Continue generation" button sends this exact phrase. In a
  // normal edit generateFiles is banned, but a resume MUST be able to create the files the cut-off
  // generation never wrote. Explicitly allow it here for the MISSING files only, and tell the AI to
  // finish, not restart. (This is the stopgap; full event-log resume is the durable-runs workstream.)
  if (isEdit && /continue from where you left off/i.test(getLastUserText(messages))) {
    const { filePaths: partialPaths, hasPartialBuild } = projectCtx ?? getProjectContext(messages)
    resolvedSystemPrompt +=
      `\n\n## RESUMING AN INTERRUPTED BUILD — CRITICAL RULES\n` +
      `The previous generation was cut off. The workspace STILL EXISTS with its files on disk.\n` +
      (partialPaths.length > 0
        ? `Files already on disk (verified from message history):\n` +
          partialPaths.map(p => `- ${p}`).join('\n') + `\n\n` +
          `These files ARE on disk. NEVER say "no files exist" — that is WRONG.\n`
        : `No file list recorded (generation was cut off very early). Use readFiles on src/index.css ` +
          `and src/pages/Home.tsx to check what is already there.\n`) +
      `\nYour job: read the existing files (batch readFiles call), find the ones that are MISSING or ` +
      `incomplete, then generateFiles ONLY for the missing ones — maintaining identical imports, design ` +
      `tokens, and style to what is already there. Do NOT restart. Do NOT call createSandbox. ` +
      (hasPartialBuild ? `Partial build detected — some files may be truncated; read them before deciding what to generate.` : '')
  }

  // Token accounting: create the stream INSIDE the token context so the metrics
  // middleware's usage callbacks sum into THIS request's tokenBox. streamText created
  // OUTSIDE tokenStore.run runs its stream transforms in whatever async context is active
  // when data flows — under concurrency that could be a DIFFERENT request's context,
  // which misattributed tokens (the "0 tokens" rows). Creating it inside .run pins the
  // whole stream lifecycle to this request.
  const tokenBox = { total: 0 }
  await tokenStore.run(tokenBox, async () => {
    const result = streamText({
      ...getModelOptions(isEdit ? EDIT_MODEL : DEFAULT_MODEL),
      system: resolvedSystemPrompt,
      // Phase 4: drop stale file-read results from history so each edit turn doesn't
      // re-pay for files the model already used. Preserves the cached system prefix.
      messages: trimStaleReadResults(await convertToModelMessages(transformMessages(messages))),
      stopWhen: stepCountIs(30),
      // Model's max output — patchFile/generateFiles tool arguments stream through
      // this budget; a small cap truncated large patches mid-file (a blank-preview
      // cause). Capped to the active model's real ceiling so the provider never 400s.
      maxOutputTokens: getMaxOutputTokens(isEdit ? EDIT_MODEL : DEFAULT_MODEL),
      // Edits use the fast EDIT_MODEL for file writing too (not Pro) — a copy/component
      // tweak must finish in seconds, not minutes.
      tools: tools({ modelId: isEdit ? EDIT_MODEL : FILE_GENERATION_MODEL, writer, isEdit }),
      onError: error => {
        console.error('Error communicating with AI')
        console.error(JSON.stringify(error, null, 2))
      },
    })
    writer.merge(result.toUIMessageStream({ sendReasoning: false, sendStart: false }))
    try {
      await result.text
    } catch {
      /* stream error already logged in onError */
    }
  })

  // ── EDIT-STAGE GATE ───────────────────────────────────────────────────────
  // The initial generation runs the build+type gate, but EDITS didn't — so an edit that
  // introduced a contract/type error (wrong import name, wrong prop, a missing file, the
  // triggerConfetti-vs-Confetti class) reached the user and only the slow client self-heal
  // caught it. Run the type-check gate HERE, awaited, so the edit is fixed before the turn
  // ends — clean + fast, no post-preview loop. tsc is ~20s and catches the whole class.
  if (isEdit) {
    const sandboxId = editSandboxId
    if (sandboxId) {
      try {
        const sandbox = await Sandbox.get({ sandboxId })
        await typeCheckGate({ sandbox, sandboxId })
      } catch {
        /* non-fatal — the runtime monitor remains as the final backstop */
      }
    }
  }

  // After an edit turn: re-snapshot the project (so the saved copy reflects the
  // latest edits — resume is lossless) and add this turn's tokens. Background;
  // the user already has the streamed response.
  if (isEdit) {
    const sandboxId = editSandboxId
    if (sandboxId) {
      void (async () => {
        try {
          const project = await getProjectBySandboxId(sandboxId)
          if (!project) return
          if (tokenBox.total > 0) await incrementProjectTokens(project.id, tokenBox.total)
          const sandbox = await Sandbox.get({ sandboxId })
          // Refresh the in-sandbox checkpoint to THIS successful edit, so a later broken
          // edit can restore to the most recent good version (not the stale original build).
          await saveCheckpoint(sandbox).catch(() => {})
          const path = await snapshotProject(sandbox, project.user_id, project.id)
          if (path) await updateProjectRow(project.id, { snapshot_path: path })
        } catch {
          /* non-fatal */
        }
      })()
    }
  }
}


// Transparently reopen a project whose sandbox has TERMINATED (past its hard timeout) into a
// fresh sandbox restored from the Supabase snapshot — so an EDIT never dead-ends on "workspace
// expired / say rebuild" (which destroys the user's project). Restores files + baked deps, starts
// the dev server, and emits the new sandbox + URL to the client. Returns the new sandboxId (the
// AI + its edit tools use it this turn) or null if there's no snapshot to restore from.
async function reopenFromSnapshot(
  oldSandboxId: string,
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>,
  projectIdFallback?: string | null,
): Promise<string | null> {
  // Try by sandbox_id first. If the row was updated (e.g. after a manual resume via
  // SandboxState dialog), sandbox_id now points to the new sandbox — fall back to a
  // direct project-id lookup so the snapshot is still found.
  let project = await getProjectBySandboxId(oldSandboxId).catch(() => null)
  if (!project && projectIdFallback) {
    project = await getProject(projectIdFallback).catch(() => null)
  }
  if (!project || !project.snapshot_path) return null
  try {
    writer.write({ id: 'srv-sandbox', type: 'data-create-sandbox', data: { status: 'loading' } })
    const sandbox = await Sandbox.create({ timeout: 1_200_000, ports: [3000] })
    const ok = await restoreSnapshotInto(sandbox, project.snapshot_path)
    if (!ok) return null
    const baked = await restoreBakedDeps(sandbox).catch(() => false)
    try {
      const install = await sandbox.runCommand({
        detached: true, cmd: 'bash',
        args: ['-c', baked
          ? 'command -v bun >/dev/null 2>&1 && bun install --no-save || pnpm install --prefer-offline'
          : 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'],
      })
      await Promise.race([install.wait(), new Promise<void>((_, rej) => setTimeout(() => rej(new Error('t')), 120_000))])
    } catch { /* non-fatal */ }
    try {
      await sandbox.runCommand({ detached: true, cmd: 'bash', args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'] })
    } catch { /* non-fatal */ }
    const url = sandbox.domain(3000)
    await waitForDevServer(url)
    // Re-inject platform env vars (VITE_CODEMINE_API / VITE_PROJECT_ID) in case this
    // is an older project whose snapshot predates these vars, or in case the .env drifted.
    const reOpenBase = process.env.CM_PUBLIC_BASE_URL || 'https://codemineapp.com'
    sandbox.writeFiles([{
      path: '.env.platform',
      content: Buffer.from([
        `VITE_CODEMINE_API=${reOpenBase}`,
        `VITE_PROJECT_ID=${project.id}`,
      ].join('\n') + '\n', 'utf8'),
    }]).catch(() => {})
    writer.write({
      id: 'srv-sandbox',
      type: 'data-create-sandbox',
      data: {
        sandboxId: sandbox.sandboxId,
        projectId: project.id,
        status: 'done',
        // Restore cloud feature state so panels (auth, DB, deploy) are active immediately
        ...(project.auth_enabled ? { authEnabled: true } : {}),
        ...(project.auth_worker_url ? { authWorkerUrl: project.auth_worker_url } : {}),
        ...(project.database_id ? { databaseId: project.database_id } : {}),
      },
    })
    writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { url, status: 'done' } })
    await updateProjectRow(project.id, { sandbox_id: sandbox.sandboxId, preview_url: url }).catch(() => {})
    console.warn(`[reopen] restored terminated sandbox ${oldSandboxId} -> ${sandbox.sandboxId} from snapshot`)
    return sandbox.sandboxId
  } catch (e) {
    console.warn('[reopen] failed:', e instanceof Error ? e.message : e)
    return null
  }
}

// ── Server-side generation pipeline ──────────────────────────────────────────
// All tool decisions (createSandbox, pnpm install, pnpm dev, getSandboxURL) are
// made by the server. The AI's only job is to generate file contents. This
// eliminates 5-6 LLM orchestration steps (~40-60s each) from the critical path.
async function runPipeline({
  writer,
  messages,
  systemPrompt,
  skill,
  projectId,
  userId,
  designContext,
  sandboxPromise,
  tokens,
  brandName,
  pageMap: briefPageMap,
  runId,
  invocationStart,
}: {
  writer: Writer
  messages: ChatUIMessage[]
  systemPrompt: string
  skill: Skill
  projectId?: string | null
  userId?: string | null
  designContext?: string
  sandboxPromise?: Promise<Sandbox>
  tokens?: ColorTokens
  brandName?: string
  pageMap?: PageSpec[]
  runId?: string | null
  invocationStart?: number
}): Promise<{ chained: boolean }> {
  // ── Step 1: Acquire sandbox (warm pool or fresh creation) ─────────────────
  writer.write({
    id: 'srv-sandbox',
    type: 'data-create-sandbox',
    data: { status: 'loading' },
  })

  let sandbox: Sandbox
  let hadWarmSandbox = false
  // Captured background install promise — early-emit awaits it before starting dev server
  let bgInstallPromise: Promise<void> | null = null

  const warm = getWarmEntry()
  if (warm) {
    sandbox = warm.sandbox
    hadWarmSandbox = true
  } else {
    try {
      // 30-min ceiling. Abandoned sessions are killed early by the client
      // "kill-on-leave" beacon (POST /api/sandbox/stop on tab close), so the long
      // ceiling only benefits users actively working — it doesn't inflate idle cost.
      // Prefer the VM already provisioning in parallel with classify/brief/plan; fall
      // back to a fresh create if none was pre-started.
      sandbox = sandboxPromise ? await sandboxPromise : await Sandbox.create({ timeout: 1_200_000, ports: [3000] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      writer.write({
        id: 'srv-sandbox',
        type: 'data-create-sandbox',
        data: { error: { message }, status: 'error' },
      })
      return { chained: false }
    }
  }

  const sandboxId = sandbox.sandboxId

  // ── Incremental snapshot loop ─────────────────────────────────────────────
  // Save the project to storage every ~45s through the WHOLE pipeline, so an
  // interruption at ANY point (mid-write, verify, dev-start, the 800s cap, a dropped
  // connection) loses at most ~45s of work — never the project. Each run replaces the
  // prior snapshot. Self-limits (≤25 fires) so it can't run unbounded; cleared at the end.
  let snapTimer: ReturnType<typeof setInterval> | null = null
  if (projectId && userId) {
    const pid = projectId, uid = userId
    let fires = 0
    let snapping = false
    snapTimer = setInterval(() => {
      if (fires >= 25) { if (snapTimer) { clearInterval(snapTimer); snapTimer = null } return }
      if (snapping) return
      fires++
      snapping = true
      snapshotProject(sandbox, uid, pid)
        .then((p) => (p ? updateProjectRow(pid, { sandbox_id: sandboxId, snapshot_path: p }) : undefined))
        .catch(() => {})
        .finally(() => { snapping = false })
    }, 45_000)
  }

  // Write the unified scaffold (warm and cold). Warm sandboxes already have these files
  // but re-writing is harmless and cheap — it guarantees main.tsx and App.tsx are present
  // even if the warm entry was created from SCAFFOLD_FILES (the old base set).
  try {
    const scaffoldBuffers = getScaffoldFiles().map(f => ({ path: f.path, content: Buffer.from(f.content, 'utf8') }))
    // Write with ONE retry — a partial/transient write of the scaffold is the root of the
    // "main.tsx 404 / NotFound doesn't exist" class, so we make its presence non-negotiable.
    try {
      await sandbox.writeFiles(scaffoldBuffers)
    } catch (firstErr) {
      console.warn('[scaffold] first write failed, retrying once:', firstErr instanceof Error ? firstErr.message : firstErr)
      await sandbox.writeFiles(scaffoldBuffers)
    }
    // Deps: cold sandboxes install now (warm ones already installed during pre-warm).
    if (!hadWarmSandbox) {
      // Restore the BAKED node_modules (fast extract) then a reconcile install for any
      // package the AI adds — far quicker than a cold install. Runs in the background.
      // Captured in bgInstallPromise so early-emit can await it before starting dev server.
      bgInstallPromise = (async () => {
        const baked = await restoreBakedDeps(sandbox).catch(() => false)
        const installCmd = baked
          ? 'command -v bun >/dev/null 2>&1 && bun install --no-save || pnpm install --prefer-offline'
          : 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'
        await sandbox
          .runCommand({ detached: true, cmd: 'bash', args: ['-c', installCmd] })
          .then(cmd => cmd.wait())
          .catch(() => {})
      })().catch(() => {})
    }
  } catch {
    // Non-fatal — AI generates without scaffold if write fails
  }

  writer.write({
    id: 'srv-sandbox',
    type: 'data-create-sandbox',
    data: { sandboxId, projectId: projectId ?? undefined, status: 'done' },
  })

  // Early URL emit state (declared here so Phase A below can set it). Set once the dev
  // server is up and the preview URL has been emitted — gates the later boot/emit paths.
  let earlyEmitDone = false
  let earlyEmitUrl = ''

  // ── Phase A (flag-gated: SERVER_FIRST) — BOOT DEV SERVER FIRST ────────────────
  // The confirmed sub-90s architecture (Google + Lovable): boot Vite on the EMPTY
  // scaffold the moment deps are installed — in PARALLEL with generation — and emit the
  // preview URL immediately. Our files write atomically (whole file per writeFiles) and
  // deferred imports are pre-stamped as shells, with the HMR error overlay already off,
  // so the preview safely builds up live via HMR as each file lands instead of showing a
  // 5-min spinner. Flag OFF (default) = zero change to today's pipeline.
  if (process.env.SERVER_FIRST === 'true') {
    void (async () => {
      try {
        if (bgInstallPromise) await bgInstallPromise
        const domain = sandbox.domain(3000)
        writer.write({ id: 'srv-phase-build', type: 'data-build-phase', data: { phase: 'building', label: 'Starting your preview...' } })
        writer.write({ id: 'srv-dev', type: 'data-run-command', data: { sandboxId, command: 'bun', args: ['run', 'dev'], status: 'executing' } })
        const devCmd = await sandbox.runCommand({ detached: true, cmd: 'bash', args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'] })
        writer.write({ id: 'srv-dev', type: 'data-run-command', data: { sandboxId, commandId: devCmd.cmdId, command: 'bun', args: ['run', 'dev'], status: 'running' } })
        writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { status: 'loading' } })
        await waitForDevServer(domain)
        // Dev server up early. Do NOT reveal yet — the reveal is gated on the render-check
        // (verify-before-reveal) so the user never sees a blank/broken preview.
        earlyEmitUrl = domain
        earlyEmitDone = true
        if (projectId) updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: domain }).catch(() => {})
        console.log('[server-first] dev server up (reveal deferred to render-check):', domain)
      } catch (e) {
        console.warn('[server-first] failed (non-fatal, falls back to normal emit):', e instanceof Error ? e.message : e)
      }
    })()
  }

  // ── Step 2: Build pipeline addendum ─────────────────────────────────────
  const scaffoldFiles = getScaffoldFiles()
  const scaffoldPaths = scaffoldFiles.map(f => f.path).join(', ')
  // Unique seed per generation — ensures the model makes distinct creative choices
  // even when two users submit the same prompt. Injected into context so it
  // influences color palette, layout structure, and typographic decisions.
  const creativeSeed = Math.random().toString(36).slice(2, 10).toUpperCase()
  // W2 — the Design Director's pageMap drives single- vs multi-page. Multi-page is the new
  // default for substantial sites; the per-route render-check (W1) verifies every page paints
  // and no nav link 404s, so multi-page is safe to build in one pass (no server enrichment).
  const pageMap = (skill === 'website' && briefPageMap && briefPageMap.length > 0) ? briefPageMap : null
  const isMultiPage = !!pageMap && pageMap.length > 1
  const pageFileList = pageMap
    ? pageMap.map((p: PageSpec) => `src/pages/${p.page.replace(/[^A-Za-z0-9]/g, '')}.tsx (${p.route})`).join(', ')
    : 'src/pages/Home.tsx'
  const pipelineAddendum =
    `\n\n## SERVER PIPELINE — WORKSPACE READY\n` +
    `sandboxId: ${sandboxId}\n` +
    `Creative session ID: ${creativeSeed} — use this to make UNIQUE design choices. Two projects with similar briefs must look completely different in layout, palette, and typography.\n` +
    `Scaffold pre-written (including shadcn/ui components). Dependencies installing in background.\n` +
    `DO NOT call createSandbox — it is already done.\n` +
    `DO NOT call runCommand or getSandboxURL — the server handles those after you finish.\n` +
    `Scaffold files already written (exclude from generateFiles paths): ${scaffoldPaths}\n\n` +
    `WORKFLOW: ${skill === 'website'
      ? (isMultiPage
        ? `MULTI-PAGE website, ${pageMap!.length} pages (quality over speed — build every page fully). (1) getUnsplashBatch/generateImageBatch for ALL images across all pages + planProject with the COMPLETE file list: index.css, Layout.tsx, ONE page file per route (${pageFileList}), and one component per section under src/components/sections/. (2) generateFiles ALL of them, complete and detailed. ` +
          `STRUCTURE RULE (critical): Layout.tsx = nav + {children} + footer ONLY — nav links to OTHER pages use <Link to="/route">, links to a section on the CURRENT page use href="#id". Each src/pages/*.tsx renders ONLY its own section components (NO nav/header/footer inside pages — App.tsx wraps every page in Layout; duplicating chrome causes double navs + hidden content). Each section wrapped in <section id="...">. Build EVERY page richly — no empty or stub pages; each nav target must be a real page you created.`
        : `SINGLE-PASS, COMPLETE landing page (quality over speed). (1) getUnsplashBatch/generateImageBatch for ALL section images + planProject with the COMPLETE file list (index.css, Layout.tsx, Home.tsx, and one component per section under src/components/sections/) — ONE scrolling page. (2) generateFiles ALL those files in ONE call, complete and detailed. ` +
          `STRUCTURE RULE (critical): Layout.tsx = nav + {children} + footer ONLY. Home.tsx = the section components ONLY (NO nav/header/footer inside Home — App.tsx already wraps it in Layout; duplicating chrome causes double navs + hidden content). Each section wrapped in <section id="...">; nav uses href="#id" anchor-scroll (never routes to pages you didn't build).`)
      : skill === 'webapp'
      ? `(1) call planProject with the COMPLETE file list (every path you will generate — Phase 1 + all remaining), (2) FIRST generateFiles call: ONLY src/index.css + src/pages/Home.tsx, (3) SECOND generateFiles call: all remaining component files`
      : `(1) call planProject with the complete file list (every path you will generate), (2) call generateFiles with sandboxId="${sandboxId}" and exactly the paths from planProject`}\n` +
    (skill !== 'website' ? `getUnsplashBatch is NOT available for this skill type — do not call it.\n` : '') +
    `If you need packages not in the scaffold, include package.json in your generateFiles paths.\n`

  const fileCountGuidance = skill === 'website'
    ? (isMultiPage
      ? `WEBSITE — MULTI-PAGE (${pageMap!.length} pages, see §12). Generate ALL files, every page fully realized:\n` +
        `  • src/index.css — brand tokens + bold Google font @import (never Inter as display).\n` +
        `  • src/components/Layout.tsx — nav (brand + links + mobile hamburger) + {children} + footer. NOTHING else. Nav links to OTHER pages use <Link to="/route">; links to a section on the current page use href="#id".\n` +
        `  • One src/pages/*.tsx per page: ${pageFileList}. Each renders ONLY its own section components (NO nav/header/footer). The Home page is a rich 5-7 section landing; every other page is fully built too (real copy + real images), NEVER a stub.\n` +
        `  • src/components/sections/*.tsx — ONE component per section, each a FULL rich section (real copy + real Unsplash images), each wrapped in <section id="...">. Vary the composition section to section — no two look alike.\n` +
        `MOBILE-ADAPTIVE (required): mobile-first Tailwind, working hamburger, fluid type/spacing, no fixed widths or horizontal overflow — great at 375px AND desktop.\n` +
        `EVERY nav target must be a real page you created (no 404s) or a real on-page anchor.`
      : `WEBSITE — SINGLE-PASS COMPLETE LANDING PAGE (see §12). Generate ALL files in ONE generateFiles call:\n` +
        `  • src/index.css — brand tokens + bold Google font @import (never Inter).\n` +
        `  • src/components/Layout.tsx — nav (brand + anchor-scroll links + mobile hamburger) + {children} + footer. NOTHING else.\n` +
        `  • src/components/sections/*.tsx — ONE component per section, each a FULL rich section (real copy + real Unsplash images), each wrapped in <section id="...">. AT LEAST 6-7 sections (hero, about/story, services/features, stats or gallery, testimonials, pricing or process, CTA) unless the user asked for something smaller.\n` +
        `  • src/pages/Home.tsx — imports + renders ALL the section components in order, NOTHING else. NO nav, NO header, NO footer inside Home (Layout provides them — duplicating = double nav + hidden content, the #1 website bug).\n` +
        `MOBILE-ADAPTIVE (required): mobile-first Tailwind, working hamburger, fluid type/spacing, no fixed widths or horizontal overflow — great at 375px AND desktop.\n` +
        `SINGLE-PAGE: NO separate sub-page route files — anchor-scroll nav can never 404.`)
    : skill === 'webapp'
    ? `WEBAPP BUILD SPLIT (mandatory — same pattern as WEBSITE):
Phase 1 = EXACTLY 2 files in the FIRST generateFiles call:
  1. src/index.css — CSS vars + @import font ONLY (~40 lines)
  2. src/pages/Home.tsx — the ENTIRE working app in ONE self-contained file. Rules:
     • Import ONLY from: react, react-router-dom, lucide-react, @/components/ui/*, sonner, framer-motion, @dnd-kit/*
     • ZERO imports from other src/pages/ or src/components/ files you will write in Phase 2
     • ALL state management inline (useState, useReducer — no external stores yet)
     • Hardcoded sample data is fine for Phase 1 — the INTERACTIONS must work:
       kanban → cards must be moveable between columns; todo → tasks must add/complete/delete; dashboard → charts must render with data
     • Keep under 400 lines — dense but functional, not exhaustive
Phase 1 must stream in under 90 seconds — 2 small files only.
Phase 2 = all remaining files (components, hooks, utilities, extra pages) in the SECOND generateFiles call.
NEVER put all files into one generateFiles call for webapps — server enforces the split.`
    : skill === 'game'
    ? `TARGET FILE COUNT: 2 files ONLY — src/index.css + src/pages/Home.tsx. ALL game logic goes in Home.tsx. NO src/components/game/ subfolder. The server enforces this and will reject any other layout. A complete game fits in one file.`
    : `TARGET FILE COUNT: 6-8 files maximum. Combine views and utilities where possible.`

  // Per-type reference-lookup guidance — when (and only when) to call lookupReference.
  const referenceGuidance =
    '\n\n## REFERENCE LOOKUP (optional, do it BEFORE planProject if needed — max 2-3 calls)\n' +
    'If this build needs REAL values/facts you should not guess, call lookupReference first:\n' +
    (skill === 'game'
      ? '- This is a GAME: look up realistic physics/mechanics parameters (e.g. "flappy bird gravity, pipe gap, and scroll speed typical values") so the game PLAYS correctly — not a turtle-slow guess. Pin the returned numbers into your constants.'
      : skill === 'webapp'
        ? '- This is an APP: if it computes anything real (tax, finance, mortgage, unit conversions, a known algorithm), look up the correct FORMULA/values so the logic is right.'
        : '- This is a WEBSITE: if it is for a specific real business/domain, look up factual CONTENT (the real services/sections that business has) so the copy is accurate. NEVER use it for visual design or inspiration.') +
    '\nSkip it entirely for simple builds with nothing to look up. If it returns empty, just proceed on your own knowledge — never block on it.'

  const fullSystem = systemPrompt + pipelineAddendum + referenceGuidance + `\n\n${fileCountGuidance}`

  // ── Step 3: AI generates directly — no planning round-trip ───────────────
  // Emit phase event so the client BuildingIndicator can show the current stage.
  writer.write({ id: 'srv-phase-gen', type: 'data-build-phase', data: { phase: 'generating', label: 'Generating your files...' } })
  // Durable-runs STEP 2: capture the (phased, normalized) manifest the planner
  // commits to, so the server can drive the enrichment phases after phase-1 preview.
  const planBox: { manifest: NormalizedManifest | null } = { manifest: null }
  const capturePlan = planProject({ onPlan: (m) => { planBox.manifest = m } })

  // ── HARD Phase 1 contract (website + webapp) ─────────────────────────────────
  // Regardless of what paths the AI sends to generateFiles on its first call, the
  // server enforces that ONLY Phase 1 core files are written. Extra files are
  // silently deferred to the enrichment engine. HARD server-side contract —
  // prompt rules are soft and the AI regularly violates them.
  // Website: 4 files (css + Layout + Home + Phase2Sections placeholder)
  // Webapp:  2 files (css + self-contained Home with all logic inline)
  const PHASE1_CORE = new Set([
    'src/index.css', 'src/components/Layout.tsx', 'src/pages/Home.tsx',
    'src/components/Phase2Sections.tsx',
  ])
  const WEBAPP_PHASE1_CORE = new Set([
    'src/index.css', 'src/pages/Home.tsx',
  ])
  const activePhase1Core = skill === 'webapp' ? WEBAPP_PHASE1_CORE : PHASE1_CORE
  // Scaffold-owned: written at sandbox creation, AI must never regenerate them.
  // Actively drop them if the AI includes them — saves write time, avoids clobbering.
  const SCAFFOLD_OWNED = new Set([
    'package.json', 'src/main.tsx', 'src/App.tsx',
    'vite.config.ts', 'vite.config.js', 'tsconfig.json', 'tsconfig.app.json',
    'tsconfig.node.json', 'index.html', 'tailwind.config.ts', 'tailwind.config.js',
    'postcss.config.js', 'postcss.config.mjs', 'src/lib/utils.ts',
    'src/styles/cm-ui.css', 'src/components/NotFound.tsx',
    'src/components/__fallback.tsx', 'src/components/blocks/index.tsx',
    'src/components/blocks/sections.tsx', 'public/_redirects', '.npmrc',
  ])
  let p1GFCalled = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawGF = generateFiles({ writer, modelId: FILE_GENERATION_MODEL, designContext }) as any
  // Phase 1 fast-path: skip retry/syntax-gate/closure/footgun/empty-render AI calls.
  // Phase 1 has ≤4 tiny files; these gates are the 166s gap between file upload and rawGF "done".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phase1GF = generateFiles({ writer, modelId: FILE_GENERATION_MODEL, designContext, skipQualityGates: true }) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Websites now build the COMPLETE landing page in ONE pass (rawGF) — the old 2-phase +
  // enrichment split left footer-only homepages when the enrichment pass didn't fill the
  // sections. Only webapp keeps the guarded 2-phase (its phase-1 is a self-contained app).
  const guardedGF: any = (skill !== 'webapp') ? rawGF : {
    ...rawGF,
    execute: async (args: { sandboxId: string; paths: string[] }, ctx: unknown) => {
      if (!p1GFCalled) {
        p1GFCalled = true
        // Strip scaffold-owned files silently — they already exist, rewriting wastes time
        const nonScaffold = args.paths.filter((p: string) => !SCAFFOLD_OWNED.has(p))
        const phase1Paths = nonScaffold.filter((p: string) => activePhase1Core.has(p))
        const phase2Paths = nonScaffold.filter((p: string) => !activePhase1Core.has(p))
        const dropped = args.paths.filter((p: string) => SCAFFOLD_OWNED.has(p))
        if (dropped.length > 0) console.log(`[phase1-hard] Dropped scaffold-owned files: ${dropped.join(', ')}`)
        if (phase2Paths.length > 0) {
          console.log(`[phase1-hard] AI sent ${args.paths.length} files; enforcing Phase 1 (${phase1Paths.length} files). Deferring to enrichment: ${phase2Paths.join(', ')}`)
          // Create a synthetic manifest so enrichment generates these deferred files
          if (!planBox.manifest) {
            planBox.manifest = {
              files: [
                ...phase1Paths.map((p: string) => ({ path: p, phase: 1, exports: ['default'] })),
                ...phase2Paths.map((p: string) => ({ path: p, phase: 2, exports: ['default'] })),
              ],
              phaseCount: 2,
              multiPhase: true,
              extraPackages: [],
            }
          }
        }
        // Write only Phase 1 files; if none qualified (AI sent all Phase 2), use originals
        const filteredPaths = phase1Paths.length > 0 ? phase1Paths : nonScaffold.length > 0 ? nonScaffold : args.paths
        const p1Result = await phase1GF.execute({ ...args, paths: filteredPaths }, ctx)

        // Guarantee no nav link 404s: stamp a branded shell for any route the Layout links
        // to that has no page yet (deferred sub-pages, or ones the AI forgot to plan).
        await ensureNavShells(sandbox, brandName ?? undefined)

        // ── EARLY URL EMIT ─────────────────────────────────────────────────────
        // Phase 1 files are now on disk. Fire the dev server immediately while the AI
        // continues generating Phase 2 files (they'll land via Vite HMR). This moves
        // the URL emit from AFTER all Phase 2 generation (~8-10 min) to RIGHT NOW (~2 min).
        // Always fires on the first generateFiles call — whether the AI deferred Phase 2
        // (old prompt: one big call with mixed paths) or will call generateFiles again for
        // Phase 2 (new prompt: two separate calls). Both cases the main pipeline is bypassed.
        void (async () => {
            try {
              // Wait for background install before starting dev server
              writer.write({ id: 'srv-phase-install', type: 'data-build-phase', data: { phase: 'installing', label: 'Installing packages...' } })
              if (bgInstallPromise) await bgInstallPromise
              // Quick CSS pre-fix — @import tailwindcss syntax breaks Vite on first boot.
              // Full Step 4.5 palette lock runs later via HMR; this just prevents boot errors.
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
                  if (css.includes('@apply') || /@apply/i.test(css)) {
                    const before = css
                    css = css.replace(/@apply\s+[^;{}\n]*;?/gi, '')
                    if (css !== before) changed = true
                  }
                  if (changed) await sandbox.writeFiles([{ path: 'src/index.css', content: Buffer.from(css, 'utf8') }])
                }
              } catch { /* non-fatal — Vite will attempt to boot anyway */ }
              // ── Code review gate — check logic bugs BEFORE dev server starts ──
              await reviewGeneratedCode(sandbox, skill)
              // SERVER_FIRST already booted the dev server + emitted the URL before generation
              // (Phase A). Skip the boot/emit here — just run verify (fixes land live via HMR).
              if (process.env.SERVER_FIRST === 'true') {
                void verifyAndRepair({ sandbox, sandboxId, writer }).catch(() => {})
                return
              }
              // Start dev server
              writer.write({ id: 'srv-phase-build', type: 'data-build-phase', data: { phase: 'building', label: 'Building and starting preview...' } })
              writer.write({ id: 'srv-dev', type: 'data-run-command', data: { sandboxId, command: 'bun', args: ['run', 'dev'], status: 'executing' } })
              try {
                const devCmd = await sandbox.runCommand({ detached: true, cmd: 'bash', args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'] })
                writer.write({ id: 'srv-dev', type: 'data-run-command', data: { sandboxId, commandId: devCmd.cmdId, command: 'bun', args: ['run', 'dev'], status: 'running' } })
              } catch { /* non-fatal */ }
              // verifyAndRepair in background — fixes land via HMR
              void verifyAndRepair({ sandbox, sandboxId, writer }).catch(() => {})
              // Wait for Vite to boot
              writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { status: 'loading' } })
              const domain = sandbox.domain(3000)
              await waitForDevServer(domain)
              // Dev server is up, but DON'T reveal the URL yet — the reveal is gated on the
              // headless render-check (Step 6.5) so the user never sees a blank/broken preview.
              earlyEmitUrl = domain
              earlyEmitDone = true
              console.log('[early-emit] Phase 1 dev server up (reveal deferred to render-check):', domain)
              if (projectId) updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: domain }).catch(() => {})
            } catch (err) {
              console.warn('[early-emit] failed:', err instanceof Error ? err.message : err)
            }
          })()

        return p1Result
      }
      return rawGF.execute(args, ctx)
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipelineTools: Record<string, any> = skill === 'website'
    ? {
        loadSkill: loadSkill(),
        generateFiles: guardedGF,
        getUnsplashBatch: getUnsplashBatch(),
        generateImageBatch: generateImageBatch(),
        planProject: capturePlan,
        lookupReference: lookupReference(),
      }
    : skill === 'webapp'
    ? {
        loadSkill: loadSkill(),
        generateFiles: guardedGF,
        planProject: capturePlan,
        lookupReference: lookupReference(),
      }
    : {
        loadSkill: loadSkill(),
        generateFiles: rawGF,
        planProject: capturePlan,
        lookupReference: lookupReference(),
      }

  // Generous step headroom so an optional lookupReference + generateImageBatch + error-fix
  // rounds can NEVER crowd out the required pipeline. generateFiles is the goal.
  // website (2-phase): generateFiles(P1) → getUnsplashBatch+planProject(P2) → generateFiles(P2)
  //   → patchFile(Phase2Sections) + optional lookupReference/generateImageBatch + fix round
  // webapp (2-phase): planProject → generateFiles(P1) → generateFiles(P2 components)
  //   = ~8 nominal + 6 headroom → 14
  // app/game: text + (loadSkill?) + planProject + generateFiles + slack
  const maxSteps = skill === 'website' ? 14 : skill === 'webapp' ? 12 : 9 // website+webapp use 2-phase build

  // ── #89: GENERATION DEADLINE (never die mid-generation → never blank) ─────────────
  // Bound the AI generation so the pipeline ALWAYS has time to reach verify-before-reveal +
  // the fallback within the 800s function budget. A complex build that overruns must NOT let
  // the invocation die during `await aiResult.text` (which leaves the user on an infinite
  // "Building…" with no preview). We abort generation ~210s before the cap; whatever files
  // exist are then salvaged (shells from the manifest) and the render-check reveals a working
  // preview or a clean branded fallback — never a blank/infinite spinner.
  const genBudgetMs = Math.max(
    60_000,
    (invocationStart ?? Date.now()) + (maxDuration * 1000 - 210_000) - Date.now()
  )
  const genAbort = AbortSignal.timeout(genBudgetMs)

  const aiResult = streamText({
    ...getModelOptions(DEFAULT_MODEL),
    system: fullSystem,
    messages: await convertToModelMessages(transformMessages(messages)),
    stopWhen: stepCountIs(maxSteps),
    // Model's max output — planProject manifests and tool args must never truncate.
    maxOutputTokens: getMaxOutputTokens(DEFAULT_MODEL),
    tools: pipelineTools,
    abortSignal: genAbort,
    onError: error => console.error('Pipeline AI error:', error),
  })

  writer.merge(aiResult.toUIMessageStream({ sendReasoning: false, sendStart: false }))

  // Wait for generation. If it hits the deadline, we STOP and salvage — the render-check +
  // fallback below still deliver a working preview or a clean fallback (never blank).
  let genHitDeadline = false
  try {
    await aiResult.text
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/abort|timeout|cancel/i.test(msg)) {
      genHitDeadline = genAbort.aborted
      console.warn(`Pipeline AI stopped early (non-fatal, deadline=${genHitDeadline}):`, msg)
    } else {
      console.error('Pipeline AI failed:', msg)
      writer.write({
        id: 'srv-error',
        type: 'data-report-errors',
        data: { summary: `Generation failed: ${msg}. Please try again.`, paths: [] },
      })
      return { chained: false }
    }
  }

  // Verify generateFiles was actually called — if AI only produced text (rare edge case)
  // AND we have no manifest to salvage from, skip pnpm to avoid an empty sandbox. When a
  // manifest exists (planProject ran), we proceed even if generation was cut short — the
  // shell-salvage below makes the build green from the manifest.
  // Skip this check if generation was force-stopped at the deadline — aiResult.steps would
  // hang on the stuck stream, and the manifest (planProject) is enough to salvage from.
  if (!genHitDeadline) {
    try {
      const allSteps = await Promise.race([
        aiResult.steps,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('steps-timeout')), 8_000)),
      ])
      const calledGenerateFiles = allSteps.some(
        step =>
          Array.isArray(step.toolCalls) &&
          (step.toolCalls as Array<{ toolName: string }>).some(
            tc => tc.toolName === 'generateFiles'
          )
      )
      if (!calledGenerateFiles && !planBox.manifest) {
        console.warn('Pipeline: AI produced no files and no manifest — aborting pnpm phase')
        return { chained: false }
      }
    } catch {
      // Can't verify (timeout or error) — proceed anyway; salvage handles missing files.
    }
  }

  // (Shell-salvage removed 2026-07-06 — it wrongly shelled App.tsx and broke the mount.
  // Missing/incomplete files are now recovered by generateFiles' own import-closure + retry
  // passes and the silent build gate below, never by stamping page-shells over foundation.)
  void genHitDeadline

  // ── Synthetic manifest: when AI skips planProject but dumps Phase 2 files in Phase 1 ──
  // If planProject was never called (planBox.manifest === null) but the AI generated page
  // files beyond the Phase 1 core (e.g. Lookbook.tsx, Product.tsx, About.tsx), those files
  // are already written to the sandbox — but without a manifest, enrichment never runs and
  // Phase2Sections.tsx stays blank. Build a manifest from the tool-call history so enrichment
  // can patch Phase2Sections to import+render all the AI's section/component files.
  if (!planBox.manifest && skill === 'website' && !genHitDeadline) {
    try {
      const PHASE1_CORE = new Set([
        'src/index.css', 'src/components/Layout.tsx', 'src/pages/Home.tsx',
        'src/components/Phase2Sections.tsx',
      ])
      const steps = await Promise.race([
        aiResult.steps,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('steps-timeout')), 5000)),
      ])
      const allGenPaths: string[] = []
      for (const step of steps) {
        for (const tc of ((step.toolCalls as unknown) as Array<{ toolName: string; args: { paths?: string[] } }> ?? [])) {
          if (tc.toolName === 'generateFiles' && Array.isArray(tc.args?.paths)) {
            allGenPaths.push(...tc.args.paths)
          }
        }
      }
      const phase2Paths = [...new Set(allGenPaths)].filter(p => !PHASE1_CORE.has(p))
      if (phase2Paths.length >= 2) {
        const phase1Paths = [...new Set(allGenPaths)].filter(p => PHASE1_CORE.has(p))
        planBox.manifest = {
          files: [
            ...phase1Paths.map(p => ({ path: p, phase: 1, exports: ['default'] })),
            ...phase2Paths.map(p => ({ path: p, phase: 2, exports: ['default'] })),
          ],
          phaseCount: 2,
          multiPhase: true,
          extraPackages: [],
        }
        console.log(`[synthetic-manifest] built from AI tool calls: ${phase2Paths.length} Phase 2 files → enrichment will run`)
      }
    } catch { /* non-fatal */ }
  }

  // ── Durable-runs STEP 2: capture manifest + conversation context for enrichment ─
  // The full model-message context (user turn + the AI's tool results, incl. image
  // URLs + the locked manifest) is what a self-contained enrichment phase re-uses so
  // each full page matches phase 1. Persist the manifest on the run row now (sets up
  // STEP 3's resume). All best-effort — never blocks the preview.
  // Websites are SINGLE-PASS now (complete landing page in one generateFiles call) — never
  // run enrichment/shells for them. The old 2-phase enrichment is what left footer-only
  // homepages when it didn't fill the sections. Only webapp (self-contained phase-1) enriches.
  const enrichManifest = skill === 'website' ? null : planBox.manifest
  let genContext: import('ai').ModelMessage[] = []
  if (enrichManifest && enrichManifest.multiPhase) {
    try {
      const base = await convertToModelMessages(transformMessages(messages))
      const responseMsgs = (await aiResult.response).messages
      genContext = [...base, ...responseMsgs]
    } catch (e) {
      console.warn('[enrichment] could not build gen context (non-fatal):', e instanceof Error ? e.message : e)
    }
    if (runId) {
      // Persist manifest + the design context so a CONTINUATION invocation can resume
      // enrichment with ZERO model context (brief re-used for on-brand full pages).
      await updateRun(runId, {
        manifest: enrichManifest.files,
        phase_cursor: 0,
        ...(designContext ? { brief: designContext } : {}),
      }).catch(() => {})
    }
  }

  // ── Step 3.5: Stamp server-side shells for deferred pages ────────────────
  // For multi-phase builds, every phase-2+ page gets a branded placeholder the
  // server writes in microseconds (no model call). This ensures ALL route files
  // exist immediately so vite build passes and the router resolves every link —
  // even before enrichment fills in real content via HMR. Shells never appear
  // in the chat; they silently replace themselves as each enrichment phase runs.
  if (enrichManifest && enrichManifest.multiPhase) {
    try {
      const shells = stampShellsForManifest(enrichManifest.files, brandName ?? undefined)
      if (shells.length > 0) {
        await sandbox.writeFiles(shells.map((s) => ({ path: s.path, content: Buffer.from(s.content, 'utf8') })))
        console.log(`[shells] stamped ${shells.length} phase-2+ shells before install`)
      }
    } catch (e) {
      console.warn('[shells] stamp failed (non-fatal):', e instanceof Error ? e.message : e)
    }
  }

  // ── Step 3.6: Website Phase2Sections.tsx guarantee ──────────────────────
  // If the AI violated the 4-file Phase 1 rule (dumped all pages in one call
  // and omitted Phase2Sections.tsx), Home.tsx's import would fail the build and
  // cascade into a 3-round repair loop that can exhaust the 800s function budget.
  // Server guarantees the placeholder exists before install runs — zero LLM cost.
  if (skill === 'website') {
    const PHASE2_PLACEHOLDER = 'src/components/Phase2Sections.tsx'
    try {
      const existing = await readSandboxFile(sandbox, PHASE2_PLACEHOLDER)
      if (!existing || existing.trim().length < 20) {
        await sandbox.writeFiles([{
          path: PHASE2_PLACEHOLDER,
          content: Buffer.from(
            `export default function Phase2Sections() {\n  return <div className="bg-background" style={{ minHeight: '60vh' }} />\n}\n`,
            'utf8'
          ),
        }])
        console.log('[website-guard] stamped missing Phase2Sections.tsx placeholder')
      }
    } catch (e) {
      console.warn('[website-guard] Phase2Sections stamp failed (non-fatal):', e instanceof Error ? e.message : e)
    }
  }

  // ── Step 4: Server finalizes install ─────────────────────────────────────
  // Skipped when early-emit already awaited bgInstallPromise before starting dev server.
  if (!earlyEmitDone) {
    writer.write({
      id: 'srv-install',
      type: 'data-run-command',
      data: { sandboxId, command: 'bun', args: ['install'], status: 'waiting' },
    })
    try {
      const installCmd = await sandbox.runCommand({
        detached: true,
        cmd: 'bash',
        args: ['-c', 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'],
      })
      await Promise.race([
        installCmd.wait(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('install timed out')), 90_000)
        ),
      ])
      writer.write({
        id: 'srv-install',
        type: 'data-run-command',
        data: { sandboxId, command: 'bun', args: ['install'], status: 'done', exitCode: 0 },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'install failed'
      writer.write({
        id: 'srv-install',
        type: 'data-run-command',
        data: {
          sandboxId,
          command: 'bun',
          args: ['install'],
          error: { message },
          status: 'error',
        },
      })
      // Non-fatal — dev server may still work if background install finished.
    }
  }

  // ── Step 4.5: CSS sanity check — fix BEFORE dev server reads the file ───────
  // Runs synchronously here so Vite sees the corrected CSS from the first read.
  // (Previously this ran after dev server start — race condition where Vite
  // could pick up the broken CSS before the fix landed.)
  try {
    const cssStream = await sandbox.readFile({ path: 'src/index.css' })
    if (cssStream) {
      const chunks: Buffer[] = []
      for await (const c of cssStream) {
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string))
      }
      let css = Buffer.concat(chunks).toString('utf8')
      let changed = false

      if (css.includes("@import 'tailwindcss/base'") || css.includes('@import "tailwindcss/base"')) {
        css = css
          .replace(/@import ['"]tailwindcss\/base['"]\s*;?/g, '@tailwind base;')
          .replace(/@import ['"]tailwindcss\/components['"]\s*;?/g, '@tailwind components;')
          .replace(/@import ['"]tailwindcss\/utilities['"]\s*;?/g, '@tailwind utilities;')
        changed = true
        console.warn('[css-check] Fixed wrong @import tailwindcss syntax')
      }

      // DETERMINISTIC PALETTE LOCK: write the brief's unique brand palette into :root
      // as the source of truth — so colours are consistently on-brand every run, and
      // the fallback is never the generic blue/grey defaults. This is the design-
      // consistency engine: token-driven components + a locked per-project palette.
      if (tokens) {
        const locked = lockPaletteInCss(css, tokens)
        if (locked && locked !== css) {
          css = locked
          changed = true
          console.warn('[css-check] Locked brand palette into :root')
        }
      } else if (!css.includes(':root')) {
        css += `\n:root {\n  --background: 0 0% 100%;\n  --foreground: 222.2 84% 4.9%;\n  --primary: 221.2 83.2% 53.3%;\n  --primary-foreground: 210 40% 98%;\n  --secondary: 210 40% 96.1%;\n  --secondary-foreground: 222.2 47.4% 11.2%;\n  --muted: 210 40% 96.1%;\n  --muted-foreground: 215.4 16.3% 46.9%;\n  --accent: 210 40% 96.1%;\n  --accent-foreground: 222.2 47.4% 11.2%;\n  --destructive: 0 84.2% 60.2%;\n  --destructive-foreground: 210 40% 98%;\n  --border: 214.3 31.8% 91.4%;\n  --input: 214.3 31.8% 91.4%;\n  --ring: 221.2 83.2% 53.3%;\n  --radius: 0.5rem;\n}\n* { border-color: hsl(var(--border)); }\nbody { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }\n`
        changed = true
        console.warn('[css-check] Appended missing :root CSS variables')
      }

      if (css.includes('@apply') || /@apply/i.test(css)) {
        const before = css
        css = css.replace(/@apply\s+[^;{}\n]*;?/gi, '')
        if (css !== before) { changed = true; console.warn('[css-check] Stripped @apply') }
      }

      {
        // Full validation with the real PostCSS parser — catches unclosed
        // parens, missing colons, stray braces; auto-drops broken lines.
        const before = css
        css = ensureValidCss(css)
        if (css !== before) {
          changed = true
          console.warn('[css-check] css-guard repaired invalid CSS before dev server start')
          logRepair({ layer: 'css-sanity', action: 'repaired', sandboxId })
        }
      }

      if (changed) {
        await sandbox.writeFiles([{ path: 'src/index.css', content: Buffer.from(css, 'utf8') }])
      }
    }
  } catch {
    // Non-fatal
  }

  // ── EARLY durable snapshot (fire-and-forget) ──────────────────────────────────
  // All files are written NOW, before the long verify → runtime-check → self-heal
  // tail. Snapshot immediately so the project is saved even if the request is later
  // killed (800s cap, connection drop, mid-iteration disruption). It runs during that
  // tail (minutes of headroom) so it completes; the final snapshot refreshes it.
  if (projectId && userId) {
    const pid = projectId, uid = userId
    snapshotProject(sandbox, uid, pid)
      .then((p) => (p ? updateProjectRow(pid, { sandbox_id: sandboxId, snapshot_path: p }) : undefined))
      .catch(() => {})
  }

  // ── Code review gate — catch logic bugs before the dev server ever starts ────
  // Runs for games (earlyEmitDone=false) only. Website/webapp already ran this
  // inside the early-emit IIFE above. Non-fatal: never blocks the pipeline.
  if (!earlyEmitDone) await reviewGeneratedCode(sandbox, skill)

  // ── Step 4.7+5 (CONCURRENT): Dev server starts now; verify/repair runs in background ─
  // Skipped when early-emit already launched the dev server during Phase 1.
  if (!earlyEmitDone) {
    writer.write({
      id: 'srv-dev',
      type: 'data-run-command',
      data: { sandboxId, command: 'bun', args: ['run', 'dev'], status: 'executing' },
    })
    try {
      const devCmd = await sandbox.runCommand({
        detached: true,
        cmd: 'bash',
        args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'],
      })
      writer.write({
        id: 'srv-dev',
        type: 'data-run-command',
        data: {
          sandboxId,
          commandId: devCmd.cmdId,
          command: 'bun',
          args: ['run', 'dev'],
          status: 'running',
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'dev server failed to start'
      writer.write({
        id: 'srv-dev',
        type: 'data-run-command',
        data: {
          sandboxId,
          command: 'bun',
          args: ['run', 'dev'],
          error: { message },
          status: 'error',
        },
      })
    }
    // Kick off verify/repair in background — any fixes land via Vite HMR
    void verifyAndRepair({ sandbox, sandboxId, writer }).catch((err) => {
      console.warn('[verify] verifyAndRepair threw (non-fatal):', err instanceof Error ? err.message : err)
    })
  }

  // ── Step 6: Wait for Vite to be ready, then return URL ────────────────────
  // When early-emit already handled this (website Phase-1 path), skip directly to
  // Step 6.5 headless check — dev server is running and URL has been emitted.
  let url: string
  let devError: string | null
  if (earlyEmitDone) {
    url = earlyEmitUrl
    devError = null
  } else {
    // pnpm dev started in background (detached) — Vite takes 5-15s to boot.
    writer.write({
      id: 'srv-url',
      type: 'data-get-sandbox-url',
      data: { status: 'loading' },
    })
    url = sandbox.domain(3000)
    devError = await waitForDevServer(url)

    // Self-heal a 500 caused by a missing package (e.g. tailwind.config.js requiring
    // a dep the AI's package.json dropped): install it, restart the dev server (the
    // running process caches the failed require), and re-check — all server-side,
    // before the user or the AI ever sees an error.
    if (devError && (await installMissingModules(sandbox, devError))) {
      console.warn('[dev-check] installed missing modules — restarting dev server')
      logRepair({ layer: 'dev-500', action: 'auto-installed-and-restarted', detail: devError.slice(0, 200), sandboxId })
      await restartDevServer(sandbox)
      devError = await waitForDevServer(url)
    }

    // Handle dev-500 silently before URL emit: apply a branded fallback page.
    if (devError) {
      logRepair({ layer: 'dev-500', action: 'silent-fallback', detail: devError.slice(0, 200), sandboxId })
      try {
        await applyFallbackTerminalState(sandbox, devError, { skill, brand: brandName || 'This project' })
        await new Promise(r => setTimeout(r, 3000))
      } catch { /* non-fatal */ }
    }

    // ── Do NOT reveal the URL yet — verify-before-reveal ──────────────────────────────
    // The reveal is gated on the headless render-check (Step 6.5) below, so the user is
    // never shown a blank/broken preview (the "blank Flappy Bird" class). Keep the client
    // on the "Building…" indicator until the check confirms the app actually painted.
    // Persist the URL now so a continuation invocation (enrichment hand-off) still has it.
    if (projectId) {
      updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: url }).catch(() => {})
    }
  }

  // ── Step 6.5: Headless quality check (repairs arrive live via Vite HMR) ───────────
  // Client already has the URL — any file writes done here are picked up automatically.
  let rtResult: { status: 'ok' | 'broken' | 'skipped'; detail: string; score?: number | null; screenshot?: Buffer } | null = null
  if (!devError) {
    try {
      writer.write({
        id: 'srv-runtime',
        type: 'data-run-command',
        data: { sandboxId, command: 'Polishing your preview', args: [], status: 'executing' },
      })
      let rt = await headlessRuntimeCheck(url, sandboxId)
      console.log(`[runtime-check] verdict status=${rt.status}${rt.status === 'ok' ? '' : ' — ' + rt.detail.slice(0, 160)}`)
      if (rt.status === 'broken') {
        logRepair({ layer: 'runtime-check', action: 'broken', detail: rt.detail.slice(0, 200), sandboxId })
      }
      // Missing package — deterministic fix, no LLM needed
      if (rt.status === 'broken' && (await installMissingModules(sandbox, rt.detail))) {
        await restartDevServer(sandbox)
        await new Promise(r => setTimeout(r, 4000))
        rt = await headlessRuntimeCheck(url, sandboxId)
      }
      // LLM repair round
      if (rt.status === 'broken') {
        const files = extractErrorFiles(rt.detail)
        let repaired = false
        for (const path of files.slice(0, 4)) {
          const content = await readSandboxFile(sandbox, path)
          if (!content) continue
          const fixed = await repairFile(path, content, rt.detail)
          if (fixed && fixed !== content) {
            const finalContent = path.endsWith('.css') ? sanitizeCss(fixed) : sanitizeTsx(path, fixed)
            await sandbox.writeFiles([{ path, content: Buffer.from(finalContent, 'utf8') }])
            repaired = true
          }
        }
        if (repaired) {
          await new Promise(r => setTimeout(r, 3500))
          rt = await headlessRuntimeCheck(url, sandboxId)
        }
        // Terminal fallback — always leaves a clean, renderable page before the URL is shown
        if (rt.status === 'broken') {
          try {
            const swapped = await applyFallbackTerminalState(sandbox, rt.detail, { skill, brand: brandName || 'This project' })
            if (swapped) {
              await new Promise(r => setTimeout(r, 3500))
              rt = await headlessRuntimeCheck(url, sandboxId)
              if (rt.status === 'broken') {
                await applyFallbackTerminalState(sandbox, 'force-app-level', { skill, brand: brandName || 'This project' })
                await new Promise(r => setTimeout(r, 3500))
              }
              logRepair({ layer: 'fallback-terminal', action: 'swapped-to-fallback', detail: rt.detail.slice(0, 160), sandboxId })
            }
          } catch (e) {
            console.warn('[fallback] terminal-state swap failed (non-fatal):', e instanceof Error ? e.message : e)
          }
          logRepair({ layer: 'runtime-check', action: 'silent-fallback', detail: rt.detail.slice(0, 160), sandboxId })
        }
      }
      rtResult = rt
      writer.write({
        id: 'srv-runtime',
        type: 'data-run-command',
        data: { sandboxId, command: 'Checking your preview renders correctly', args: [], status: 'done', exitCode: 0 },
      })
    } catch (e) {
      // Chromium failed to launch (e.g. memory limit in serverless). Fall back to a simple
      // HTTP check — at minimum verify the dev server returns 200 with non-empty HTML.
      // If even the HTTP check fails, apply the fallback terminal state before showing URL.
      console.warn('[runtime-check] wrapper error — trying HTTP fallback:', e instanceof Error ? e.message : e)
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        const httpResp = await fetch(url, { signal: ctrl.signal }).catch(() => null)
        clearTimeout(timer)
        if (!httpResp || !httpResp.ok) {
          // HTTP check failed — apply fallback so user doesn't see a dead iframe
          await applyFallbackTerminalState(sandbox, 'chromium-unavailable', { skill, brand: brandName || 'This project' })
          await new Promise(r => setTimeout(r, 3000))
          logRepair({ layer: 'runtime-check', action: 'http-fallback-applied', detail: 'chromium launch failed + HTTP non-200', sandboxId })
        }
      } catch {
        /* truly non-fatal — proceed */
      }
      writer.write({
        id: 'srv-runtime',
        type: 'data-run-command',
        data: { sandboxId, command: 'Checking your preview renders correctly', args: [], status: 'done', exitCode: 0 },
      })
    }
  }

  // ── VERIFY-BEFORE-REVEAL: reveal the preview ONLY NOW ─────────────────────────────
  // The headless render-check above confirmed the app paints real content (or swapped in a
  // clean branded fallback). Only at THIS point do we show the URL and tell the user their
  // project is live — so they never see a blank/broken preview or a "live" message that's
  // immediately followed by an error fix (the confidence-killer). Until now the client stays
  // on the "Building…" indicator.
  writer.write({ id: 'srv-url', type: 'data-get-sandbox-url', data: { url, status: 'done' } })
  if (projectId) updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: url }).catch(() => {})

  // ── Context-aware follow-up suggestion pills (#84) — background, non-blocking ──────
  // After a verified build, a lightweight model proposes 3 short next steps based on the
  // request + files. Rendered as clickable chips that fill the chat input.
  void (async () => {
    try {
      const items = await generateSuggestions({
        request: getLastUserText(messages),
        skill,
        filePaths: planBox.manifest?.files.map((f) => f.path) ?? [],
      })
      if (items.length) writer.write({ id: 'srv-suggestions', type: 'data-suggestions', data: { items } })
    } catch { /* non-fatal */ }
  })()

  // ── Design-improvement pass via HMR ──────────────────────────────────────────────
  if (
    rtResult &&
    rtResult.status === 'ok' &&
    typeof rtResult.score === 'number' &&
    rtResult.score < 4 &&
    rtResult.screenshot
  ) {
    await improveDesignPass({
      sandbox,
      screenshot: rtResult.screenshot,
      critique: rtResult.detail || 'low visual design quality',
      writer,
      sandboxId,
    })
    await new Promise(r => setTimeout(r, 3000))
  }

  // ── Durable-runs STEP 2+3: PROGRESSIVE, RESUMABLE ENRICHMENT (phases 2..N) ──────
  // The phase-1 skeleton + branded shells are LIVE in the preview now. Fill each later
  // phase's shells into full pages, one transaction at a time, narrating as we go —
  // Vite HMR makes them appear live. STEP 3: the engine is deadline-aware — if the 800s
  // invocation budget runs out mid-build it snapshots, marks the run 'continuing', and
  // fires a fresh continuation invocation (server-chained, walk-away-native), returning
  // { chained: true }. Only when the planner produced a genuine multi-phase manifest AND
  // phase 1 is healthy (never enrich onto a broken build). Single-phase (small/simple)
  // projects skip this entirely — identical to before.
  if (enrichManifest && enrichManifest.multiPhase && !devError) {
    // deadline = invocationStart + (maxDuration − 90s margin). Falls back to now-based
    // if invocationStart wasn't threaded (defensive; the POST handler always passes it).
    const deadline = (invocationStart ?? Date.now()) + (maxDuration * 1000 - 120_000)
    try {
      const res = await runResumableEnrichment({
        writer,
        sandbox,
        sandboxId,
        manifest: enrichManifest,
        genContext,
        designContext,
        runId,
        projectId,
        userId,
        deadline,
        fromPhase: 0,
      })
      if (res.chained) {
        // Handed off to a continuation invocation — it owns the final snapshot + marking
        // the run done. Stop the incremental snapshot loop and end THIS invocation now.
        if (snapTimer) { clearInterval(snapTimer); snapTimer = null }
        return { chained: true }
      }
    } catch (e) {
      console.warn('[enrichment] loop failed (non-fatal):', e instanceof Error ? e.message : e)
    }
  }

  // Stop the incremental snapshot loop — the final awaited snapshot below supersedes it.
  if (snapTimer) { clearInterval(snapTimer); snapTimer = null }

  // ── Deadline-approaching safe exit message ────────────────────────────────────
  // If the build has been running for more than 710s (within 90s of the 800s cap),
  // emit a friendly user-facing message so they know what happened — instead of the
  // connection just silently dropping with no explanation.
  if (invocationStart && Date.now() - invocationStart > 710_000) {
    writer.write({
      id: 'srv-timeout-warn',
      type: 'data-report-errors',
      data: {
        summary: "This build is taking longer than expected. Try breaking it into smaller steps — start with just the core feature, then add more.",
        paths: [],
      },
    })
  }

  // Save a last-known-good checkpoint when the pipeline ends healthy. If a later
  // edit breaks the project beyond repair, the AI's restoreCheckpoint tool brings
  // this version back — a working preview always beats a broken one.
  // Last-known-GOOD checkpoint only when the pipeline ended healthy (restoreCheckpoint target).
  if (!devError) {
    saveCheckpoint(sandbox).catch(() => {})
  }

  // Durable snapshot → Supabase Storage so the project can be reopened in a fresh sandbox.
  // Runs REGARDLESS of devError — a project that ended with an error must STILL be reopenable
  // so the user can come back and fix it (never a dead "no saved snapshot"). AWAITED (the URL is
  // already emitted, so the user's preview is unaffected) and RETRIED with a generous timeout so
  // snapshot_path is never left NULL for a large project.
  if (projectId && userId) {
    let snapshotPath: string | null = null
    for (let attempt = 0; attempt < 2 && !snapshotPath; attempt++) {
      try {
        snapshotPath = await Promise.race([
          snapshotProject(sandbox, userId, projectId),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 60_000)),
        ])
      } catch {
        /* retry once */
      }
    }
    await updateProjectRow(projectId, {
      sandbox_id: sandboxId,
      preview_url: url,
      ...(snapshotPath ? { snapshot_path: snapshotPath } : {}),
    }).catch(() => {})
    if (!snapshotPath) console.warn(`[snapshot] final snapshot still NULL after retry for project ${projectId} (sandbox ${sandboxId})`)
  }
  return { chained: false }
}

// Poll the sandbox URL until the dev server responds (non-502 = port is listening).
// Returns an error string if the page is serving 500s (Vite/PostCSS crash), null if healthy.
// Times out after maxWaitMs and emits URL anyway.
// Nav-link 404 guarantee: for every internal route the Layout links to, make sure the
// page file exists. Any target with no page (deferred/never-planned) gets a branded shell
// stamped so the link renders a real "coming together" page instead of the 404 screen.
// Deterministic, cheap, and idempotent — runs right after Phase-1 files land.
async function ensureNavShells(sandbox: Sandbox, brandName?: string): Promise<void> {
  try {
    const layout = await readSandboxFile(sandbox, 'src/components/Layout.tsx')
    if (!layout) return
    const wanted = navTargetPageFiles(layout)
    if (wanted.length === 0) return
    const missing: Array<{ path: string; content: string }> = []
    for (const path of wanted) {
      const existing = await readSandboxFile(sandbox, path)
      if (existing && existing.trim().length > 20) continue
      missing.push({ path, content: stampShell({ path, exports: ['default'], brandName }) })
    }
    if (missing.length > 0) {
      await sandbox.writeFiles(missing.map((m) => ({ path: m.path, content: Buffer.from(m.content, 'utf8') })))
      console.log(`[nav-shells] stamped ${missing.length} shell page(s) for nav links: ${missing.map((m) => m.path.split('/').pop()).join(', ')}`)
    }
  } catch (e) {
    console.warn('[nav-shells] failed (non-fatal):', e instanceof Error ? e.message : e)
  }
}

async function waitForDevServer(url: string, maxWaitMs = 45_000): Promise<string | null> {
  const deadline = Date.now() + maxWaitMs
  let consecutiveFiveHundreds = 0

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (res.status === 502) {
        // Not listening yet — keep polling
        consecutiveFiveHundreds = 0
      } else if (res.status === 500) {
        // Vite is up but crashing (PostCSS error, import error, etc.)
        consecutiveFiveHundreds++
        if (consecutiveFiveHundreds >= 2) {
          // Confirmed crash — read body for error details
          let errorDetail = 'The page is returning a 500 error — likely a CSS @apply with an unknown class, a broken import, or a PostCSS/Vite compilation error.'
          try {
            const body = await res.text()
            const match = body.match(/\[postcss\][^\n]+|Error[^\n]+/)
            if (match) errorDetail = match[0].trim()
          } catch { /* non-fatal */ }
          return `Preview page is broken (500): ${errorDetail} Fix src/index.css and any files with broken imports.`
        }
      } else {
        // Non-502, non-500 — server is up and page is loading
        return null
      }
    } catch {
      // AbortError, network error — not ready yet
      consecutiveFiveHundreds = 0
    }
    await new Promise(r => setTimeout(r, 2500))
  }
  return null // timed out — emit URL anyway
}
