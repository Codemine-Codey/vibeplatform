// Writes lib/build-info.json = { commit, builtAt } so the deployed app can report
// exactly which commit it was built from. The E2E harness compares this to the local
// git HEAD and REFUSES to test on a mismatch — mechanizing "always test latest code".
//
// Commit resolution order (robust across CLI-from-local deploys AND git-integration):
//   1. CM_COMMIT build-env (set explicitly at `vercel deploy --build-env` time — the
//      deterministic source for CLI-from-local deploys, where .git isn't uploaded)
//   2. local `git rev-parse HEAD` (local prebuild / local runs)
//   3. VERCEL_GIT_COMMIT_SHA (git-integration builds)
//   4. preserve the commit already in build-info.json
//   5. 'unknown'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'

const OUT = new URL('../lib/build-info.json', import.meta.url)

let commit = process.env.CM_COMMIT || ''
if (!commit) { try { commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { /* no git */ } }
if (!commit) commit = process.env.VERCEL_GIT_COMMIT_SHA || ''
if (!commit && existsSync(OUT)) {
  try { commit = JSON.parse(readFileSync(OUT, 'utf8')).commit || '' } catch { /* ignore */ }
}
if (!commit) commit = 'unknown'

writeFileSync(OUT, JSON.stringify({ commit, builtAt: new Date().toISOString() }, null, 2) + '\n')
console.log('[build-info]', commit.slice(0, 8))
