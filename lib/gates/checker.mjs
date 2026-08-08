// ── Deterministic gate ladder — in-memory rungs (parse + resolve) ─────────────
// These run PLATFORM-SIDE on file content BEFORE anything is written to the sandbox,
// so a bad file never lands. Zero LLM calls, zero sandbox round-trips, milliseconds.
//
// Shared source of truth: imported by the replay harness (scripts/replay-fixtures.mjs)
// AND by the build pipeline (Phase 2). Written as .mjs (+ checker.d.ts) so both a plain
// node script and the Next/TS build can import it without a transpile step.
//
// Rung 1 — PARSE:   esbuild transforms TSX/TS; a throw = syntax error / truncated file.
// Rung 2 — RESOLVE: every relative import must resolve to a file in
//                   (written-files ∪ manifest ∪ node_modules). An import that resolves
//                   to NONE of those is the hallucination / missing-file signal
//                   (this is exactly tonight's `./pages/Game` and the ReservationForm
//                   vs ReservationPreview class of bug).
import { transform } from 'esbuild'
import { init as initLexer, parse as parseImports } from 'es-module-lexer'

const CODE_EXT = ['.tsx', '.ts', '.jsx', '.js', '.mts', '.mjs', '.cts', '.cjs']
const RESOLVE_TRY = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '/index.tsx', '/index.ts', '/index.jsx', '/index.js']

function loaderFor(path) {
  if (path.endsWith('.tsx')) return 'tsx'
  if (path.endsWith('.ts') || path.endsWith('.mts') || path.endsWith('.cts')) return 'ts'
  if (path.endsWith('.jsx')) return 'jsx'
  return 'js'
}

// Rung 1: parse a single file. Returns { ok, error } — error is a one-line syntax message.
export async function parseFile(path, code) {
  if (!CODE_EXT.some(e => path.endsWith(e))) return { ok: true } // css/json/etc not parsed here
  try {
    await transform(code, { loader: loaderFor(path), sourcemap: false, logLevel: 'silent' })
    return { ok: true }
  } catch (e) {
    const msg = (e && e.errors && e.errors[0])
      ? `${e.errors[0].text}${e.errors[0].location ? ` (line ${e.errors[0].location.line})` : ''}`
      : (e instanceof Error ? e.message.split('\n')[0] : String(e))
    return { ok: false, error: msg }
  }
}

// Extract import/re-export/dynamic-import specifiers from one file (types stripped first).
export async function extractImports(path, code) {
  if (!CODE_EXT.some(e => path.endsWith(e))) return []
  await initLexer
  let js
  try {
    const out = await transform(code, { loader: loaderFor(path), sourcemap: false, logLevel: 'silent' })
    js = out.code
  } catch {
    return [] // parse gate already reports the syntax error; nothing to resolve
  }
  try {
    const [imports] = parseImports(js)
    return imports.map(i => i.n).filter(Boolean)
  } catch {
    return []
  }
}

function normalizeRel(importerPath, spec) {
  // POSIX-style join for importerPath's dir + spec (fixtures use forward slashes)
  const dir = importerPath.includes('/') ? importerPath.slice(0, importerPath.lastIndexOf('/')) : ''
  const parts = (dir ? dir.split('/') : []).concat(spec.split('/'))
  const out = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}

// Rung 2: resolve every relative import against the known file set + manifest.
// `fileSet`   = Set of project-relative paths that exist / will exist (written ∪ manifest).
// `hasPackage(spec)` = optional predicate for bare imports (node_modules check). If omitted,
//                bare imports are assumed available (in-sandbox rung verifies packages).
// Returns [{ file, specifier, resolved:false }] for every unresolved relative import.
export function resolveGate(files, fileSet, hasPackage) {
  const failures = []
  for (const { path, imports } of files) {
    for (const spec of imports) {
      const isRelative = spec.startsWith('./') || spec.startsWith('../')
      const isAlias = spec.startsWith('@/') // Vite/tsconfig alias → treat like project-relative from src
      if (isRelative || isAlias) {
        const base = isAlias ? normalizeRel('src/x', spec.replace(/^@\//, './')) : normalizeRel(path, spec)
        const found = RESOLVE_TRY.some(ext => fileSet.has(base + ext))
        if (!found) failures.push({ rung: 'resolve', file: path, specifier: spec, detail: `unresolved import "${spec}" → no file at ${base}(${RESOLVE_TRY.filter(Boolean).join('|')})` })
      } else {
        // bare package import
        if (hasPackage && !hasPackage(spec)) {
          failures.push({ rung: 'resolve', file: path, specifier: spec, detail: `unknown package "${spec}" (not in node_modules)` })
        }
      }
    }
  }
  return failures
}

// Run the in-memory ladder (parse + resolve) over a set of {path, content} files.
// `manifestPaths` = declared files not necessarily written yet (manifest-aware resolve).
// Returns { pass, failures:[{rung,file,...}] }.
export async function runInMemoryGates(fileList, manifestPaths = [], hasPackage) {
  const failures = []
  const withImports = []
  for (const f of fileList) {
    const parsed = await parseFile(f.path, f.content)
    if (!parsed.ok) { failures.push({ rung: 'parse', file: f.path, detail: parsed.error }); continue }
    withImports.push({ path: f.path, imports: await extractImports(f.path, f.content) })
  }
  // fileSet = everything on disk ∪ everything the manifest promises
  const fileSet = new Set([...fileList.map(f => f.path), ...manifestPaths])
  failures.push(...resolveGate(withImports, fileSet, hasPackage))
  return { pass: failures.length === 0, failures }
}
