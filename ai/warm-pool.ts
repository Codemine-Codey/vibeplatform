import { Sandbox } from '@vercel/sandbox'
import { SCAFFOLD_FILES } from './tools/scaffold'

interface WarmEntry {
  sandbox: Sandbox
  sandboxId: string
  createdAt: number
}

// 9 minutes — 1 min safety margin below the 10-min sandbox timeout
const MAX_AGE_MS = 9 * 60 * 1000

let warmEntry: WarmEntry | null = null
let warming = false

async function warm() {
  if (warming || warmEntry) return
  warming = true
  try {
    const sandbox = await Sandbox.create({ timeout: 600_000, ports: [3000] })
    await sandbox.writeFiles(
      SCAFFOLD_FILES.map(f => ({ path: f.path, content: Buffer.from(f.content, 'utf8') }))
    )
    // Start pnpm install in background so it's done (or near-done) by the time a request uses this sandbox
    sandbox
      .runCommand({ detached: true, cmd: 'pnpm', args: ['install'] })
      .then(cmd => cmd.wait())
      .catch(() => {})
    warmEntry = { sandbox, sandboxId: sandbox.sandboxId, createdAt: Date.now() }
  } catch {
    // Ignore — pipeline will fall back to fresh creation
  } finally {
    warming = false
  }
}

export function getWarmEntry(): WarmEntry | null {
  if (!warmEntry) return null
  if (Date.now() - warmEntry.createdAt > MAX_AGE_MS) {
    warmEntry = null
    warm().catch(() => {})
    return null
  }
  const entry = warmEntry
  warmEntry = null
  // Replenish immediately in background
  warm().catch(() => {})
  return entry
}

// Begin warming on module import (fires on first request to this route)
warm().catch(() => {})
