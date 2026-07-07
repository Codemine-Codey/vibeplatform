import { Sandbox } from '@vercel/sandbox'
import { SCAFFOLD_FILES } from './tools/scaffold'

interface WarmEntry {
  sandbox: Sandbox
  sandboxId: string
  createdAt: number
  ready: boolean // true only after scaffold deps finished installing
}

const POOL_SIZE = 2
// A warm sandbox may sit up to MAX_AGE_MS before being handed to a build, so its lifetime
// must comfortably cover (idle wait + full build). Sandboxes are created with a 30-min
// timeout (below); evict from the pool after 8 min idle so an assigned one still has ≥22 min
// of runtime for the build + edits — never the ~1-min-left sandbox that timed builds out at 10m.
const MAX_AGE_MS = 8 * 60 * 1000
const SANDBOX_TIMEOUT_MS = 45 * 60 * 1000

let pool: WarmEntry[] = []
let warming = 0 // number of in-progress warm operations

async function addOne() {
  // Never exceed POOL_SIZE total (ready + in-progress)
  if (warming + pool.length >= POOL_SIZE) return
  warming++
  try {
    const sandbox = await Sandbox.create({ timeout: SANDBOX_TIMEOUT_MS, ports: [3000] })
    await sandbox.writeFiles(
      SCAFFOLD_FILES.map(f => ({ path: f.path, content: Buffer.from(f.content, 'utf8') }))
    )
    const entry: WarmEntry = { sandbox, sandboxId: sandbox.sandboxId, createdAt: Date.now(), ready: false }
    pool.push(entry)
    // Install the base deps, then flip ready=true. getWarmEntry only hands out
    // READY sandboxes, so a user never receives one mid-install (the reliability
    // fix). This is the whole point of the pool: the ~70s base install is already
    // done before the sandbox is assigned.
    sandbox
      .runCommand({ detached: true, cmd: 'bash', args: ['-c', 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'] })
      .then(cmd => cmd.wait())
      .then(() => { entry.ready = true })
      .catch(() => {
        // Install failed — drop this entry so it's never handed out broken.
        pool = pool.filter(e => e !== entry)
        fillPool()
      })
  } catch {
    // Non-fatal — pipeline falls back to fresh creation
  } finally {
    warming--
    fillPool()
  }
}

function fillPool() {
  const needed = POOL_SIZE - pool.length - warming
  for (let i = 0; i < needed; i++) {
    addOne().catch(() => {})
  }
}

export function getWarmEntry(): WarmEntry | null {
  // Evict expired entries
  const now = Date.now()
  pool = pool.filter(e => now - e.createdAt <= MAX_AGE_MS)

  // Only hand out a sandbox whose deps finished installing. If none are ready yet,
  // return null (the caller creates a fresh one) — never a half-installed sandbox.
  const idx = pool.findIndex(e => e.ready)
  if (idx === -1) {
    fillPool()
    return null
  }

  const [entry] = pool.splice(idx, 1)
  // Immediately start refilling so the next user doesn't wait
  fillPool()
  return entry
}

// Only pre-warm when WARM_POOL=true. Enabled for launch (instant sandboxes, no
// ~70s install wait). Each idle sandbox costs provisioned memory until used —
// acceptable for the speed win.
if (process.env.WARM_POOL === 'true') fillPool()
