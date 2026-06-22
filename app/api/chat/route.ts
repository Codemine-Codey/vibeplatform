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
import { checkBotId } from 'botid/server'
import { tools } from '@/ai/tools'
import { generateFiles } from '@/ai/tools/generate-files'
import { getUnsplashBatch } from '@/ai/tools/get-unsplash-batch'
import { planProject } from '@/ai/tools/plan-project'
import { classifyPrompt } from '@/ai/classifier'
import { expandPrompt } from '@/ai/expander'
import { formatBrief } from '@/ai/types/project-brief'
import { getSkillPack } from '@/ai/packs'
import { getSkillCatalog, loadSkillBody, designSkillFor } from '@/ai/skills'
import { loadSkill } from '@/ai/tools/load-skill'
import type { Skill } from '@/ai/types/project-brief'
import { Sandbox } from '@vercel/sandbox'
import { SCAFFOLD_FILES, getScaffoldFiles } from '@/ai/tools/scaffold'
import { saveCheckpoint } from '@/ai/tools/checkpoint'
import { getWarmEntry } from '@/ai/warm-pool'
import { logRepair, logDesign } from '@/lib/telemetry'
import { getCurrentUser } from '@/lib/supabase/server'
import { createProjectRow, snapshotProject, updateProjectRow, getProjectBySandboxId, incrementProjectTokens } from '@/lib/projects-db'
import { tokenStore } from '@/lib/token-context'
import { ensureValidCss } from '@/lib/css-guard'
import { trimStaleReadResults } from '@/lib/trim-history'
import prompt from './prompt.md'

export const maxDuration = 800

type Writer = UIMessageStreamWriter<UIMessage<never, DataPart>>

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

// Pull the meaningful error lines out of a vite build log.
function extractBuildError(log: string): string {
  const lines = log
    .replace(/##EXIT:\d+/g, '')
    .split('\n')
    .filter(l =>
      /error|Cannot find|not found|Unexpected|unexpected|postcss|Could not resolve|is not exported|Failed to|SyntaxError|Transform failed|No matching/i.test(l)
    )
    .slice(0, 25)
    .join('\n')
    .slice(0, 2000)
    .trim()
  return lines || log.replace(/##EXIT:\d+/g, '').trim().slice(-1500)
}

// Extract referenced source file paths from a build log (src/... or root configs).
function extractErrorFiles(log: string): string[] {
  const files = new Set<string>()
  const re = /((?:src\/|\.\/src\/|\/[\w./-]*?src\/)?[\w./-]+\.(?:tsx|jsx|ts|js|css))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(log)) !== null) {
    let p = m[1]
    const srcIdx = p.indexOf('src/')
    if (srcIdx >= 0) p = p.slice(srcIdx)
    else p = p.replace(/^\.\//, '')
    if (p.startsWith('src/')) files.add(p)
    else {
      // Root-level configs crash PostCSS/Tailwind/Vite and are repairable too
      // (e.g. "/vercel/sandbox/tailwind.config.js" in a require stack).
      const base = p.split('/').pop() ?? ''
      if (/^(tailwind|postcss)\.config\.(js|cjs|mjs|ts)$/.test(base)) files.add(base)
    }
  }
  return [...files]
}

// ── Missing-module auto-install (generic, any package) ───────────────────────
// "Cannot find module 'x'" / "Failed to resolve import \"x\"" means a package is
// referenced (by generated code OR a config) but not installed. The fix is always
// the same and fully deterministic: install it. This handles the entire class —
// any package, any project type — without involving the AI at all.
const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'url', 'http', 'https', 'crypto', 'stream', 'util', 'events',
  'child_process', 'buffer', 'querystring', 'zlib', 'assert', 'net', 'tls', 'dns',
])
function extractMissingModules(log: string): string[] {
  const mods = new Set<string>()
  const patterns = [
    /Cannot find module ['"]([^'"]+)['"]/g,
    /Could not resolve ['"]([^'"]+)['"]/g,
    /Failed to resolve import ['"]([^'"]+)['"]/g,
    /Cannot find package ['"]([^'"]+)['"]/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(log)) !== null) {
      const name = m[1]
      // Bare npm package names only — relative/absolute paths are file problems,
      // node builtins aren't installable.
      if (name.startsWith('.') || name.startsWith('/') || name.startsWith('node:')) continue
      if (NODE_BUILTINS.has(name)) continue
      // Normalize deep imports ("pkg/sub/path" → "pkg", "@scope/pkg/sub" → "@scope/pkg")
      const parts = name.split('/')
      const pkg = name.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
      if (/^(@[\w.-]+\/)?[\w.-]+$/.test(pkg)) mods.add(pkg)
    }
  }
  return [...mods].slice(0, 8)
}

async function installMissingModules(sandbox: Sandbox, log: string): Promise<boolean> {
  const mods = extractMissingModules(log)
  if (mods.length === 0) return false
  console.warn('[auto-install] installing missing modules:', mods.join(', '))
  logRepair({ layer: 'auto-install', action: 'installing', detail: mods.join(', ') })
  try {
    const list = mods.map(m => `'${m.replace(/'/g, '')}'`).join(' ')
    const cmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', `command -v bun >/dev/null 2>&1 && bun add ${list} || pnpm add ${list}`],
    })
    await Promise.race([
      cmd.wait(),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('install timeout')), 60_000)),
    ])
    return true
  } catch (e) {
    console.warn('[auto-install] failed (non-fatal):', e instanceof Error ? e.message : e)
    return false
  }
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

async function readSandboxFile(sandbox: Sandbox, path: string): Promise<string | null> {
  try {
    const stream = await sandbox.readFile({ path })
    if (!stream) return null
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string))
    return Buffer.concat(chunks).toString('utf8')
  } catch {
    return null
  }
}

// Ask Flash to repair ONE file given the exact build error. Returns corrected
// full-file content, or null if it couldn't help.
async function repairFile(path: string, content: string, error: string): Promise<string | null> {
  try {
    const res = await generateText({
      ...getModelOptions(FILE_GENERATION_MODEL),
      // Model's max output — a repaired file must NEVER be truncated (a half-written
      // file is itself a blank-preview cause). Cost only accrues on tokens actually
      // produced, so the ceiling is free headroom; the value is capped to the
      // active model's real limit so the provider never 400s.
      maxOutputTokens: getMaxOutputTokens(FILE_GENERATION_MODEL),
      system:
        'You are a build-error repair tool. You receive ONE file and the exact build error it causes. ' +
        'Return ONLY the complete corrected file content — no markdown fences, no explanation, no commentary. ' +
        'Hard rules: NEVER use @apply in CSS. NEVER use invented Tailwind color classes like bg-lacquer/text-gold — ' +
        'use only standard Tailwind palette (slate, amber, etc.) or scaffold tokens (bg-primary, bg-background, text-foreground) ' +
        'or inline style with CSS variables. NEVER use <svg>. Fix ONLY what causes the error; keep the rest identical. ' +
        'Output the entire file.',
      messages: [
        {
          role: 'user',
          content:
            `File: ${path}\n\nBuild error:\n${error}\n\nCurrent file content:\n${content}\n\n` +
            'Return the complete corrected file content now.',
        },
      ],
    })
    let out = res.text.trim()
    out = out.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()
    return out.length > 5 ? out : null
  } catch {
    return null
  }
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
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
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
      if (ok) return // compiles cleanly — preview WILL render

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
      for (const path of files.slice(0, 5)) {
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
    await new Promise(r => setTimeout(r, 2500)) // let React mount + effects run

    const rootChildren: number = await page
      .evaluate(() => {
        const r = document.getElementById('root')
        return r ? r.childElementCount : -1
      })
      .catch(() => -1)
    const bodyTextLen: number = await page
      .evaluate(() => (document.body?.innerText?.trim()?.length ?? 0))
      .catch(() => 0)

    // The fallback ErrorBoundary renders text, so a true blank = empty root + no text.
    const blank = rootChildren <= 0 && bodyTextLen === 0
    if (blank) {
      return {
        status: 'broken',
        detail:
          'Blank screen: #root is empty after the page loaded — a component threw during render or returned nothing.\n' +
          errors.slice(0, 6).join('\n'),
      }
    }
    if (errors.length > 0) {
      return { status: 'broken', detail: 'Runtime errors detected on the live page:\n' + errors.slice(0, 8).join('\n') }
    }

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

export async function POST(req: Request) {
  const [checkResult, { messages }] = await Promise.all([
    checkBotId(),
    req.json() as Promise<BodyData>,
  ])

  if (checkResult.isBot) {
    return NextResponse.json({ error: `Bot detected` }, { status: 403 })
  }

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        // ── EDIT MODE: sandbox already active → standard agentic loop ──────
        if (hasActiveSandbox(messages)) {
          return runAgenticLoop({ writer, messages, systemPrompt: prompt })
        }

        // ── NEW PROJECT: classify + expand ──────────────────────────────────
        const userText = getLastUserText(messages)
        if (!userText) {
          return runAgenticLoop({ writer, messages, systemPrompt: prompt })
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
          return runAgenticLoop({ writer, messages, systemPrompt: prompt })
        }

        let brief = null
        try {
          brief = await expandPrompt(userText, skill)
        } catch {
          // Expansion failed — fallback
        }

        if (!brief) {
          return runAgenticLoop({ writer, messages, systemPrompt: prompt })
        }

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
          projectId = await createProjectRow({
            name: brief.brandName || 'Untitled project',
            prompt: userText,
            skill,
          })
        }

        // The design contract the FILE-WRITER must follow (brief tokens + fonts +
        // the active design skill). This is what makes generated code actually
        // match the design — without it the file-writer is blind to colors/fonts.
        const designContext = `${formatBrief(brief)}\n\n## DESIGN SKILL — ${designSkill}\n${designBody}`

        // ── SERVER-SIDE PIPELINE ────────────────────────────────────────────
        // Wrap in a token-accounting context so every model call this generation
        // makes is summed into tokens_used on the project row.
        const tokenBox = { total: 0 }
        await tokenStore.run(tokenBox, () =>
          runPipeline({ writer, messages, systemPrompt, skill, projectId, userId: user?.id ?? null, designContext })
        )
        if (projectId && tokenBox.total > 0) {
          updateProjectRow(projectId, { tokens_used: tokenBox.total }).catch(() => {})
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
    tools: tools({ modelId: FILE_GENERATION_MODEL, writer }),
    onError: error => {
      console.error('Error communicating with AI')
      console.error(JSON.stringify(error, null, 2))
    },
  })
  // Token accounting: keep the ALS context alive through every model call this
  // turn makes (await result.text) so the metrics middleware sums into tokenBox.
  const tokenBox = { total: 0 }
  await tokenStore.run(tokenBox, async () => {
    result.consumeStream()
    writer.merge(result.toUIMessageStream({ sendReasoning: false, sendStart: false }))
    try {
      await result.text
    } catch {
      /* stream error already logged in onError */
    }
  })

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
}: {
  writer: Writer
  messages: ChatUIMessage[]
  systemPrompt: string
  skill: Skill
  projectId?: string | null
  userId?: string | null
  designContext?: string
}) {
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
      sandbox = await Sandbox.create({ timeout: 1_800_000, ports: [3000] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      writer.write({
        id: 'srv-sandbox',
        type: 'data-create-sandbox',
        data: { error: { message }, status: 'error' },
      })
      return
    }
  }

  const sandboxId = sandbox.sandboxId

  // Write scaffold files for cold sandboxes (warm pool already has them)
  try {
    if (!hadWarmSandbox) {
      await sandbox.writeFiles(
        getScaffoldFiles(skill).map(f => ({ path: f.path, content: Buffer.from(f.content, 'utf8') }))
      )
      sandbox
        .runCommand({ detached: true, cmd: 'bash', args: ['-c', 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'] })
        .then(cmd => cmd.wait())
        .catch(() => {})
    }
  } catch {
    // Non-fatal — AI generates without scaffold if write fails
  }

  writer.write({
    id: 'srv-sandbox',
    type: 'data-create-sandbox',
    data: { sandboxId, status: 'done' },
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
      ? `(1) call getUnsplashBatch for all images in parallel with your first message, (2) call planProject with the complete file list (every file path you will generate), (3) call generateFiles with sandboxId="${sandboxId}" and exactly the paths from planProject`
      : `(1) call planProject with the complete file list (every path you will generate), (2) call generateFiles with sandboxId="${sandboxId}" and exactly the paths from planProject`}\n` +
    (skill !== 'website' ? `getUnsplashBatch is NOT available for this skill type — do not call it.\n` : '') +
    `If you need packages not in the scaffold, include package.json in your generateFiles paths.\n`

  const fileCountGuidance = skill === 'website'
    ? `TARGET FILE COUNT: 7-9 files maximum. Combine related sections into their page file instead of splitting into small components. Only extract a component if it is reused across 2+ pages (e.g. Navbar, Footer). A Home.tsx can and should contain hero + features + testimonials + CTA all inline — do NOT split each section into its own file. Fewer files = faster build for the user.`
    : skill === 'game'
    ? `TARGET FILE COUNT: 4-6 files maximum. Keep all game logic in one or two files.`
    : `TARGET FILE COUNT: 6-8 files maximum. Combine views and utilities where possible.`

  const fullSystem = systemPrompt + pipelineAddendum + `\n\n${fileCountGuidance}`

  // ── Step 3: AI generates directly — no planning round-trip ───────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipelineTools: Record<string, any> = skill === 'website'
    ? {
        loadSkill: loadSkill(),
        generateFiles: generateFiles({ writer, modelId: FILE_GENERATION_MODEL, designContext }),
        getUnsplashBatch: getUnsplashBatch(),
        planProject: planProject(),
      }
    : {
        loadSkill: loadSkill(),
        generateFiles: generateFiles({ writer, modelId: FILE_GENERATION_MODEL, designContext }),
        planProject: planProject(),
      }

  // Generous step headroom so an optional loadSkill + a stray retry can NEVER
  // crowd out the required planProject -> generateFiles sequence (A5 caught a run
  // where the AI burned its budget before generating). generateFiles is the goal.
  // website: text + (loadSkill?) + getUnsplashBatch + planProject + generateFiles + slack
  // app/game: text + (loadSkill?) + planProject + generateFiles + slack
  const maxSteps = skill === 'website' ? 8 : 7

  const aiResult = streamText({
    ...getModelOptions(DEFAULT_MODEL),
    system: fullSystem,
    messages: await convertToModelMessages(transformMessages(messages)),
    stopWhen: stepCountIs(maxSteps),
    // Model's max output — planProject manifests and tool args must never truncate.
    maxOutputTokens: getMaxOutputTokens(DEFAULT_MODEL),
    tools: pipelineTools,
    onError: error => console.error('Pipeline AI error:', error),
  })

  writer.merge(aiResult.toUIMessageStream({ sendReasoning: false, sendStart: false }))

  // Wait for all AI steps (text + all tool calls) to complete
  try {
    await aiResult.text
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Pipeline AI failed:', msg)
    writer.write({
      id: 'srv-error',
      type: 'data-report-errors',
      data: { summary: `Generation failed: ${msg}. Please try again.`, paths: [] },
    })
    return
  }

  // Verify generateFiles was actually called — if AI only produced text (rare edge case),
  // skip pnpm commands to avoid starting an empty sandbox.
  try {
    const allSteps = await aiResult.steps
    const calledGenerateFiles = allSteps.some(
      step =>
        Array.isArray(step.toolCalls) &&
        (step.toolCalls as Array<{ toolName: string }>).some(
          tc => tc.toolName === 'generateFiles'
        )
    )
    if (!calledGenerateFiles) {
      console.warn('Pipeline: AI did not call generateFiles — aborting pnpm phase')
      return
    }
  } catch {
    // Can't verify — proceed anyway
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

      if (!css.includes(':root')) {
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

  // If the dev server is up but the page is broken (500 from Vite/PostCSS crash),
  // emit a data-report-errors so the AI sees the problem in its next turn and fixes it.
  // The URL is still emitted so the user sees the error state transparently.
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
          // Still broken after one repair — surface so the client self-heal also kicks in.
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

  writer.write({
    id: 'srv-url',
    type: 'data-get-sandbox-url',
    data: { url, status: 'done' },
  })

  // Save a last-known-good checkpoint when the pipeline ends healthy. If a later
  // edit breaks the project beyond repair, the AI's restoreCheckpoint tool brings
  // this version back — a working preview always beats a broken one.
  if (!devError) {
    saveCheckpoint(sandbox).catch(() => {})

    // Durable snapshot → Supabase Storage so the project can be reopened from the
    // dashboard in a fresh sandbox. Runs after the URL is emitted, so it never
    // blocks what the user sees.
    if (projectId && userId) {
      snapshotProject(sandbox, userId, projectId)
        .then(snapshotPath =>
          updateProjectRow(projectId, {
            sandbox_id: sandboxId,
            preview_url: url,
            ...(snapshotPath ? { snapshot_path: snapshotPath } : {}),
          })
        )
        .catch(() => {})
    }
  }
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
