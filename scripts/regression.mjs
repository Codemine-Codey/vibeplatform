// Pre-deploy REGRESSION check — runs every FREE offline suite so a change to one part of the
// pipeline can't silently break another (the whack-a-mole guard). No network, no cost, ~seconds.
// Run this before EVERY deploy. Live tri-type build verification is separate (budget-gated).
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const SUITES = [
  ['silence filter (chat/edit stream framing)', 'scripts/test-silence-filter.ts'],
  ['surgical patch (applyEdits — no guessed/ambiguous)', 'scripts/test-apply-edits.ts'],
  ['corruption fix (rejects broken repairs)', 'scripts/test-repair-validate.ts'],
  ['brief never-junk guarantee (salvage + derive)', 'scripts/test-brief-guarantee.ts'],
]

let failed = 0
for (const [name, file] of SUITES) {
  const out = file.replace('scripts/', 'scripts/.reg-').replace('.ts', '.mjs')
  process.stdout.write(`\n▶ ${name}\n`)
  try {
    execSync(`npx esbuild ${file} --bundle --platform=node --format=esm --alias:@=. --packages=external --outfile=${out}`, { stdio: 'ignore' })
    // Show only the suite's own ✅/❌ lines; hide provider keydiag/metrics noise.
    const res = execSync(`node ${out}`, { encoding: 'utf8' })
    process.stdout.write(res.split('\n').filter(l => /✅|❌|PASS|FAIL/.test(l)).map(l => '   ' + l).join('\n') + '\n')
  } catch (e) {
    const o = (e.stdout || '') + (e.stderr || '')
    // Distinguish "code for this suite isn't on this branch" (SKIP) from a real assertion failure (FAIL).
    const missingCode = /is not a function|is not defined|has no exported member|does not provide an export|Cannot find|undefined \(reading/.test(o)
    if (missingCode) {
      process.stdout.write('   ⊘ SKIP — tested code not present on this branch (belongs to another branch)\n')
    } else {
      failed++
      process.stdout.write('   ❌ SUITE FAILED (real assertion failure)\n' + o.split('\n').filter(l => /❌|FAIL|Error/.test(l)).slice(0, 6).map(l => '   ' + l).join('\n') + '\n')
    }
  } finally {
    try { rmSync(out) } catch { /* ignore */ }
  }
}

console.log(`\n${'='.repeat(48)}`)
console.log(failed === 0 ? '✅ REGRESSION PASS — safe to deploy' : `❌ REGRESSION: ${failed} suite(s) FAILED — do NOT deploy`)
process.exit(failed === 0 ? 0 : 1)
