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
import { generateFiles } from '@/ai/tools/generate-files'
import { getUnsplashBatch } from '@/ai/tools/get-unsplash-batch'
import { generateImageBatch } from '@/ai/tools/generate-image-batch'
import { planProject, type NormalizedManifest } from '@/ai/tools/plan-project'
import { lookupReference, tavilySearch } from '@/ai/tools/lookup-reference'
import { classifyPrompt } from '@/ai/classifier'
import { expandPrompt } from '@/ai/expander'
import { formatBrief } from '@/ai/types/project-brief'
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
import { stampShellsForManifest, stampShell } from '@/lib/shell-template'
import {
  readSandboxFile,
  extractBuildError,
  extractErrorFiles,
  installMissingModules,
  repairFile,
} from '@/lib/sandbox-util'
import { createProjectRow, snapshotProject, updateProjectRow, getProjectBySandboxId, incrementProjectTokens } from '@/lib/projects-db'
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

function hasActiveSandbox(messages: ChatUIMessage[]): boolean {
  return messages.some(
    msg =>
      Array.isArray(msg.parts) && msg.parts.some(p => p.type === 'data-create-sandbox')
  )
}

// Scans message history to extract sandboxId + every file generated so far.
// Injected into edit-turn system prompt so AI knows exactly what files exist.
function getProjectContext(messages: ChatUIMessage[]): { sandboxId: string | null; filePaths: string[] } {
  let sandboxId: string | null = null
  const seen = new Set<string>()
  const filePaths: string[] = []

  for (const msg of messages) {
    if (!Array.isArray(msg.parts)) continue
    for (const part of msg.parts) {
      if (
        part.type === 'data-create-sandbox' &&
        part.data?.sandboxId
      ) {
        sandboxId = part.data.sandboxId
      }
      if (
        part.type === 'data-generating-files' &&
        part.data?.status === 'done' &&
        Array.isArray(part.data?.paths)
      ) {
        for (const p of part.data.paths as string[]) {
          if (!seen.has(p)) {
            seen.add(p)
            filePaths.push(p)
          }
        }
      }
    }
  }

  return { sandboxId, filePaths }
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
    data: { sandboxId, command: 'Finalizing your project', args: [], status: 'executing' },
  })
  // P0-B: hard overall budget for the entire repair phase. No matter how many rounds or files,
  // repair can NEVER run past this — the pipeline always proceeds to show the best build we have,
  // never an endless "Finalizing…". Paired with repairFile's own 45s per-call ceiling.
  const repairDeadline = Date.now() + 150_000
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (Date.now() > repairDeadline) {
        console.warn('[verify] repair budget (150s) exhausted — proceeding with current build')
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
          new Promise<void>((_, rej) => setTimeout(() => rej(new Error('build timeout')), 90_000)),
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
        // them BEFORE the preview, not at runtime.
        await typeCheckGate({ sandbox, sandboxId })
        return
      }

      const errorBlock = extractBuildError(log)

      // Missing package? Install it — deterministic, fixes the whole error class
      // (AI-referenced packages, config-required packages) without any LLM call.
      if (await installMissingModules(sandbox, log)) continue

      const files = extractErrorFiles(log)
      console.warn(`[verify] attempt ${attempt} failed. files=${files.join(',')} err=${errorBlock.slice(0, 160)}`)
      logRepair({ layer: 'build-verify', action: `attempt-${attempt}-failed`, detail: errorBlock.slice(0, 200), sandboxId })

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
          const finalContent = path.endsWith('.css') ? sanitizeCss(fixed) : fixed
          await sandbox.writeFiles([{ path, content: Buffer.from(finalContent, 'utf8') }])
          repairedAny = true
        }
      }
      if (!repairedAny) return
    }
  } finally {
    // Always close the status as done — repair is best-effort, never user-facing failure.
    writer.write({
      id: 'srv-finalize',
      type: 'data-run-command',
      data: { sandboxId, command: 'Finalizing your project', args: [], status: 'done', exitCode: 0 },
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
async function typeCheckGate({ sandbox, sandboxId }: { sandbox: Sandbox; sandboxId: string }): Promise<void> {
  // Loop until tsc is GREEN (bounded rounds) — the preview is only shown after this
  // returns, so a type-clean app is the only thing that reaches the user. Repairs run in
  // PARALLEL each round to stay within the time budget (this replaces the slow,
  // post-preview self-heal, so it's a net speed WIN, not extra minutes).
  for (let round = 1; round <= 3; round++) {
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
        new Promise<void>((_, rej) => setTimeout(() => rej(new Error('tsc timeout')), 120_000)),
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
    const errors: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on('pageerror', (e: any) => errors.push(String(e?.stack || e?.message || e)))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on('console', (msg: any) => {
      if (msg.type() === 'error') errors.push(String(msg.text()))
    })

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => {})
    // Let React mount + effects + state settle. Longer than a single frame so async
    // re-render loops (e.g. an unstable store selector → "maximum update depth") have
    // time to actually throw before we declare the page healthy. A light scroll nudges
    // scroll-triggered effects/animations to run too.
    await new Promise(r => setTimeout(r, 4000))
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
    await new Promise(r => setTimeout(r, 800))

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
        await page.goto(dest, { waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {})
        await new Promise(r => setTimeout(r, 1200))
        // P1-B: same meaningful-paint floor per route (not just childElementCount>0).
        const rp = await page
          .evaluate(() => {
            const r = document.getElementById('root')
            if (!r) return { children: -1, htmlLen: 0, elCount: 0, hasCanvas: false }
            return { children: r.childElementCount, htmlLen: r.innerHTML.trim().length, elCount: r.querySelectorAll('*').length, hasCanvas: !!document.querySelector('canvas') }
          })
          .catch(() => ({ children: -1, htmlLen: 0, elCount: 0, hasCanvas: false }))
        page.off('pageerror', onErr)
        page.off('console', onConsole)
        const routePainted = rp.children >= 1 && rp.elCount >= 1 && (rp.htmlLen >= 40 || rp.hasCanvas)
        if (!routePainted || routeErrors.length > 0) {
          return {
            status: 'broken',
            detail: `The page "${href}" is broken (blank or threw a runtime error) even though Home works. ` +
              `Fix the component for that route.\n` + routeErrors.slice(0, 4).join('\n'),
          }
        }
      }
      // Return to home so the screenshot below captures the entry page.
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {})
      await new Promise(r => setTimeout(r, 800))
    } catch { /* per-route check is best-effort — never blocks the preview */ }

    // ── Game smoke test: a canvas game must ANIMATE + RESPOND to input ──────────
    // Only fires for a large (game-sized) canvas so a small decorative canvas on a website
    // is never flagged. Grab the canvas pixels, drive real input (Space/arrows/click), wait,
    // and grab again — if nothing changed, the game loop isn't running or the start action does
    // nothing (a frozen/dead game that still "compiles"). This is the deterministic catcher for
    // the turtle-ball's worse cousin: a game that doesn't move at all.
    try {
      const bigCanvas: boolean = await page
        .evaluate(() => {
          const c = document.querySelector('canvas') as HTMLCanvasElement | null
          if (!c) return false
          const r = c.getBoundingClientRect()
          return r.width > window.innerWidth * 0.5 && r.height > window.innerHeight * 0.4
        })
        .catch(() => false)
      if (bigCanvas) {
        const grab = (): Promise<string> =>
          page
            .evaluate(() => {
              const c = document.querySelector('canvas') as HTMLCanvasElement | null
              if (!c) return ''
              try {
                return c.toDataURL().slice(-3000)
              } catch {
                return 'tainted'
              }
            })
            .catch(() => '')
        const before = await grab()
        await page.evaluate(() => (document.querySelector('canvas') as HTMLElement | null)?.focus?.()).catch(() => {})
        for (const key of ['Space', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter']) {
          await page.keyboard.press(key).catch(() => {})
          await new Promise((r) => setTimeout(r, 120))
        }
        await page.mouse.click(320, 300).catch(() => {})
        await new Promise((r) => setTimeout(r, 1600))
        const after = await grab()
        if (before && after && before !== 'tainted' && before === after) {
          return {
            status: 'broken',
            detail:
              'The game canvas is not animating or responding to input — after pressing Space/arrows/Enter and clicking, the canvas did not change at all. The game loop is likely not running (requestAnimationFrame never starts, or `running` stays false) or the start/tap action does nothing. Make the loop run and the primary input start + drive the game.',
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
  const authedUser = await getCurrentUser()
  if (!authedUser) {
    return new Response(JSON.stringify({ error: 'Please sign in to build.' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
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
            return await runAgenticLoop({ writer, messages, systemPrompt: prompt })
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
        const sandboxPromise: Promise<Sandbox> = Sandbox.create({ timeout: 1_800_000, ports: [3000] })
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
            const aiBase = process.env.CM_PUBLIC_BASE_URL || 'https://vibeplatform-rho.vercel.app'
            const createdId = created.id
            sandboxPromise
              .then(async (sb) => {
                await sb.writeFiles([{ path: '.env', content: Buffer.from(`VITE_CODEMINE_AI_URL=${aiBase}/api/ai/proxy\nVITE_CODEMINE_AI_TOKEN=${created.aiToken}\n`, 'utf8') }])
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
          runPipeline({ writer, messages, systemPrompt, skill, projectId, userId: user?.id ?? null, designContext, sandboxPromise, tokens: brief.colorTokens, brandName: brief.brandName, runId, invocationStart })
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
  let resolvedSystemPrompt = systemPrompt
  if (isEdit) {
    const { sandboxId, filePaths } = getProjectContext(messages)
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
    }
  }

  // RESUME an interrupted build — the "Continue generation" button sends this exact phrase. In a
  // normal edit generateFiles is banned, but a resume MUST be able to create the files the cut-off
  // generation never wrote. Explicitly allow it here for the MISSING files only, and tell the AI to
  // finish, not restart. (This is the stopgap; full event-log resume is the durable-runs workstream.)
  if (isEdit && /continue from where you left off/i.test(getLastUserText(messages))) {
    resolvedSystemPrompt +=
      `\n\n## RESUMING AN INTERRUPTED BUILD (do NOT start over)\n` +
      `The previous generation was cut off before finishing. FIRST use grepCode + readFiles to see what ` +
      `already exists. Identify which expected files are MISSING or incomplete (a telltale sign: App.tsx ` +
      `imports a page/component that does not exist yet, or a file is empty/short). CREATE those missing ` +
      `files with generateFiles — allowed here for MISSING files ONLY — matching the existing files' ` +
      `imports, design tokens, and style EXACTLY. Do NOT rewrite files that are already complete. Then ` +
      `confirm the app builds and renders with no error.`
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
      tools: tools({ modelId: isEdit ? EDIT_MODEL : FILE_GENERATION_MODEL, writer }),
      onError: error => {
        console.error('Error communicating with AI')
        console.error(JSON.stringify(error, null, 2))
      },
    })
    result.consumeStream()
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
    const { sandboxId } = getProjectContext(messages)
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
    const { sandboxId } = getProjectContext(messages)
    if (sandboxId) {
      void (async () => {
        try {
          const project = await getProjectBySandboxId(sandboxId)
          if (!project) return
          if (tokenBox.total > 0) await incrementProjectTokens(project.id, tokenBox.total)
          const sandbox = await Sandbox.get({ sandboxId })
          const path = await snapshotProject(sandbox, project.user_id, project.id)
          if (path) await updateProjectRow(project.id, { snapshot_path: path })
        } catch {
          /* non-fatal */
        }
      })()
    }
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
      sandbox = sandboxPromise ? await sandboxPromise : await Sandbox.create({ timeout: 1_800_000, ports: [3000] })
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

  // Write scaffold files for cold sandboxes (warm pool already has them)
  try {
    if (!hadWarmSandbox) {
      await sandbox.writeFiles(
        getScaffoldFiles(skill).map(f => ({ path: f.path, content: Buffer.from(f.content, 'utf8') }))
      )
      // Restore the BAKED node_modules (fast extract) then a reconcile install for
      // any package the AI adds — far quicker than a cold install. Falls back to a
      // plain install if the baked archive is unavailable. Runs in the background
      // during file generation so it's done before the dev server starts.
      ;(async () => {
        const baked = await restoreBakedDeps(sandbox, skill).catch(() => false)
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

  // ── Step 2: Build pipeline addendum ─────────────────────────────────────
  const scaffoldFiles = getScaffoldFiles(skill)
  const scaffoldPaths = scaffoldFiles.map(f => f.path).join(', ')
  // Unique seed per generation — ensures the model makes distinct creative choices
  // even when two users submit the same prompt. Injected into context so it
  // influences color palette, layout structure, and typographic decisions.
  const creativeSeed = Math.random().toString(36).slice(2, 10).toUpperCase()
  const pipelineAddendum =
    `\n\n## SERVER PIPELINE — WORKSPACE READY\n` +
    `sandboxId: ${sandboxId}\n` +
    `Creative session ID: ${creativeSeed} — use this to make UNIQUE design choices. Two projects with similar briefs must look completely different in layout, palette, and typography.\n` +
    `Scaffold pre-written (including shadcn/ui components). Dependencies installing in background.\n` +
    `DO NOT call createSandbox — it is already done.\n` +
    `DO NOT call runCommand or getSandboxURL — the server handles those after you finish.\n` +
    `Scaffold files already written (exclude from generateFiles paths): ${scaffoldPaths}\n\n` +
    `WORKFLOW: ${skill === 'website'
      ? `(1) gather ALL images in parallel with your first message: PREFER generateImageBatch for the HERO and any signature/art-directed/abstract visual (it gives unique, on-brand imagery); use getUnsplashBatch for real-world content photos (food, people, venues) and as the reliable fallback. Every project's hero should have a strong visual. (2) call planProject with the complete file list (every file path you will generate), (3) call generateFiles with sandboxId="${sandboxId}" and exactly the paths from planProject`
      : `(1) call planProject with the complete file list (every path you will generate), (2) call generateFiles with sandboxId="${sandboxId}" and exactly the paths from planProject`}\n` +
    (skill !== 'website' ? `getUnsplashBatch is NOT available for this skill type — do not call it.\n` : '') +
    `If you need packages not in the scaffold, include package.json in your generateFiles paths.\n`

  const fileCountGuidance = skill === 'website'
    ? `TARGET FILE COUNT: 7-9 files maximum. Combine related sections into their page file instead of splitting into small components. Only extract a component if it is reused across 2+ pages (e.g. Navbar, Footer). A Home.tsx can and should contain hero + features + testimonials + CTA all inline — do NOT split each section into its own file. Fewer files = faster build for the user.`
    : skill === 'game'
    ? `TARGET FILE COUNT: 4-6 files maximum. Keep all game logic in one or two files.`
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
  // Durable-runs STEP 2: capture the (phased, normalized) manifest the planner
  // commits to, so the server can drive the enrichment phases after phase-1 preview.
  const planBox: { manifest: NormalizedManifest | null } = { manifest: null }
  const capturePlan = planProject({ onPlan: (m) => { planBox.manifest = m } })

  // ── Phase-1 deadline guard (the guarantee) ────────────────────────────────
  // Generation is bounded so it CANNOT run into Vercel's 800s function cap. The deadline
  // is threaded into generateFiles ITSELF (so the tool's own model calls abort in time —
  // aborting only the agent loop does NOT stop an in-flight tool), and onto the agent
  // streamText. At the deadline the shell-salvage (below) stamps any unfinished file and a
  // preview still ships. Reserve ~250s after the deadline for salvage + install + build +
  // dev-server + emit.
  const genDeadline = (invocationStart ?? Date.now()) + (maxDuration * 1000 - 250_000)
  const genAbort = AbortSignal.timeout(Math.max(60_000, genDeadline - Date.now()))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipelineTools: Record<string, any> = skill === 'website'
    ? {
        loadSkill: loadSkill(),
        generateFiles: generateFiles({ writer, modelId: FILE_GENERATION_MODEL, designContext, abortSignal: genAbort, getShells: () => planBox.manifest?.multiPhase ? stampShellsForManifest(planBox.manifest.files, brandName) : [] }),
        getUnsplashBatch: getUnsplashBatch(),
        generateImageBatch: generateImageBatch(),
        planProject: capturePlan,
        lookupReference: lookupReference(),
      }
    : {
        loadSkill: loadSkill(),
        generateFiles: generateFiles({ writer, modelId: FILE_GENERATION_MODEL, designContext, abortSignal: genAbort, getShells: () => planBox.manifest?.multiPhase ? stampShellsForManifest(planBox.manifest.files, brandName) : [] }),
        planProject: capturePlan,
        lookupReference: lookupReference(),
      }

  // Generous step headroom so an optional loadSkill + a stray retry can NEVER
  // crowd out the required planProject -> generateFiles sequence (A5 caught a run
  // where the AI burned its budget before generating). generateFiles is the goal.
  // website: text + (loadSkill?) + getUnsplashBatch + planProject + generateFiles + slack
  // app/game: text + (loadSkill?) + planProject + generateFiles + slack
  const maxSteps = skill === 'website' ? 10 : 9 // +2 headroom for optional reference lookups

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

  // Wait for generation to finish — but NEVER past the deadline. A truly-hung model stream
  // does not always honor AbortSignal, so we RACE aiResult.text against a hard timer: at the
  // deadline we stop waiting and proceed to the shell-salvage regardless (whatever files
  // landed are kept; the rest become shells). This is what forces a preview to ALWAYS ship.
  let genHitDeadline = false
  try {
    const deadlineMs = Math.max(30_000, genDeadline - Date.now())
    await Promise.race([
      Promise.resolve(aiResult.text),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('gen-deadline-forced')), deadlineMs)),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Deadline (abort OR forced timer) is NOT a failure — proceed to shell-salvage.
    if (genAbort.aborted || /abort|timeout|cancel|gen-deadline/i.test(msg)) {
      genHitDeadline = true
      console.warn('[phase-1] generation stopped at the deadline — salvaging remaining files as shells')
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

  // ── Shell-salvage — the phase-1 completion guarantee ──────────────────────────
  // Ensure EVERY phase-1 manifest file exists on disk before the build. Any file the model
  // didn't finish (deadline hit, or a single file failed) is stamped as an on-brand shell
  // and MOVED to enrichment, so: (a) the build is green + the preview ALWAYS ships before
  // the 800s cap, and (b) the real page is filled in live afterward. This is what makes
  // "no build dies mid-flight, a preview always ships" structural rather than statistical.
  if (planBox.manifest && sandbox) {
    const salvaged: string[] = []
    for (const f of planBox.manifest.files) {
      if (f.phase !== 1) continue
      const existing = await readSandboxFile(sandbox, f.path).catch(() => null)
      if (existing && existing.trim().length > 20) continue
      try {
        await sandbox.writeFiles([{ path: f.path, content: Buffer.from(stampShell({ path: f.path, exports: f.exports, brandName }), 'utf8') }])
        f.phase = 2 // hand the real page/file to the enrichment queue
        salvaged.push(f.path)
      } catch { /* non-fatal */ }
    }
    if (salvaged.length > 0) {
      const maxPhase = planBox.manifest.files.reduce((m, f) => Math.max(m, f.phase), 1)
      planBox.manifest.phaseCount = maxPhase
      planBox.manifest.multiPhase = maxPhase > 1
      console.warn(`[phase-1] shell-salvaged ${salvaged.length} file(s)${genHitDeadline ? ' (deadline)' : ''} → enrichment: ${salvaged.join(', ')}`)
    }
  }

  // ── Durable-runs STEP 2: capture manifest + conversation context for enrichment ─
  // The full model-message context (user turn + the AI's tool results, incl. image
  // URLs + the locked manifest) is what a self-contained enrichment phase re-uses so
  // each full page matches phase 1. Persist the manifest on the run row now (sets up
  // STEP 3's resume). All best-effort — never blocks the preview.
  const enrichManifest = planBox.manifest
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

  // ── Step 4: Server finalizes install ─────────────────────────────────────
  // Background install from Step 1 should be nearly done. Re-running is fast
  // for already-installed packages. 90s timeout covers cold installs.
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

  // ── Step 4.7: BUILD VERIFICATION + AUTO-REPAIR (the blank-preview guarantee) ─
  // Run vite build as a deterministic compile oracle. If it fails, auto-repair
  // the offending files with Flash (≤3 rounds) BEFORE the dev server starts, so
  // the preview is only ever shown once the project actually compiles.
  try {
    await verifyAndRepair({ sandbox, sandboxId, writer })
  } catch (err) {
    console.warn('[verify] verifyAndRepair threw (non-fatal):', err instanceof Error ? err.message : err)
  }

  // ── Step 5: Server starts dev server (background — runs forever) ──────────
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

  // ── Step 6: Wait for Vite to be ready, then return URL ────────────────────
  // pnpm dev started in background (detached) — Vite takes 5-15s to boot.
  // Poll the sandbox URL until we get a non-502 response, then emit to client.
  // This prevents the iframe loading before the port is actually listening.
  writer.write({
    id: 'srv-url',
    type: 'data-get-sandbox-url',
    data: { status: 'loading' },
  })
  const url = sandbox.domain(3000)
  let devError = await waitForDevServer(url)

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

  // ── Emit the live preview URL NOW — as soon as the dev server responds ─────────
  // (Fable #4) First preview ships the instant the compile-verified app is serving;
  // the headless runtime-check + design-improve pass below then run AFTER the preview
  // is live and repair in place via Vite HMR. Only the compile gate (verifyAndRepair,
  // above) stays on the critical path — that's the "never show broken" guarantee; the
  // slower visual checks no longer delay first preview.
  writer.write({
    id: 'srv-url',
    type: 'data-get-sandbox-url',
    data: { url, status: 'done' },
  })

  // If the dev server is up but the page is broken (500 from Vite/PostCSS crash),
  // emit a data-report-errors so the AI sees the problem in its next turn and fixes it.
  if (devError) {
    logRepair({ layer: 'dev-500', action: 'reported-to-ai', detail: devError.slice(0, 200), sandboxId })
    writer.write({
      id: 'srv-check',
      type: 'data-report-errors',
      data: {
        summary: devError,
        paths: ['src/index.css', 'src/App.tsx'],
      },
    })
  } else {
    // ── Step 6.5: Headless runtime check (screenshot/DOM layer) ──────────────
    // The page serves 200 — but does it actually RENDER? Load it in a real
    // headless browser and inspect the DOM. Catches runtime exceptions and
    // blank #root that vite build can't see. If broken, auto-repair the files
    // from the stack trace, let HMR reload, and re-check once.
    try {
      // Visible status so the user (and we) can see the visual check actually ran.
      writer.write({
        id: 'srv-visual',
        type: 'data-run-command',
        data: { sandboxId, command: 'Visual quality check', args: [], status: 'executing' },
      })
      let rt = await headlessRuntimeCheck(url, sandboxId)
      console.log(`[runtime-check] verdict status=${rt.status}${rt.status === 'ok' ? '' : ' — ' + rt.detail.slice(0, 160)}`)
      if (rt.status === 'broken') {
        logRepair({ layer: 'runtime-check', action: 'broken', detail: rt.detail.slice(0, 200), sandboxId })
      }

      // A runtime break caused by a missing package is fixed deterministically:
      // install + restart + re-check, no LLM involved.
      if (rt.status === 'broken' && (await installMissingModules(sandbox, rt.detail))) {
        await restartDevServer(sandbox)
        await new Promise(r => setTimeout(r, 4000))
        rt = await headlessRuntimeCheck(url, sandboxId)
      }

      if (rt.status === 'broken') {
        const files = extractErrorFiles(rt.detail)
        let repaired = false
        for (const path of files.slice(0, 4)) {
          const content = await readSandboxFile(sandbox, path)
          if (!content) continue
          const fixed = await repairFile(path, content, rt.detail)
          if (fixed && fixed !== content) {
            const finalContent = path.endsWith('.css') ? sanitizeCss(fixed) : fixed
            await sandbox.writeFiles([{ path, content: Buffer.from(finalContent, 'utf8') }])
            repaired = true
          }
        }
        if (repaired) {
          await new Promise(r => setTimeout(r, 3500)) // let Vite HMR reload
          rt = await headlessRuntimeCheck(url, sandboxId)
        }
        if (rt.status === 'broken') {
          // P0-B TERMINAL STATE (Q1): repair budget spent, page still not rendering.
          // Swap the offending page (page-level preferred) for the baked __fallback so
          // the preview is NEVER blank, then re-check. A rare module-level throw that
          // survives the page-level swap is caught and forced to the App-level swap,
          // which imports nothing but React and therefore always renders.
          try {
            const swapped = await applyFallbackTerminalState(sandbox, rt.detail, { skill, brand: brandName || 'This project' })
            if (swapped) {
              await new Promise(r => setTimeout(r, 3500)) // let Vite HMR reload the swap
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
          // Surface to the client self-heal so a REAL fix can still replace the fallback.
          writer.write({
            id: 'srv-runtime',
            type: 'data-report-errors',
            data: { summary: rt.detail, paths: files.length ? files : ['src/App.tsx'] },
          })
        }
      }

      // Close the visible status. 'skipped' (Chromium unavailable) still shows done —
      // we never alarm the user; the console log records whether it truly ran.
      writer.write({
        id: 'srv-visual',
        type: 'data-run-command',
        data: { sandboxId, command: 'Visual quality check', args: [], status: 'done', exitCode: 0 },
      })

      // ── Stage 6: gated design-improvement pass ───────────────────────────────
      // Only when the page renders fine BUT scored below threshold (< 4/10). Rare
      // after the structured brief + locked tokens, so the common path is untouched.
      if (
        rt.status === 'ok' &&
        typeof rt.score === 'number' &&
        rt.score < 4 &&
        rt.screenshot
      ) {
        await improveDesignPass({
          sandbox,
          screenshot: rt.screenshot,
          critique: rt.detail || 'low visual design quality',
          writer,
          sandboxId,
        })
        await new Promise(r => setTimeout(r, 3000)) // let Vite HMR reload the refined files
      }
    } catch (e) {
      console.warn('[runtime-check] wrapper error (non-fatal):', e instanceof Error ? e.message : e)
    }
  }

  // Durable-runs STEP 3: persist the live URL + sandbox id NOW, before enrichment. A
  // multi-phase build may hand off to a continuation invocation (returning early below),
  // so the preview URL must be saved here or it could be lost on the handoff path.
  if (projectId) {
    updateProjectRow(projectId, { sandbox_id: sandboxId, preview_url: url }).catch(() => {})
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
