import { Sandbox } from '@vercel/sandbox'
import { SCAFFOLD_FILES } from './tools/scaffold'

interface WarmEntry {
  sandbox: Sandbox
  sandboxId: string
  createdAt: number
}

const POOL_SIZE = 2
const MAX_AGE_MS = 9 * 60 * 1000

let pool: WarmEntry[] = []
let warming = 0 // number of in-progress warm operations

async function addOne() {
  // Never exceed POOL_SIZE total (ready + in-progress)
  if (warming + pool.length >= POOL_SIZE) return
  warming++
  try {
    const sandbox = await Sandbox.create({ timeout: 600_000, ports: [3000] })
    await sandbox.writeFiles(
      SCAFFOLD_FILES.map(f => ({ path: f.path, content: Buffer.from(f.content, 'utf8') }))
    )
    // bun install (falls back to pnpm if bun unavailable) — runs in background so it's
    // done (or nearly done) by the time this sandbox is assigned to a user request
    sandbox
      .runCommand({ detached: true, cmd: 'bash', args: ['-c', 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'] })
      .then(cmd => cmd.wait())
      .catch(() => {})
    pool.push({ sandbox, sandboxId: sandbox.sandboxId, createdAt: Date.now() })
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

  if (pool.length === 0) {
    fillPool()
    return null
  }

  const entry = pool.shift()!
  // Immediately start refilling so the next user doesn't wait
  fillPool()
  return entry
}

// Begin warming both slots on module import
fillPool()
