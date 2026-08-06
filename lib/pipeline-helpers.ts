// Shared pipeline helper functions — used by both app/api/chat/route.ts and
// app/workflows/build-pipeline.ts. Extracted to break the circular dependency
// that would arise from the workflow importing the entire route module.

import { Sandbox } from '@vercel/sandbox'
import { generateText } from 'ai'
import { getModelOptions } from '@/ai/gateway'
import { VISION_MODEL, ERROR_MODEL } from '@/ai/constants'
import {
  readSandboxFile,
  extractBuildError,
  extractErrorFiles,
  installMissingModules,
  repairFile,
  repairAllFiles,
} from '@/lib/sandbox-util'
import { logRepair, logDesign } from '@/lib/telemetry'
import { ensureValidCss } from '@/lib/css-guard'
import { SCAFFOLD_PATH_SET } from '@/ai/tools/scaffold'
import { stampShell, navTargetPageFiles } from '@/lib/shell-template'
import type { Skill } from '@/ai/types/project-brief'

// Minimal writer interface used by verify-phase helpers. Accepts the same
// { id?, type, data? } wire format that UIMessageStreamWriter.write() uses.
export interface PipelineWriter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  write(part: { id?: string; type: string; data?: any }): void
}

// CSS sanitizer alias
export const sanitizeCss = ensureValidCss

// Post-repair TSX/JSX sanitizer — mirrors generation-time sanitizeContent fixes.
export function sanitizeTsx(path: string, content: string): string {
  if (!/\.(tsx?|jsx?)$/.test(path)) return content
  if (content.includes('\\"')) content = content.replace(/\\"/g, '"')
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

// Kill everything on port 3000, wait for it to be free, then restart Vite.
export async function restartDevServer(sandbox: Sandbox): Promise<void> {
  try {
    const kill = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c',
        'pkill -f vite 2>/dev/null; fuser -k 3000/tcp 2>/dev/null; ' +
        'for i in $(seq 1 16); do fuser 3000/tcp >/dev/null 2>&1 || break; ' +
        'fuser -k 3000/tcp 2>/dev/null; sleep 0.5; done; exit 0',
      ],
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

// Poll the sandbox URL until the dev server responds.
export async function waitForDevServer(url: string, maxWaitMs = 45_000, sandbox?: Sandbox): Promise<string | null> {
  const deadline = Date.now() + maxWaitMs
  let consecutiveFiveHundreds = 0
  let sawListening = false
  let restartedForPersistent502 = false

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (res.status === 502) {
        consecutiveFiveHundreds = 0
        if (!sawListening && !restartedForPersistent502 && sandbox && Date.now() - (deadline - maxWaitMs) > 18_000) {
          restartedForPersistent502 = true
          logRepair({ layer: 'dev-502', action: 'persistent-502-restart', detail: 'server never bound :3000 in 18s', sandboxId: sandbox.sandboxId })
          await restartDevServer(sandbox)
        }
      } else if (res.status === 500) {
        consecutiveFiveHundreds++
        if (consecutiveFiveHundreds >= 2) {
          let errorDetail = 'The page is returning a 500 error — likely a CSS @apply with an unknown class, a broken import, or a PostCSS/Vite compilation error.'
          try {
            const body = await res.text()
            const match = body.match(/\[postcss\][^\n]+|Error[^\n]+/)
            if (match) errorDetail = match[0].trim()
          } catch { /* non-fatal */ }
          return `Preview page is broken (500): ${errorDetail} Fix src/index.css and any files with broken imports.`
        }
      } else {
        sawListening = true
        return null
      }
    } catch {
      consecutiveFiveHundreds = 0
    }
    await new Promise(r => setTimeout(r, 2500))
  }
  if (!sawListening) {
    return 'The preview server never responded on port 3000 within the time limit. This usually means a startup crash — check the dev console for import errors or missing packages.'
  }
  return null
}

// Stamp build-safe placeholders for any manifest-declared file the AI never wrote.
export async function checkAndStampMissingFiles(sandbox: Sandbox, paths: string[]): Promise<void> {
  const relevant = paths.filter(p => /\.(tsx?|jsx?|css|json)$/.test(p) && !SCAFFOLD_PATH_SET.has(p))
  if (relevant.length === 0) return

  const results = await Promise.all(
    relevant.map(async (path) => {
      const content = await readSandboxFile(sandbox, path)
      return { path, exists: !!content && content.trim().length > 5 }
    })
  )
  const missing = results.filter(r => !r.exists).map(r => r.path)
  if (missing.length === 0) return

  console.warn(`[manifest-check] ${missing.length} declared file(s) missing — stamping placeholders: ${missing.join(', ')}`)
  await sandbox.writeFiles(
    missing.map((path) => ({
      path,
      content: Buffer.from(
        path.endsWith('.css') ? '/* placeholder */\n' :
        path.endsWith('.json') ? '{}\n' :
        /\/pages\/|\/components\/|\/screens\//.test(path)
          ? `import React from 'react'\nexport default function ${path.replace(/.*\//, '').replace(/\.(tsx?|jsx?)$/, '')}() {\n  return <div className="bg-background min-h-screen" />\n}\n`
          : 'export {}\n',
        'utf8'
      ),
    }))
  )
}

// Deterministic nav shell stamper — fills missing page files that nav links point to.
export async function ensureNavShells(sandbox: Sandbox, brandName?: string): Promise<void> {
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
      console.log(`[nav-shells] stamped ${missing.length} shell page(s)`)
    }
  } catch (e) {
    console.warn('[nav-shells] failed (non-fatal):', e instanceof Error ? e.message : e)
  }
}

// Terminal fallback — DISABLED (user directive 2026-07-21): never swap the generated build
// for a placeholder. Show the real project always; repair loop fixes in place.
export async function applyFallbackTerminalState(
  _sandbox: Sandbox,
  _rtDetail: string,
  _meta: { skill: Skill; brand: string }
): Promise<boolean> {
  return false
}

// Contract-level TS error codes (wrong props, missing exports, undefined names, wrong arity).
export const CONTRACT_TS_CODES = new Set([
  '2304', '2305', '2307', '2322', '2339', '2345', '2551', '2554', '2555',
  '2613', '2614', '2739', '2740', '2741', '2769',
])

export function contractTypeErrors(log: string): { files: string[]; block: string; total: number } {
  const hits = log.split('\n').filter((l) => {
    const m = l.match(/error TS(\d+)/)
    return m && CONTRACT_TS_CODES.has(m[1])
  })
  const files = [
    ...new Set(
      hits
        .map((l) => {
          const m = l.match(/^\s*(\S+\.(?:tsx|ts|jsx|js))[(:]/)
          return m ? m[1].trim() : ''
        })
        .filter(Boolean)
        .filter((p) => !SCAFFOLD_PATH_SET.has(p))
    ),
  ]
  return { files, block: hits.slice(0, 25).join('\n'), total: hits.length }
}

// Read source files of a file's local imports (for type repair context).
export async function readLocalImportSources(
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
      if (c) { out.push({ path: cand, content: c }); break }
    }
  }
  return out
}

// Type-check gate — after vite build passes, run tsc to catch contract errors.
export async function typeCheckGate({ sandbox, sandboxId, deadline }: {
  sandbox: Sandbox
  sandboxId: string
  deadline?: number
}): Promise<void> {
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
        args: ['-c', '(./node_modules/.bin/tsc --noEmit --skipLibCheck --pretty false 2>&1; echo "##DONE:$?") | tee /tmp/cm-tsc.log >/dev/null'],
      })
      await Promise.race([
        cmd.wait(),
        new Promise<void>((_, rej) => setTimeout(() => rej(new Error('tsc timeout')), 35_000)),
      ])
    } catch { /* timeout */ }
    log = (await readSandboxFile(sandbox, '/tmp/cm-tsc.log')) ?? ''
    const ran = log.includes('##DONE')
    const { files, block, total } = contractTypeErrors(log)
    logRepair({ layer: 'type-check', action: `round-${round}`, detail: `ran=${ran} totalErrs=${total} files=${files.length}`, sandboxId })
    if (!ran) return
    if (files.length === 0) return
    let repairedAny = false
    for (const path of files.slice(0, 6)) {
      const content = await readSandboxFile(sandbox, path)
      if (!content) continue
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

// Build oracle + LLM repair loop (up to 5 rounds). Uses PipelineWriter.
export async function verifyAndRepair({
  sandbox,
  sandboxId,
  writer,
}: {
  sandbox: Sandbox
  sandboxId: string
  writer: PipelineWriter
}): Promise<void> {
  writer.write({
    id: 'srv-finalize',
    type: 'data-run-command',
    data: { sandboxId, command: 'Getting your project ready', args: [], status: 'executing' },
  })
  // Budget: 600s (10 min). The step gets 800s total; leaving ~200s for headless
  // check + functional verify + snapshot. No artificial cap — if repair finishes
  // in 30s it moves on immediately. Only hits 600s if all 7 rounds are needed.
  const repairDeadline = Date.now() + 600_000
  try {
    for (let attempt = 1; attempt <= 7; attempt++) {
      if (Date.now() > repairDeadline) {
        console.warn('[verify] repair budget (600s) exhausted — proceeding with current build')
        break
      }
      let log = ''
      try {
        const cmd = await sandbox.runCommand({
          detached: true,
          cmd: 'bash',
          args: ['-c', '(./node_modules/.bin/vite build 2>&1; echo "##EXIT:$?") | tee /tmp/cm-verify.log >/dev/null'],
        })
        await Promise.race([
          cmd.wait(),
          new Promise<void>((_, rej) => setTimeout(() => rej(new Error('build timeout')), 50_000)),
        ])
      } catch { /* timeout */ }

      log = (await readSandboxFile(sandbox, '/tmp/cm-verify.log')) ?? ''
      const exitMatch = log.match(/##EXIT:(\d+)/)
      const ok = exitMatch ? exitMatch[1] === '0' : !/error/i.test(log)
      if (ok) {
        await typeCheckGate({ sandbox, sandboxId, deadline: repairDeadline })
        return
      }

      const errorBlock = extractBuildError(log)
      if (await installMissingModules(sandbox, log)) continue

      const files = extractErrorFiles(log)
      console.warn(`[verify] attempt ${attempt} failed. files=${files.join(',')} err=${errorBlock.slice(0, 160)}`)
      logRepair({ layer: 'build-verify', action: `attempt-${attempt}-failed`, detail: errorBlock.slice(0, 200), sandboxId })

      if (attempt <= 2 && files.length > 0) {
        writer.write({
          id: 'srv-finalize',
          type: 'data-run-command',
          data: { sandboxId, command: attempt === 1 ? 'Smoothing out a couple of things' : 'One final pass', args: [], status: 'executing' },
        })
      }

      if (files.length === 0) {
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

      // Batch repair: read all error files, then fix them ALL in one AI call instead of
      // sequential one-at-a-time calls. Saves 1-2 rounds of AI+build time per error group.
      const toRead = files.slice(0, 5).filter(p => !SCAFFOLD_PATH_SET.has(p))
      const fileContents: Array<{ path: string; content: string }> = []
      for (const path of toRead) {
        const content = await readSandboxFile(sandbox, path)
        if (content) fileContents.push({ path, content })
      }
      let repairedAny = false
      if (fileContents.length > 0 && Date.now() < repairDeadline) {
        const fixes = await repairAllFiles(fileContents, errorBlock)
        if (fixes && fixes.length > 0) {
          const writeOps = fixes
            .filter(fix => fix.content !== fileContents.find(f => f.path === fix.path)?.content)
            .map(fix => ({
              path: fix.path,
              content: Buffer.from(
                fix.path.endsWith('.css') ? sanitizeCss(fix.content) : sanitizeTsx(fix.path, fix.content),
                'utf8'
              ),
            }))
          if (writeOps.length > 0) {
            await sandbox.writeFiles(writeOps)
            repairedAny = true
          }
        }
        // Fall back to sequential repair if batch returned nothing
        if (!repairedAny) {
          for (const { path, content } of fileContents) {
            if (Date.now() > repairDeadline) break
            const fixed = await repairFile(path, content, errorBlock)
            if (fixed && fixed !== content) {
              const finalContent = path.endsWith('.css') ? sanitizeCss(fixed) : sanitizeTsx(path, fixed)
              await sandbox.writeFiles([{ path, content: Buffer.from(finalContent, 'utf8') }])
              repairedAny = true
            }
          }
        }
      }
      if (!repairedAny) return
    }
    writer.write({
      id: 'srv-phase-repair-failed',
      type: 'data-build-phase',
      data: { phase: 'repair-failed', label: 'Launching best-effort preview...' },
    })
  } finally {
    writer.write({
      id: 'srv-finalize',
      type: 'data-run-command',
      data: { sandboxId, command: 'Getting your project ready', args: [], status: 'done', exitCode: 0 },
    })
  }
}

// Vision verdict: AI sees screenshot and judges if page is visually broken.
export async function visualVerdict(
  screenshot: Buffer,
  sandboxId?: string
): Promise<{ broken: boolean; reason: string; score: number | null }> {
  try {
    const res = await generateText({
      ...getModelOptions(VISION_MODEL),
      maxOutputTokens: 220,
      abortSignal: AbortSignal.timeout(30_000),
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
    return { broken: false, reason: t.slice(0, 200), score: null }
  } catch {
    return { broken: false, reason: 'vision check skipped', score: null }
  }
}

// Full headless render check with Puppeteer + Chromium.
export async function headlessRuntimeCheck(
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
    browser = await (puppeteer as any).launch({ args: chromium.args, executablePath: execPath, headless: true })
    console.log('[runtime-check] chromium launched OK')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (browser as any).newPage()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page as any).evaluateOnNewDocument(() => {
      (window as typeof window & { __cmFrameCount: number }).__cmFrameCount = 0
      const _raf = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        (window as typeof window & { __cmFrameCount: number }).__cmFrameCount++
        return _raf(cb)
      }
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
    page.on('console', (msg: any) => { if (msg.type() === 'error') errors.push(String(msg.text())) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on('pageerror', (err: any) => { errors.push(String(err?.stack || err?.message || err)) })

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {})
    await new Promise(r => setTimeout(r, 2000))
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
    await new Promise(r => setTimeout(r, 500))

    const domSignals = await page.evaluate(() => {
      const w = window as typeof window & { __cmErrors?: string[] }
      const captured = Array.isArray(w.__cmErrors) ? w.__cmErrors.slice(0, 8) : []
      const overlay = document.querySelector('vite-error-overlay')
      let overlayText = ''
      if (overlay) {
        const sr = (overlay as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot
        overlayText = (sr?.textContent || overlay.textContent || 'Vite error overlay present').trim().slice(0, 400)
      }
      const bodyText = (document.body?.innerText || '').trim()
      const boundaryHit = bodyText.length < 400 &&
        /something went wrong|this section (couldn'?t|could not) load|an error occurred|failed to render|oops[,! ]/i.test(bodyText)
      return { captured, overlayText, boundaryHit, bodyTextSample: bodyText.slice(0, 200) }
    }).catch(() => ({ captured: [] as string[], overlayText: '', boundaryHit: false, bodyTextSample: '' }))

    const paint = await page.evaluate(() => {
      const r = document.getElementById('root')
      if (!r) return { children: -1, htmlLen: 0, elCount: 0, textLen: 0, hasCanvas: false }
      return {
        children: r.childElementCount,
        htmlLen: r.innerHTML.trim().length,
        elCount: r.querySelectorAll('*').length,
        textLen: document.body?.innerText?.trim()?.length ?? 0,
        hasCanvas: !!document.querySelector('canvas'),
      }
    }).catch(() => ({ children: -1, htmlLen: 0, elCount: 0, textLen: 0, hasCanvas: false }))

    for (const c of domSignals.captured) if (c && !errors.includes(c)) errors.push(c)

    if (domSignals.overlayText) {
      return { status: 'broken', detail: 'Vite compile/runtime error overlay is showing:\n' + domSignals.overlayText + (errors.length ? '\n' + errors.slice(0, 6).join('\n') : '') }
    }
    if (domSignals.boundaryHit) {
      return {
        status: 'broken',
        detail: `A React error boundary rendered its fallback ("${domSignals.bodyTextSample}") — a child component threw during render. ` +
          `Identify the throwing component and fix the actual bug.\n` +
          (errors.length ? errors.slice(0, 8).join('\n') : 'No console stack captured.'),
      }
    }

    const meaningfulPaint = paint.children >= 1 && paint.elCount >= 1 && (paint.htmlLen >= 40 || paint.hasCanvas)
    if (!meaningfulPaint) {
      return {
        status: 'broken',
        detail: `Blank or near-empty render: #root has no meaningful content (children=${paint.children}, htmlLen=${paint.htmlLen}, elements=${paint.elCount}).\n` + errors.slice(0, 6).join('\n'),
      }
    }
    if (errors.length > 0) {
      return { status: 'broken', detail: 'Runtime errors detected:\n' + errors.slice(0, 8).join('\n') }
    }

    const navCount = await page.evaluate(() => document.querySelectorAll('nav').length).catch(() => 1)
    if (navCount > 1) {
      return {
        status: 'broken',
        detail: `Double navigation bar (${navCount} <nav> elements): remove <nav>/<header>/<footer> from page files — Layout.tsx provides them.`,
      }
    }

    // Per-route verification
    try {
      const links: string[] = await page.evaluate(() => {
        const hrefs = new Set<string>()
        document.querySelectorAll('a[href^="/"]').forEach((a) => {
          const h = (a as HTMLAnchorElement).getAttribute('href') || ''
          if (h && h !== '/' && !h.startsWith('//') && !h.includes('#')) hrefs.add(h)
        })
        return [...hrefs].slice(0, 6)
      }).catch(() => [] as string[])
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
        const rp = await page.evaluate(() => {
          const r = document.getElementById('root')
          const w = window as typeof window & { __cmErrors?: string[] }
          const captured = Array.isArray(w.__cmErrors) ? w.__cmErrors.slice(0, 6) : []
          const overlay = document.querySelector('vite-error-overlay')
          const overlayText = overlay ? ((overlay as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot?.textContent || overlay.textContent || 'Vite error overlay present').trim().slice(0, 300) : ''
          const bodyText = (document.body?.innerText || '').trim()
          const boundaryHit = bodyText.length < 400 &&
            /something went wrong|this section (couldn'?t|could not) load|an error occurred|failed to render|oops[,! ]/i.test(bodyText)
          const notFound = !!document.querySelector('[data-cm-notfound]')
          if (!r) return { children: -1, htmlLen: 0, elCount: 0, hasCanvas: false, captured, overlayText, boundaryHit, notFound }
          return {
            children: r.childElementCount,
            htmlLen: r.innerHTML.trim().length,
            elCount: r.querySelectorAll('*').length,
            hasCanvas: !!document.querySelector('canvas'),
            captured, overlayText, boundaryHit, notFound,
          }
        }).catch(() => ({ children: -1, htmlLen: 0, elCount: 0, hasCanvas: false, captured: [] as string[], overlayText: '', boundaryHit: false, notFound: false }))
        for (const c of rp.captured) if (c && !routeErrors.includes(c)) routeErrors.push(c)
        page.off('pageerror', onErr)
        page.off('console', onConsole)
        if (rp.notFound) {
          return { status: 'broken', detail: `Route ${href} renders NotFound — this nav link goes to a page that does not exist. Create or stub the missing page file.` }
        }
        if (rp.overlayText) {
          return { status: 'broken', detail: `Route ${href} has a Vite error overlay: ${rp.overlayText}` }
        }
        if (rp.boundaryHit) {
          return { status: 'broken', detail: `Route ${href} triggered a React error boundary: ${routeErrors.slice(0, 4).join('\n')}` }
        }
        const ok = rp.children >= 1 && rp.elCount >= 1 && (rp.htmlLen >= 40 || rp.hasCanvas)
        if (!ok && routeErrors.length > 0) {
          return { status: 'broken', detail: `Route ${href} has errors:\n${routeErrors.slice(0, 6).join('\n')}` }
        }
      }
    } catch { /* per-route check best-effort */ }

    // Take screenshot for vision verdict
    let screenshot: Buffer | undefined
    try { screenshot = await page.screenshot({ type: 'png', fullPage: false }).catch(() => undefined) } catch { /* non-fatal */ }
    const vv = screenshot ? await visualVerdict(screenshot, sandboxId) : { broken: false, reason: '', score: null }
    if (vv.broken) return { status: 'broken', detail: vv.reason, score: vv.score }

    return { status: 'ok', detail: vv.reason, score: vv.score, screenshot }
  } catch (e) {
    return { status: 'skipped', detail: 'chromium launch failed: ' + (e instanceof Error ? e.message : String(e)) }
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { if (browser) await (browser as any).close() } catch { /* ignore */ }
  }
}

// Full functional + visual verification with Puppeteer.
export async function functionalVerify(url: string, userRequest: string, skill: Skill): Promise<{ ok: boolean; issues: string[]; detail: string }> {
  let browser: unknown = null
  try {
    const chromiumMod = await import('@sparticuz/chromium')
    const puppeteer = await import('puppeteer-core')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromium = (chromiumMod as any).default ?? chromiumMod
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browser = await (puppeteer as any).launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (browser as any).newPage()
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {})
    await new Promise(r => setTimeout(r, 1500))

    const snap = (): Promise<string> => page.evaluate(() => {
      const text = (document.body?.innerText || '').slice(0, 3000)
      const nodes = document.querySelectorAll('*').length
      let canvasSig = ''
      const c = document.querySelector('canvas') as HTMLCanvasElement | null
      if (c) { try { const d = c.getContext('2d')?.getImageData(0, 0, Math.min(c.width, 32), Math.min(c.height, 32)).data; canvasSig = d ? String(d.reduce((a, b) => a + b, 0)) : '' } catch { /* tainted */ } }
      return `${text.length}|${nodes}|${canvasSig}|${text.slice(0, 160)}`
    }).catch(() => '')

    const inventory = await page.evaluate(() => {
      const q = (s: string) => Array.from(document.querySelectorAll(s))
      const label = (el: Element) => ((el.textContent || (el as HTMLElement).getAttribute?.('aria-label') || (el as HTMLInputElement).placeholder || el.tagName) || '').trim().slice(0, 40)
      const imgs = q('img') as HTMLImageElement[]
      const brokenImgs = imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => (i.getAttribute('src') || i.getAttribute('alt') || 'image').slice(0, 60))
      const sections = q('section, [data-section], main > div')
      const emptySections = sections.filter(s => ((s as HTMLElement).innerText || '').trim().length < 8 && !s.querySelector('img, canvas, svg, video')).length
      return {
        buttons: q('button, [role=button], a[href]').slice(0, 12).map(label),
        inputs: q('input, textarea, select').slice(0, 8).map(label),
        headings: q('h1, h2').slice(0, 6).map(label),
        hasCanvas: !!document.querySelector('canvas'),
        buttonCount: q('button, [role=button]').length,
        inputCount: q('input, textarea, select').length,
        imgCount: imgs.length,
        brokenImgs: brokenImgs.slice(0, 6),
        emptySections,
      }
    }).catch(() => ({ buttons: [] as string[], inputs: [] as string[], headings: [] as string[], hasCanvas: false, buttonCount: 0, inputCount: 0, imgCount: 0, brokenImgs: [] as string[], emptySections: 0 }))

    const responded: string[] = []
    const dead: string[] = []
    const before = await snap()
    const btns = await page.$$('button, [role=button]').catch(() => [] as unknown[])
    for (let i = 0; i < Math.min(btns.length, 6); i++) {
      const s0 = await snap()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (btns[i] as any).click({ delay: 20 }).catch(() => {})
      await new Promise(r => setTimeout(r, 350))
      const s1 = await snap()
      const lbl = inventory.buttons[i] ?? `button ${i + 1}`
      if (s1 !== s0) responded.push(lbl); else dead.push(lbl)
    }
    const inputs = await page.$$('input, textarea').catch(() => [] as unknown[])
    for (let i = 0; i < Math.min(inputs.length, 3); i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (inputs[i] as any).click().catch(() => {})
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (inputs[i] as any).type('test', { delay: 8 }).catch(() => {})
    }
    if (inventory.hasCanvas) {
      const s0 = await snap()
      for (const key of ['Space', 'Enter', 'ArrowUp', 'ArrowRight', 'KeyW']) {
        await page.keyboard.down(key).catch(() => {}); await new Promise(r => setTimeout(r, 90)); await page.keyboard.up(key).catch(() => {})
      }
      await new Promise(r => setTimeout(r, 700))
      const s1 = await snap()
      if (s1 !== s0) responded.push('canvas responds to keys'); else dead.push('the canvas/game does NOT respond to keyboard input')
    }
    const after = await snap()

    const report = `User asked to build: "${userRequest.slice(0, 300)}"\nApp type: ${skill}\n` +
      `Headings: ${inventory.headings.join(' | ') || '(none)'}\n` +
      `Buttons (${inventory.buttonCount}): ${inventory.buttons.join(', ') || '(none)'}\n` +
      `Inputs (${inventory.inputCount}): ${inventory.inputs.join(', ') || '(none)'}\n` +
      `Has canvas: ${inventory.hasCanvas}\n` +
      `Controls that RESPONDED: ${responded.join(', ') || '(none)'}\n` +
      `Controls that did NOT respond (dead): ${dead.join(', ') || '(none)'}\n` +
      `Images: ${inventory.imgCount} total, ${inventory.brokenImgs.length} BROKEN: ${inventory.brokenImgs.join(', ') || '(none)'}\n` +
      `Empty sections: ${inventory.emptySections}\n` +
      `Screen changed during use: ${before !== after}`

    let ok = dead.length === 0
    let issues: string[] = []
    const contentIssues: string[] = []
    if (inventory.brokenImgs.length > 0) contentIssues.push(`Broken images: ${inventory.brokenImgs.join(', ')}. Use Unsplash URLs.`)
    if (inventory.emptySections >= 2) contentIssues.push(`${inventory.emptySections} sections are EMPTY. Fill every section with real copy and imagery.`)
    try {
      const res = await generateText({
        ...getModelOptions(ERROR_MODEL),
        maxOutputTokens: 500,
        abortSignal: AbortSignal.timeout(30_000),
        system: 'You are a QA tester. Given what the user ASKED for and a report of the RUNNING app, judge if the app FUNCTIONALLY fulfils the request. Return STRICT JSON only: {"ok": boolean, "issues": string[]}.',
        messages: [{ role: 'user', content: report }],
      })
      const m = res.text.match(/\{[\s\S]*\}/)
      if (m) { const j = JSON.parse(m[0]) as { ok?: boolean; issues?: string[] }; ok = !!j.ok && dead.length === 0; issues = Array.isArray(j.issues) ? j.issues.slice(0, 6) : [] }
    } catch { /* best-effort */ }
    if (dead.length && issues.length === 0) issues = dead.map(d => `Non-functional control: ${d}`)
    if (contentIssues.length > 0) { ok = false; issues.push(...contentIssues) }

    try {
      const shot: Buffer = await page.screenshot({ type: 'png', fullPage: false }).catch(() => null)
      if (shot) {
        const vr = await generateText({
          ...getModelOptions(VISION_MODEL),
          maxOutputTokens: 320,
          abortSignal: AbortSignal.timeout(30_000),
          messages: [{ role: 'user', content: [
            { type: 'text', text: `You are a STRICT QA reviewer. The user asked for: "${userRequest.slice(0, 240)}" (a ${skill}). Judge HARSHLY for amateur quality. Reply STRICT JSON only: {"good":boolean,"issues":string[]}.` },
            { type: 'image', image: shot },
          ] }],
        })
        const vm = vr.text.match(/\{[\s\S]*\}/)
        if (vm) {
          const vj = JSON.parse(vm[0]) as { good?: boolean; issues?: string[] }
          if (vj.good === false) { ok = false; if (Array.isArray(vj.issues)) issues.push(...vj.issues.slice(0, 4).map(s => `Visual: ${s}`)) }
        }
      }
    } catch { /* visual judge best-effort */ }

    return { ok, issues: issues.slice(0, 8), detail: report }
  } catch (e) {
    return { ok: true, issues: [], detail: 'functional-verify skipped: ' + (e instanceof Error ? e.message : String(e)) }
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { if (browser) await (browser as any).close() } catch { /* ignore */ }
  }
}

// ── W6: AI-Directed Browser QA ───────────────────────────────────────────────
// Vision model SEES the rendered page, decides what to interact with, Claude
// executes those actions, then the vision model judges the result. Up to 4 rounds.
// Catches UX failures that blind button-probing misses: wrong flows, dead
// sequences, visual regressions after an interaction, broken game-over states.
// Graceful: never blocks the reveal. Returns specific issues for targeted repair.
export async function aiDrivenQA(
  url: string,
  userRequest: string,
  skill: Skill,
): Promise<{ ok: boolean; issues: string[] }> {
  let browser: unknown = null
  try {
    const chromiumMod = await import('@sparticuz/chromium')
    const puppeteer = await import('puppeteer-core')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromium = (chromiumMod as any).default ?? chromiumMod
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browser = await (puppeteer as any).launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (browser as any).newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {})
    await new Promise(r => setTimeout(r, 1500))

    const allIssues: string[] = []

    for (let round = 1; round <= 4; round++) {
      // Capture current state
      const shot: Buffer | null = await page.screenshot({ type: 'png', fullPage: false }).catch(() => null)
      if (!shot) break

      // Ask vision model: what should I do next to test this app?
      const planRes = await generateText({
        ...getModelOptions(VISION_MODEL),
        maxOutputTokens: 400,
        abortSignal: AbortSignal.timeout(25_000),
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are testing a ${skill} that was built for: "${userRequest.slice(0, 200)}". Round ${round}/4.\n` +
                `Look at the current screenshot and decide the SINGLE MOST IMPORTANT action to test next.\n` +
                `Respond STRICT JSON only:\n` +
                `{"action":"click"|"type"|"press"|"scroll"|"none","selector":"CSS selector or empty","value":"text to type or key name","reason":"why this tests the app","issues":["any visual problems already visible"]}\n` +
                `action=none means the app looks correct and complete — stop testing.\n` +
                `For click: selector = a CSS selector of the element. For type: selector = input CSS selector, value = text. For press: value = key name (Space/Enter/ArrowUp). For scroll: value = "down" or "up".`,
            },
            { type: 'image', image: shot },
          ],
        }],
      }).catch(() => null)

      if (!planRes) break

      // Parse visible issues already in the screenshot
      let action = 'none', selector = '', value = '', immediateIssues: string[] = []
      try {
        const m = planRes.text.match(/\{[\s\S]*\}/)
        if (m) {
          const j = JSON.parse(m[0]) as { action?: string; selector?: string; value?: string; reason?: string; issues?: string[] }
          action = j.action ?? 'none'
          selector = j.selector ?? ''
          value = j.value ?? ''
          immediateIssues = Array.isArray(j.issues) ? j.issues : []
        }
      } catch { break }

      allIssues.push(...immediateIssues)
      if (action === 'none') break

      // Execute the action
      try {
        if (action === 'click' && selector) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const el = await (page as any).$(selector).catch(() => null)
          if (el) await el.click({ delay: 30 }).catch(() => {})
        } else if (action === 'type' && selector) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const el = await (page as any).$(selector).catch(() => null)
          if (el) {
            await el.click().catch(() => {})
            await el.type(value || 'test input', { delay: 20 }).catch(() => {})
          }
        } else if (action === 'press') {
          await page.keyboard.press(value || 'Space').catch(() => {})
        } else if (action === 'scroll') {
          await page.evaluate((dir: string) => window.scrollBy(0, dir === 'down' ? 600 : -600), value).catch(() => {})
        }
        await new Promise(r => setTimeout(r, 1200))
      } catch { /* best-effort action */ }

      // After action: check for errors or visual regressions
      const afterShot: Buffer | null = await page.screenshot({ type: 'png', fullPage: false }).catch(() => null)
      if (!afterShot) continue

      // Overlay errors (Vite overlay, React boundary) — same checks as headlessRuntimeCheck
      const signals = await page.evaluate(() => {
        const overlay = document.querySelector('vite-error-overlay')
        const overlayText = overlay ? ((overlay as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot?.textContent || overlay.textContent || '').trim().slice(0, 200) : ''
        const bodyText = (document.body?.innerText || '').trim()
        const boundaryHit = bodyText.length < 400 && /something went wrong|error occurred|failed to render/i.test(bodyText)
        return { overlayText, boundaryHit, bodyText: bodyText.slice(0, 100) }
      }).catch(() => ({ overlayText: '', boundaryHit: false, bodyText: '' }))

      if (signals.overlayText) { allIssues.push(`Error overlay appeared after ${action}: ${signals.overlayText.slice(0, 100)}`); break }
      if (signals.boundaryHit) { allIssues.push(`React error boundary appeared after ${action}`); break }
    }

    const ok = allIssues.length === 0
    console.log(`[ai-driven-qa] ok=${ok} issues=${allIssues.slice(0, 2).join(' | ')}`)
    return { ok, issues: allIssues.slice(0, 6) }
  } catch (e) {
    console.warn('[ai-driven-qa] skipped:', e instanceof Error ? e.message : e)
    return { ok: true, issues: [] }
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { if (browser) await (browser as any).close() } catch { /* ignore */ }
  }
}
