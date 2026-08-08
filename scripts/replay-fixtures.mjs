// ── Golden-fixture replay harness (Phase 1) ──────────────────────────────────
// Replays every fixture under scripts/fixtures/* through the in-memory gate ladder
// (parse + resolve) with ZERO LLM calls and ZERO sandbox round-trips. Each fixture
// carries an expected.json ({ expect: 'pass'|'fail', mustCatch?: [...] }); the harness
// asserts the gates behave as expected and exits non-zero if any fixture regresses.
//
// This is the cheap, repeatable test bed for the whole reliability effort: every real
// failure we hit becomes a fixture here, so it can never silently come back.
//
// Run: node scripts/replay-fixtures.mjs
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, relative, sep } from 'path'
import { fileURLToPath } from 'url'
import { runInMemoryGates, prepareWriteGate } from '../lib/gates/checker.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES_DIR = join(HERE, 'fixtures')
const META = new Set(['README.md', 'manifest.json', 'expected.json'])

function walk(dir, base = dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, base))
    else out.push(full)
  }
  return out
}

function loadFixture(dir) {
  const files = []
  for (const full of walk(dir)) {
    const rel = relative(dir, full).split(sep).join('/')
    if (META.has(rel)) continue
    files.push({ path: rel, content: readFileSync(full, 'utf8') })
  }
  const manifestPath = join(dir, 'manifest.json')
  const expectedPath = join(dir, 'expected.json')
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
  const expected = existsSync(expectedPath) ? JSON.parse(readFileSync(expectedPath, 'utf8')) : { expect: 'pass' }
  const manifestPaths = Array.isArray(manifest.files) ? manifest.files.map(f => f.path) : []
  return { files, manifestPaths, expected }
}

function checkExpectation(expected, result) {
  const problems = []
  const gotPass = result.pass
  const wantPass = expected.expect === 'pass'
  if (gotPass !== wantPass) {
    problems.push(`expected gates to ${expected.expect.toUpperCase()} but they ${gotPass ? 'PASSED' : 'FAILED'}`)
  }
  // Every declared mustCatch must appear in the actual failures.
  for (const mc of expected.mustCatch || []) {
    const hit = result.failures.some(f =>
      f.rung === mc.rung &&
      (!mc.file || f.file === mc.file) &&
      (!mc.specifier || f.specifier === mc.specifier))
    if (!hit) problems.push(`mustCatch not satisfied: ${JSON.stringify(mc)}`)
  }
  // mustNotFlag: these specifiers must NEVER appear as a failure (false-positive guard).
  for (const spec of expected.mustNotFlag || []) {
    if (result.failures.some(f => f.specifier === spec)) {
      problems.push(`FALSE POSITIVE: "${spec}" was flagged but must not be`)
    }
  }
  return problems
}

// Check the write-gate stage (parse=block, resolve=observe) against expected.writeGate.
function checkWriteGate(expected, wg) {
  const problems = []
  const wgSpec = expected.writeGate
  if (!wgSpec) return problems
  for (const f of wgSpec.mustBlock || []) {
    if (!wg.blocked.some(b => b.file === f)) problems.push(`writeGate: expected "${f}" to be BLOCKED (parse) but it was not`)
  }
  for (const f of wgSpec.mustWrite || []) {
    if (!wg.toWrite.some(w => w.path === f)) problems.push(`writeGate: expected "${f}" to be in toWrite but it was not`)
  }
  return problems
}

const t0 = Date.now()
const dirs = readdirSync(FIXTURES_DIR).filter(d => statSync(join(FIXTURES_DIR, d)).isDirectory()).sort()
let allOk = true
console.log(`\n=== Replaying ${dirs.length} fixture(s) — in-memory gate ladder (parse + resolve), no LLM ===\n`)

for (const name of dirs) {
  const { files, manifestPaths, expected } = loadFixture(join(FIXTURES_DIR, name))
  const result = await runInMemoryGates(files, manifestPaths)
  const wg = await prepareWriteGate(files, { manifestPaths, generatedPaths: manifestPaths })
  const problems = [...checkExpectation(expected, result), ...checkWriteGate(expected, wg)]
  const ok = problems.length === 0
  allOk = allOk && ok
  const verdict = ok ? 'OK ✅' : 'REGRESSION ❌'
  console.log(`${verdict}  ${name}  (${files.length} files, gates ${result.pass ? 'pass' : 'fail'}, expected ${expected.expect}; write-gate: ${wg.toWrite.length} write / ${wg.blocked.length} blocked / ${wg.unresolved.length} unresolved)`)
  for (const f of result.failures) console.log(`      ↳ [${f.rung}] ${f.file}${f.specifier ? ` :: ${f.specifier}` : ''} — ${f.detail}`)
  for (const p of problems) console.log(`      ⚠️  ${p}`)
}

const secs = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`\n=== ${allOk ? 'ALL FIXTURES OK' : 'FIXTURE REGRESSIONS DETECTED'} — ${secs}s, $0, zero LLM calls ===\n`)
process.exit(allOk ? 0 : 1)
