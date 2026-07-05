import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { Sandbox } from '@vercel/sandbox'
import { getContents, type File } from './generate-files/get-contents'
import { getRichError } from './get-rich-error'
import { getWriteFiles } from './generate-files/get-write-files'
import { computeMissingKnownPackages } from './generate-files/import-gate'
import { scanFootguns } from './generate-files/footgun-scan'
import { detectEmptyRender, computeCssClosure } from '../gates/semantic-gate'
import { SCAFFOLD_PATH_SET } from './scaffold'
import { tool } from 'ai'
import description from './generate-files.md'
import z from 'zod/v3'

// Read a text file from the sandbox (streamed). Returns null if absent/unreadable —
// used by the CSS-closure pass to read the CURRENT index.css + persistent utilities.
async function readSandboxFileContent(sandbox: Sandbox, path: string): Promise<string | null> {
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

// ── Import-closure helpers ────────────────────────────────────────────────────
// The #1 cause of broken builds: the AI imports a local file (types.ts, a
// component) it never generated. These helpers find such imports so we can
// generate the missing files and guarantee the import graph is complete.

function extractLocalImports(content: string): string[] {
  const specs = new Set<string>()
  const reFrom = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g
  const reBare = /import\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = reFrom.exec(content)) !== null) specs.add(m[1])
  while ((m = reBare.exec(content)) !== null) specs.add(m[1])
  return [...specs].filter(s => s.startsWith('./') || s.startsWith('../') || s.startsWith('@/'))
}

function resolveBase(spec: string, importerPath: string): string {
  if (spec.startsWith('@/')) return 'src/' + spec.slice(2)
  const dir = importerPath.split('/').slice(0, -1)
  for (const p of spec.split('/')) {
    if (p === '.' || p === '') continue
    else if (p === '..') dir.pop()
    else dir.push(p)
  }
  return dir.join('/')
}

function importCandidates(spec: string, importerPath: string): string[] {
  const base = resolveBase(spec, importerPath)
  const exts = ['.tsx', '.ts', '.jsx', '.js']
  const out = [base]
  for (const e of exts) out.push(base + e)
  for (const e of exts) out.push(base + '/index' + e)
  return out
}

// The concrete path we'd generate for a missing import (null = skip: external,
// css, or json — those are handled by the scaffold or not generatable as code).
function targetPathFor(spec: string, importerPath: string): string | null {
  const base = resolveBase(spec, importerPath)
  if (/\.(css|json)$/.test(base)) return null
  if (/\.(tsx|jsx|ts|js)$/.test(base)) return base
  const last = base.split('/').pop() || ''
  return /^[A-Z]/.test(last) ? base + '.tsx' : base + '.ts'
}

// ── Deterministic export-checker ──────────────────────────────────────────────
// The contract-bug class: file A does `import { useHabitStore } from './store'` but
// store.ts only exports `useStore`. tsc-in-the-sandbox is unreliable for this; here we
// have every file in memory, so we resolve each local import against the target's ACTUAL
// exports and flag any name it doesn't export — with the real export list, so the repair
// fixes it correctly. Kills the whole class (any idea, any wrong name) before preview.

// Named + default imports per LOCAL module spec, capturing the SOURCE (imported) name.
function extractNamedImports(content: string): { spec: string; names: string[]; hasDefault: boolean }[] {
  const out: { spec: string; names: string[]; hasDefault: boolean }[] = []
  const re = /import\s+([^'";]+?)\s+from\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const clause = m[1].trim()
    const spec = m[2]
    if (!(spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('@/'))) continue
    const braceIdx = clause.indexOf('{')
    const head = (braceIdx === -1 ? clause : clause.slice(0, braceIdx)).replace(/\*\s+as\s+[A-Za-z0-9_$]+/, '').replace(/,\s*$/, '').trim()
    const hasDefault = /^[A-Za-z0-9_$]+$/.test(head)
    const names: string[] = []
    if (braceIdx !== -1) {
      const close = clause.indexOf('}', braceIdx)
      const inside = clause.slice(braceIdx + 1, close === -1 ? undefined : close)
      for (const part of inside.split(',')) {
        const seg = part.trim()
        if (!seg || seg.startsWith('type ')) continue
        const asM = seg.match(/^([A-Za-z0-9_$]+)\s+as\s+/)
        names.push(asM ? asM[1] : seg.split(/\s+/)[0])
      }
    }
    out.push({ spec, names, hasDefault })
  }
  return out
}

// The names a module exports.
function extractExportNames(content: string): { names: Set<string>; hasDefault: boolean; wildcard: boolean } {
  const names = new Set<string>()
  for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class|abstract\s+class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1])
  for (const m of content.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim()
      if (!seg) continue
      const asM = seg.match(/\bas\s+([A-Za-z0-9_$]+)\s*$/)
      names.add(asM ? asM[1] : seg.split(/\s+/)[0])
    }
  }
  return { names, hasDefault: /export\s+default\b/.test(content), wildcard: /export\s+\*/.test(content) }
}

export function findExportMismatches(files: { path: string; content: string }[]): { path: string; issue: string }[] {
  const byPath = new Map(files.map(f => [f.path, f.content]))
  const out: { path: string; issue: string }[] = []
  for (const f of files) {
    if (!/\.(tsx|ts|jsx|js)$/.test(f.path)) continue
    for (const imp of extractNamedImports(f.content)) {
      const cand = importCandidates(imp.spec, f.path).find(c => byPath.has(c))
      if (!cand) continue // external / scaffold / not one of our generated files — skip
      const tgt = extractExportNames(byPath.get(cand)!)
      if (tgt.wildcard) continue // re-exports everything; can't verify
      const missing = imp.names.filter(n => n && !tgt.names.has(n))
      const missingDefault = imp.hasDefault && !tgt.hasDefault
      if (missing.length === 0 && !missingDefault) continue
      const available = [...tgt.names].join(', ') + (tgt.hasDefault ? (tgt.names.size ? ', default' : 'default') : '')
      const parts: string[] = []
      if (missing.length) parts.push(`imports { ${missing.join(', ')} } from "${imp.spec}" but that module does NOT export ${missing.length > 1 ? 'them' : 'it'}`)
      if (missingDefault) parts.push(`imports a default from "${imp.spec}" but it has no default export`)
      out.push({ path: f.path, issue: `This file ${parts.join(' and ')}. "${imp.spec}" actually exports: ${available || '(nothing)'}. Fix the import to use the correct exported name(s) — and update every usage in this file to match.` })
    }
  }
  return out
}

// Runs inside the sandbox after file generation to guarantee Vite allowedHosts.
const VITE_PATCH_SCRIPT = `
const fs = require('fs');
const configs = ['vite.config.ts','vite.config.js','vite.config.mjs','vite.config.mts'];
let done = false;
for (const f of configs) {
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('allowedHosts')) { done = true; break; }
  if (/server\\s*:/.test(s)) {
    s = s.replace(/(server\\s*:\\s*\\{)/, "$1 host:'0.0.0.0', allowedHosts:true,");
  } else if (/defineConfig/.test(s)) {
    s = s.replace(/(defineConfig\\s*(?:<[^>]*>)?\\s*\\(\\s*\\{)/, "$1\\n  server:{host:'0.0.0.0',allowedHosts:true,port:3000},");
  } else {
    s = s.replace(/export\\s+default\\s*\\{/, "export default {\\n  server:{host:'0.0.0.0',allowedHosts:true,port:3000},");
  }
  fs.writeFileSync(f, s);
  console.log('cm-patch: patched ' + f);
  done = true;
  break;
}
if (!done) {
  const fallback = "import{defineConfig}from 'vite';import react from '@vitejs/plugin-react';export default defineConfig({plugins:[react()],server:{host:'0.0.0.0',allowedHosts:true,port:3000}});";
  fs.writeFileSync('vite.config.js', fallback);
  console.log('cm-patch: created vite.config.js');
}
`.trim()

// Deterministic router guarantee — if any generated file uses react-router (Routes /
// useLocation / Link / etc.) but the AI REGENERATED main.tsx without a Router wrapper,
// inject <BrowserRouter> around <App/>. Pairs with fixRouter (which now leaves main.tsx
// alone) to make "Missing <BrowserRouter>" structurally impossible. Returns the corrected
// main.tsx, or null if nothing to do (incl. the common case where main.tsx wasn't
// regenerated — the scaffold's already wraps it).
function ensureRouterMounted(files: { path: string; content: string }[]): { path: string; content: string } | null {
  const main = files.find((f) => /(^|\/)main\.(tsx|jsx)$/.test(f.path))
  if (!main) return null // scaffold main.tsx untouched → already has BrowserRouter
  if (/\b(BrowserRouter|HashRouter|MemoryRouter|RouterProvider)\b/.test(main.content)) return null // already mounted
  const routes = files.some(
    (f) =>
      /\.(tsx|jsx)$/.test(f.path) &&
      !/(^|\/)main\.(tsx|jsx)$/.test(f.path) &&
      /react-router-dom/.test(f.content) &&
      /\b(useLocation|useNavigate|useParams|useSearchParams|<Routes\b|<Route\b|<Link\b|<NavLink\b|<Outlet\b)/.test(f.content)
  )
  if (!routes) return null // no routing → a game or single-view app; no router needed
  let c = main.content
  if (/from\s*['"]react-router-dom['"]/.test(c)) {
    c = c.replace(/import\s*\{([^}]*)\}\s*from\s*['"]react-router-dom['"]/, (_m, n: string) => `import { BrowserRouter, ${n.trim()} } from 'react-router-dom'`)
  } else {
    c = `import { BrowserRouter } from 'react-router-dom'\n` + c
  }
  // Wrap the rendered <App .../> in <BrowserRouter> (handles <App/> and <App />).
  c = c.replace(/<App(\s[^>]*)?\/>/, (m) => `<BrowserRouter>${m}</BrowserRouter>`)
  return { path: main.path, content: c }
}

// Foundation = the files that DEFINE shared contracts others import (types, store,
// hooks, lib, context, data, constants, schema). We generate these FIRST, then feed
// their real content to the components — so a component can't misname an export it's
// looking right at. This is the read-first / "prevent" layer (Lovable's approach).
function isFoundation(path: string): boolean {
  return (
    /(^|\/)(types?|store|stores|state|lib|utils?|context|providers?|constants?|data|services|schema|models?|config|api)(\/|\.)/i.test(path) ||
    /\/hooks?\//i.test(path) ||
    /\/use[A-Z]\w*\.(ts|tsx)$/.test(path) // custom hooks like useDreams.ts
  )
}

interface Params {
  modelId: string
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
  // The design contract (brief tokens + fonts + taste rules) — passed into the
  // file-writer's system prompt so generated code actually matches the design.
  designContext?: string
  // Durable-runs STEP 2 (enrichment phases): paths that ALREADY exist on disk (the
  // full manifest — every route ships as a shell from phase 1). Seeds the import-
  // closure's "existing" set so an enrichment pass generating just this phase's pages
  // never re-creates a sibling that is already present. Empty on the normal first pass.
  existingPaths?: string[]
  // Durable-runs STEP 3: hard deadline guard threaded to every model call so an
  // enrichment phase that overruns the invocation budget aborts cleanly (completed
  // files are salvaged; the rest re-run in the next chained invocation).
  abortSignal?: AbortSignal
  // Durable-runs phasing (Fable #1): lazy provider for the phase-2+ SHELL files —
  // deterministic, on-brand placeholders the SERVER stamps (zero model tokens). Evaluated
  // at execute time (after planProject ran). generateFiles writes these to the sandbox
  // BEFORE generation so App.tsx's route imports resolve, marks them satisfied for the
  // import-closure pass, and exempts them from the empty-render gate. The model therefore
  // only generates the REAL phase-1 files — the core of the fast-first-preview win. Empty
  // on single-phase builds.
  getShells?: () => Array<{ path: string; content: string }>
}

export const generateFiles = ({ writer, modelId, designContext, existingPaths, abortSignal, getShells }: Params) =>
  tool({
    description,
    inputSchema: z.object({
      sandboxId: z.string(),
      paths: z.array(z.string()),
    }),
    execute: async ({ sandboxId, paths }, { toolCallId, messages }) => {
      if (paths.length === 0) {
        return 'ERROR: paths list is empty. You must provide at least one file path to generate.'
      }

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: { paths: [], status: 'generating' },
      })

      let sandbox: Sandbox | null = null

      try {
        sandbox = await Sandbox.get({ sandboxId })
      } catch (error) {
        const richError = getRichError({
          action: 'get sandbox by id',
          args: { sandboxId },
          error,
        })
        writer.write({
          id: toolCallId,
          type: 'data-generating-files',
          data: { error: richError.error, paths: [], status: 'error' },
        })
        return richError.message
      }

      const writeFiles = getWriteFiles({ sandbox, toolCallId, writer })
      const uploaded: File[] = []

      // ── Server-stamped shells (Fable #1) ─────────────────────────────────────
      // Write the deferred-page placeholders NOW, before generation. They resolve
      // App.tsx's route imports (so the phase-1 build is green), cost zero model tokens,
      // and are enriched into real pages later. Tracked in shellPathSet so the import-
      // closure treats them as satisfied and the empty-render gate skips them.
      const shellFiles = getShells?.() ?? []
      const shellPathSet = new Set(shellFiles.map((s) => s.path))
      if (shellFiles.length > 0) {
        try {
          await sandbox.writeFiles(shellFiles.map((s) => ({ path: s.path, content: Buffer.from(s.content, 'utf8') })))
          console.log(`[shells] server-stamped ${shellFiles.length} deferred-page shell(s): ${shellFiles.map((s) => s.path.split('/').pop()).join(', ')}`)
        } catch (e) {
          console.warn('[shells] stamp write failed (non-fatal):', e instanceof Error ? e.message : e)
        }
      }

      // Streaming writeFile tool calls — each file is yielded as soon as Flash
      // finishes writing it. No heartbeat needed; tokens flow continuously.
      // ── Two-phase (read-first) generation ────────────────────────────────────
      // Generate FOUNDATION files (types / store / hooks / lib) FIRST, then the
      // PRESENTATION files (components / pages / App) with the foundation's REAL content
      // in context. So a component imports the exact exports + object shapes that exist,
      // instead of guessing and drifting (the useHabitStore-vs-useStore class). This
      // PREVENTS the contract bugs at the source — Lovable's read-first approach. Falls
      // back to a single pass when there's no clear foundation/presentation split.
      // Generate ONE file (or small group) via its own getContents call, writing each as
      // it lands. Shared `uploaded` is safe to push into — the event loop is single-threaded
      // so pushes are atomic between awaits; concurrent sandbox writes target distinct files.
      // A getContents call must NEVER hang forever (a stalled DeepSeek stream froze an
      // entire Vercel build to the 800s kill). Bound every generation call: caller's
      // abortSignal (if any) OR-combined with a hard per-call timeout.
      const boundedSignal = (ms: number): AbortSignal =>
        abortSignal ? AbortSignal.any([abortSignal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms)

      // ── Generation pass (serial, proven-reliable + hang-guarded) ─────────────
      // One getContents call streams all of a pass's files. The parallel per-file fan-out
      // was reverted after it repeatedly stalled a file with no recovery on Vercel; the
      // server-stamped shells (which shrink phase-1 to only the real files) are the safe,
      // durable speed win. A generous hard timeout guarantees a stalled stream can never
      // hang the invocation to the 800s kill (the retry/closure pass recovers any gap).
      const runPass = async (passPaths: string[], context: File[]) => {
        if (passPaths.length === 0) return
        const passMessages = context.length === 0
          ? messages
          : [
              ...messages,
              {
                role: 'user' as const,
                content:
                  'These files ALREADY EXIST in this project. When you import from them, use their EXACT exported names, types, and object shapes — never rename, redefine, or guess. Match them precisely:\n\n' +
                  context.map((f) => `// ${f.path}\n${f.content.slice(0, 4500)}`).join('\n\n'),
              },
            ]
        try {
          const it = getContents({ messages: passMessages, modelId, paths: passPaths, designContext, abortSignal: boundedSignal(450_000) })
          for await (const chunk of it) {
            if (chunk.files.length > 0) {
              const error = await writeFiles({ ...chunk, written: uploaded.map((f) => f.path) })
              if (!error) uploaded.push(...chunk.files)
            }
          }
        } catch (e) {
          console.warn('[runPass] generation aborted/failed (retry pass will recover):', e instanceof Error ? e.message : e)
        }
      }

      const foundationPaths = paths.filter(isFoundation)
      const presentationPaths = paths.filter((p) => !isFoundation(p))
      try {
        if (foundationPaths.length > 0 && presentationPaths.length > 0) {
          await runPass(foundationPaths, []) // phase 1: contracts
          await runPass(presentationPaths, uploaded.slice()) // phase 2: sees phase 1
        } else {
          await runPass(paths, [])
        }
      } catch (error) {
        const richError = getRichError({
          action: 'generate file contents',
          args: { modelId, paths },
          error,
        })
        console.error('[generateFiles] getContents error:', richError.message)
      }

      // Retry any files that were missed (JSON parse failure, empty content, etc.)
      const writtenPaths = new Set(uploaded.map(f => f.path))
      const missing = paths.filter(p => !writtenPaths.has(p))
      if (missing.length > 0) {
        console.warn(`[generateFiles] Retrying ${missing.length} missing file(s): ${missing.join(', ')}`)
        const retryIterator = getContents({ messages, modelId, paths: missing, designContext, abortSignal: boundedSignal(150_000) })
        try {
          for await (const chunk of retryIterator) {
            if (chunk.files.length > 0) {
              const error = await writeFiles({ ...chunk, written: uploaded.map(f => f.path) })
              if (!error) uploaded.push(...chunk.files)
            }
          }
        } catch {
          // retry failure is non-fatal
        }
      }

      // ── Import-closure pass: generate any imported file that wasn't created ──
      // Deterministically closes the import graph. Scans every generated file's
      // local imports; any referenced file that doesn't exist gets generated,
      // with the importing files as context so exports/types are inferred right.
      // Loops until no new missing files (max 2 rounds). This is the fix for the
      // "Cannot find module './types'" class of blank previews.
      try {
        for (let round = 0; round < 2; round++) {
          const existing = new Set<string>([
            ...uploaded.map(f => f.path),
            ...SCAFFOLD_PATH_SET,
            ...(existingPaths ?? []),
            ...shellPathSet, // server-stamped shells already exist on disk — never regenerate
          ])
          const missingMap = new Map<string, Set<string>>() // target -> importers
          for (const file of uploaded) {
            if (!/\.(tsx|jsx|ts|js)$/.test(file.path)) continue
            for (const spec of extractLocalImports(file.content)) {
              if (importCandidates(spec, file.path).some(c => existing.has(c))) continue
              const target = targetPathFor(spec, file.path)
              if (!target || SCAFFOLD_PATH_SET.has(target)) continue
              const set = missingMap.get(target) ?? new Set<string>()
              set.add(file.path)
              missingMap.set(target, set)
            }
          }
          if (missingMap.size === 0) break
          const missingPaths = [...missingMap.keys()].slice(0, 12)
          console.warn(`[closure] round ${round}: generating ${missingPaths.length} missing file(s): ${missingPaths.join(', ')}`)

          const importerPaths = new Set<string>()
          for (const p of missingPaths) for (const ip of missingMap.get(p) ?? []) importerPaths.add(ip)
          const importerSnippets = [...importerPaths]
            .map(ip => {
              const f = uploaded.find(u => u.path === ip)
              return f ? `// ${ip}\n${f.content.slice(0, 1800)}` : ''
            })
            .filter(Boolean)
            .join('\n\n')

          // The EXACT export signatures of EVERY already-generated file — so a missing
          // file (e.g. a wrapper) matches the real contracts of the components it
          // IMPORTS, not just how its consumers use it. This is the fix for closure-
          // generated files inventing a wrong prop/contract for an existing component.
          const apiSurface = uploaded
            .filter(f => /\.(tsx|ts|jsx|js)$/.test(f.path) && !SCAFFOLD_PATH_SET.has(f.path) && !missingPaths.includes(f.path))
            .map(f => {
              const lines = f.content.split('\n').filter(l => /^\s*export\s/.test(l)).map(l => l.trim().slice(0, 200))
              return lines.length ? `// ${f.path}\n${lines.join('\n')}` : ''
            })
            .filter(Boolean)
            .join('\n\n')

          const closureMessages = [
            ...messages,
            {
              role: 'user' as const,
              content:
                'These files are imported but do not exist yet. Create each one COMPLETELY so every import resolves. ' +
                'Infer the EXACT exports, types, interfaces, props, and function signatures from how they are used in the importing files shown below. ' +
                'Match the import style (default vs named) exactly. Use real, production-quality code — no stubs.\n\n' +
                'CRITICAL — match these EXISTING file signatures exactly when you import or render any of them (do NOT invent different props or a different default/named export):\n' +
                apiSurface + '\n\n' +
                'Importing files for context:\n' + importerSnippets,
            },
          ]

          let gotAny = false
          const closureIter = getContents({ messages: closureMessages, modelId, paths: missingPaths, designContext, abortSignal: boundedSignal(150_000) })
          try {
            for await (const chunk of closureIter) {
              if (chunk.files.length > 0) {
                const err = await writeFiles({ ...chunk, written: uploaded.map(f => f.path) })
                if (!err) { uploaded.push(...chunk.files); gotAny = true }
              }
            }
          } catch { /* non-fatal */ }
          if (!gotAny) break
        }
      } catch (e) {
        console.warn('[closure] pass failed (non-fatal):', e instanceof Error ? e.message : e)
      }

      // ── Footgun scan + repair ────────────────────────────────────────────────
      // Catch the runtime bug classes that compile cleanly (Zustand selectors that loop,
      // purged dynamic Tailwind classes, index keys, keyless AnimatePresence) and rewrite
      // the offending files ONCE — so they never reach the preview. Deterministic catcher.
      try {
        const violations = [...scanFootguns(uploaded), ...findExportMismatches(uploaded)]
        if (violations.length > 0) {
          const byPath = new Map<string, string[]>()
          for (const v of violations) { const a = byPath.get(v.path) ?? []; a.push(v.issue); byPath.set(v.path, a) }
          const paths = [...byPath.keys()].slice(0, 8)
          const issueText = paths.map(p => `// ${p}\n` + (byPath.get(p) ?? []).map(i => '- ' + i).join('\n')).join('\n\n')
          console.warn(`[footgun] repairing ${paths.length} file(s): ${paths.join(', ')}`)
          const fixMessages = [
            ...messages,
            { role: 'user' as const, content: 'These files COMPILE but contain runtime footguns that will break or hang the app. Rewrite each listed file COMPLETELY — fix the issue, keep every feature, change nothing unrelated.\n\n' + issueText },
          ]
          const it = getContents({ messages: fixMessages, modelId, paths, designContext, abortSignal: boundedSignal(150_000) })
          for await (const chunk of it) {
            if (chunk.files.length > 0) {
              const err = await writeFiles({ ...chunk, written: uploaded.map(f => f.path) })
              if (!err) for (const nf of chunk.files) { const i = uploaded.findIndex(u => u.path === nf.path); if (i >= 0) uploaded[i] = nf; else uploaded.push(nf) }
            }
          }
        }
      } catch (e) {
        console.warn('[footgun] pass failed (non-fatal):', e instanceof Error ? e.message : e)
      }

      // ── Empty-render regen (P1-A / Q3) — Q4 cross-file phase, run ONCE ────────
      // Deterministically catch components that render nothing meaningful: return
      // null / empty fragment, a childless leaf (the FishIcon case), a page with a
      // sub-floor of static text and no data source. BLOCKERS (and page-escalated
      // advisories) → regenerate that ONE file with an explicit "fill it with real
      // content" instruction. This NEVER strips or guesses — it asks the model to
      // paint the empty component, so a blank section can't reach the preview.
      try {
        // Phase-2+ shells are intentionally minimal (enriched later) — never regenerate
        // them here, or phase 1 balloons into a full build and the fast-preview win is lost.
        const findings = uploaded
          .filter(f => !shellPathSet.has(f.path))
          .map(f => detectEmptyRender(f.path, f.content))
          .filter((x): x is NonNullable<typeof x> => x !== null && x.blocker)
        if (findings.length > 0) {
          const picked = findings.slice(0, 6)
          const emptyPaths = picked.map(f => f.path)
          const issueText = picked
            .map(f => `// ${f.path}\n` + f.reasons.map(r => '- ' + r).join('\n'))
            .join('\n\n')
          console.warn(`[empty-render] regenerating ${emptyPaths.length} file(s): ${emptyPaths.join(', ')}`)
          const fixMessages = [
            ...messages,
            {
              role: 'user' as const,
              content:
                'These files render nothing meaningful — a blank/empty component is a broken preview. Rewrite each listed file COMPLETELY so it renders real, on-brief, production-quality content: never null, never an empty fragment, never a childless placeholder, never lorem/coming-soon. Keep the SAME exports and the file\'s purpose; fill it with the actual UI it should display.\n\n' + issueText,
            },
          ]
          const it = getContents({ messages: fixMessages, modelId, paths: emptyPaths, designContext, abortSignal: boundedSignal(150_000) })
          for await (const chunk of it) {
            if (chunk.files.length > 0) {
              const err = await writeFiles({ ...chunk, written: uploaded.map(f => f.path) })
              if (!err) for (const nf of chunk.files) { const i = uploaded.findIndex(u => u.path === nf.path); if (i >= 0) uploaded[i] = nf; else uploaded.push(nf) }
            }
          }
        }
      } catch (e) {
        console.warn('[empty-render] pass failed (non-fatal):', e instanceof Error ? e.message : e)
      }

      // ── Router mount guarantee (deterministic) ───────────────────────────────
      // If the app routes but a regenerated main.tsx lost its <BrowserRouter>, inject it
      // now so useLocation()/<Routes> always have context. Kills the "Missing <BrowserRouter>"
      // crash + the self-heal loop it caused, before the preview is ever shown.
      try {
        const routerFix = ensureRouterMounted(uploaded)
        if (routerFix) {
          console.warn('[router] re-mounting <BrowserRouter> in', routerFix.path)
          const err = await writeFiles({ written: uploaded.map(f => f.path), files: [routerFix], paths: [routerFix.path] })
          if (!err) { const i = uploaded.findIndex(u => u.path === routerFix.path); if (i >= 0) uploaded[i] = routerFix }
        }
      } catch (e) {
        console.warn('[router] guarantee failed (non-fatal):', e instanceof Error ? e.message : e)
      }

      // ── CSS closure (P1-A / Q2) — Q4 cross-file phase, run ONCE at the end ────
      // Every className used in JSX must resolve to a definition (Tailwind ∪ scaffold
      // utilities ∪ generated CSS). For each custom class with no definition we APPEND
      // either a synthesized rule (recognized decorative patterns — gradient-text,
      // glass, glow, shimmer, scrim, animate-*, formulaic from the locked tokens) or a
      // harmless no-op `.cls {}` (unrecognized). This is PURELY ADDITIVE — it never
      // strips a class from JSX and never guesses semantics, so it cannot introduce a
      // new error; the worst case is a class that simply does nothing (invisible), which
      // is exactly the safe outcome. Runs last so it sees every file's final classes.
      try {
        const indexCss = await readSandboxFileContent(sandbox, 'src/index.css')
        const utilCss = await readSandboxFileContent(sandbox, 'src/styles/cm-ui.css')
        if (indexCss !== null) {
          const knownCss = indexCss + '\n' + (utilCss ?? '')
          const closure = computeCssClosure(uploaded, knownCss)
          if (closure.append) {
            await sandbox.writeFiles([
              { path: 'src/index.css', content: Buffer.from(indexCss + '\n' + closure.append, 'utf8') },
            ])
            console.warn(`[css-closure] appended ${closure.synthesized.length} synthesized + ${closure.noop.length} no-op class(es)` +
              (closure.noop.length ? ` (unrecognized: ${closure.noop.slice(0, 12).join(', ')})` : ''))
          }
        }
      } catch (e) {
        console.warn('[css-closure] pass failed (non-fatal):', e instanceof Error ? e.message : e)
      }

      // ── Package pre-declare gate ─────────────────────────────────────────────
      // Any allow-listed real package the AI imported but didn't declare is added
      // to package.json NOW, so the upcoming install resolves it up-front — no
      // runtime "module not found" + dev-server restart. Curated list + safe
      // versions, so this can never add a fake or React-incompatible package.
      // (Unknown packages still fall through to the runtime install catch-all.)
      try {
        let pkgRaw: string | null = null
        try {
          const stream = await sandbox.readFile({ path: 'package.json' })
          if (stream) {
            const chunks: Buffer[] = []
            for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string))
            pkgRaw = Buffer.concat(chunks).toString('utf8')
          }
        } catch { /* no package.json readable — skip */ }

        if (pkgRaw) {
          const pkg = JSON.parse(pkgRaw)
          const declared = new Set<string>([
            ...Object.keys(pkg.dependencies ?? {}),
            ...Object.keys(pkg.devDependencies ?? {}),
          ])
          const toAdd = computeMissingKnownPackages(uploaded, declared)
          const names = Object.keys(toAdd)
          if (names.length > 0) {
            pkg.dependencies = { ...(pkg.dependencies ?? {}), ...toAdd }
            await sandbox.writeFiles([
              { path: 'package.json', content: Buffer.from(JSON.stringify(pkg, null, 2), 'utf8') },
            ])
            console.warn(`[pkg-gate] pre-declared ${names.length} package(s): ${names.join(', ')}`)
          }
        }
      } catch (e) {
        console.warn('[pkg-gate] pass failed (non-fatal):', e instanceof Error ? e.message : e)
      }

      // In-sandbox Vite patch — belt-and-suspenders after server-side patch
      try {
        await sandbox.writeFiles([
          { path: '.cm-patch.cjs', content: Buffer.from(VITE_PATCH_SCRIPT, 'utf8') },
        ])
        const patchCmd = await sandbox.runCommand({ detached: true, cmd: 'node', args: ['.cm-patch.cjs'] })
        await patchCmd.wait()
        const rmCmd = await sandbox.runCommand({ detached: true, cmd: 'rm', args: ['-f', '.cm-patch.cjs'] })
        await rmCmd.wait()
      } catch {
        // Non-fatal
      }

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: { paths: uploaded.map((file) => file.path), status: 'done' },
      })

      return `Successfully generated and uploaded ${uploaded.length} files:\n${uploaded.map((f) => f.path).join('\n')}`
    },
  })
