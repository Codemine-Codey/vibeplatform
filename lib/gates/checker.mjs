// ── Deterministic gate ladder — in-memory rungs (parse + resolve) ─────────────
// These run PLATFORM-SIDE on file content BEFORE anything is written to the sandbox,
// so a bad file never lands. Zero LLM calls, zero sandbox round-trips, milliseconds.
//
// Shared source of truth: imported by the replay harness (scripts/replay-fixtures.mjs)
// AND by the build pipeline (Phase 2). Written as .mjs (+ checker.d.ts) so both a plain
// node script and the Next/TS build can import it without a transpile step.
//
// Rung 1 — PARSE:   TypeScript transpileModule reports syntax errors / truncated files.
// Rung 2 — RESOLVE: every relative import must resolve to a file in
//                   (written-files ∪ manifest ∪ node_modules). An import that resolves
//                   to NONE of those is the hallucination / missing-file signal
//                   (this is exactly tonight's `./pages/Game` and the ReservationForm
//                   vs ReservationPreview class of bug).
//
// Uses the `typescript` package (pure JS, already a dependency) — NOT esbuild/swc,
// whose native binaries cannot be bundled into the Next serverless function (the
// esbuild.exe / chromium-not-traced class of failure). Pure JS = identical behaviour
// in the node harness AND the bundled pipeline.
import ts from 'typescript'

const CODE_EXT = ['.tsx', '.ts', '.jsx', '.js', '.mts', '.mjs', '.cts', '.cjs']
const RESOLVE_TRY = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '/index.tsx', '/index.ts', '/index.jsx', '/index.js']

// Scaffold @/ specifiers that ALWAYS resolve (pre-written in every sandbox, on disk
// but in neither the written-set nor the manifest). Seeding these is what stops the
// resolve rung from crying wolf on 100% of real builds (every app imports shadcn/ui).
// Kept in sync with SCAFFOLD_AT_PATHS in ai/tools/generate-files/import-gate.ts.
export const SCAFFOLD_RESOLVABLE = new Set([
  '@/lib/utils',
  '@/components/ui/button', '@/components/ui/card', '@/components/ui/input',
  '@/components/ui/label', '@/components/ui/badge', '@/components/ui/textarea',
  '@/components/ui/separator', '@/components/ui/select', '@/components/ui/dialog',
  '@/components/ui/tabs', '@/components/ui/accordion', '@/components/ui/dropdown-menu',
  '@/components/ui/switch', '@/components/ui/slider', '@/components/ui/tooltip',
  '@/components/ui/avatar', '@/components/ui/progress', '@/components/ui/table',
  '@/components/ui/checkbox', '@/components/ui/popover', '@/components/ui/scroll-area',
  '@/components/ui/radio-group', '@/components/ui/sheet', '@/components/ui/skeleton',
  '@/components/ui/alert', '@/components/ui/toast',
  '@/components/blocks', '@/components/blocks/index', '@/components/blocks/sections',
  '@/components/game/engine', '@/components/NotFound',
])

// Rung 1: parse a single file. Returns { ok, error } — error is a one-line syntax message.
// transpileModule reports SYNTACTIC diagnostics only (no type info / no cross-file) —
// exactly the parse rung's job. Type errors are the separate in-sandbox tsc rung.
export async function parseFile(path, code) {
  if (!CODE_EXT.some(e => path.endsWith(e))) return { ok: true } // css/json/etc not parsed here
  const out = ts.transpileModule(code, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      isolatedModules: false,
      noEmit: true,
    },
  })
  const errs = (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error)
  if (errs.length === 0) return { ok: true }
  const d = errs[0]
  let where = ''
  if (d.file && typeof d.start === 'number') {
    const { line } = d.file.getLineAndCharacterOfPosition(d.start)
    where = ` (line ${line + 1})`
  }
  const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ')
  return { ok: false, error: `${msg}${where}` }
}

// Extract import/re-export/dynamic-import specifiers from one file. ts.preProcessFile is
// a fast scanner that returns every imported specifier (static, re-export, and dynamic)
// without a full parse — pure JS, no native binary.
export async function extractImports(path, code) {
  if (!CODE_EXT.some(e => path.endsWith(e))) return []
  try {
    const pre = ts.preProcessFile(code, /*readImportFiles*/ true, /*detectJavaScriptImports*/ true)
    return pre.importedFiles.map(f => f.fileName).filter(Boolean)
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

// Rung 2: resolve every RELATIVE (./ ../) and ALIAS (@/) import against the known
// file set. Bare package imports are NOT flagged here (record-only): the KNOWN_PACKAGES
// pre-declare + installMissingModules catch-all own that problem, and blocking on a bare
// specifier at generation time would false-positive constantly.
//   fileSet          = project-relative paths that exist / will exist (written ∪ manifest ∪ scaffold-real)
//   scaffoldAliases  = @/ specifiers that always resolve (shadcn/ui etc.)
// Returns [{ rung:'resolve', file, specifier, detail }] for every unresolved local import.
export function resolveGate(files, fileSet, scaffoldAliases = SCAFFOLD_RESOLVABLE) {
  const failures = []
  for (const { path, imports } of files) {
    for (const spec of imports) {
      const isRelative = spec.startsWith('./') || spec.startsWith('../')
      const isAlias = spec.startsWith('@/')
      if (!isRelative && !isAlias) continue // bare package → record-only, not flagged here
      // Scaffold @/ imports (and their /index form) always resolve.
      if (isAlias) {
        const norm = spec.replace(/\/index$/, '')
        if (scaffoldAliases.has(spec) || scaffoldAliases.has(norm) || scaffoldAliases.has(norm + '/index')) continue
      }
      const base = isAlias ? normalizeRel('src/x', spec.replace(/^@\//, './')) : normalizeRel(path, spec)
      const found = RESOLVE_TRY.some(ext => fileSet.has(base + ext))
      if (!found) failures.push({ rung: 'resolve', file: path, specifier: spec, detail: `unresolved import "${spec}" → no file at ${base}(${RESOLVE_TRY.filter(Boolean).join('|')})` })
    }
  }
  return failures
}

// Run the in-memory ladder (parse + resolve) over a set of {path, content} files.
// `manifestPaths` = declared files not necessarily written yet (manifest-aware resolve).
// Returns { pass, failures:[{rung,file,...}] }.
export async function runInMemoryGates(fileList, manifestPaths = [], scaffoldAliases = SCAFFOLD_RESOLVABLE) {
  const failures = []
  const withImports = []
  for (const f of fileList) {
    const parsed = await parseFile(f.path, f.content)
    if (!parsed.ok) { failures.push({ rung: 'parse', file: f.path, detail: parsed.error }); continue }
    withImports.push({ path: f.path, imports: await extractImports(f.path, f.content) })
  }
  const fileSet = new Set([...fileList.map(f => f.path), ...manifestPaths])
  failures.push(...resolveGate(withImports, fileSet, scaffoldAliases))
  return { pass: failures.length === 0, failures }
}

// ── The write-gate stage (Phase 2, per Fable's two-strictness design) ─────────
// Pure function — no sandbox, no side effects — so it's fully harness-testable at $0.
// PARSE = hard block (a non-parsing file is withheld; the caller stubs+repairs it, so a
//         syntax error becomes "one file to fix" instead of "Vite compile error blanks all").
// RESOLVE = OBSERVER at write time (records unresolved local imports; does NOT block —
//         the import-closure legitimately imports not-yet-written files). The END-OF-
//         GENERATION resolve (against real disk) is the hard gate; this just surfaces the
//         signal deterministically for that gate + repair.
//   files          : [{ path, content }] about to be written (already patched)
//   manifestPaths  : declared manifest file paths
//   generatedPaths : all paths declared in this generateFiles call
//   scaffoldAliases: @/ specifiers that always resolve (defaults to SCAFFOLD_RESOLVABLE)
// Returns { toWrite:[{path,content}], blocked:[{file,error}], unresolved:[{file,specifier,detail}] }
export async function prepareWriteGate(files, { manifestPaths = [], generatedPaths = [], scaffoldAliases = SCAFFOLD_RESOLVABLE } = {}) {
  const toWrite = []
  const blocked = []
  const okWithImports = []
  for (const f of files) {
    const parsed = await parseFile(f.path, f.content)
    if (!parsed.ok) { blocked.push({ file: f.path, error: parsed.error }); continue }
    toWrite.push(f)
    okWithImports.push({ path: f.path, imports: await extractImports(f.path, f.content) })
  }
  const fileSet = new Set([...files.map(f => f.path), ...manifestPaths, ...generatedPaths])
  const unresolved = resolveGate(okWithImports, fileSet, scaffoldAliases)
    .map(({ file, specifier, detail }) => ({ file, specifier, detail }))
  return { toWrite, blocked, unresolved }
}
