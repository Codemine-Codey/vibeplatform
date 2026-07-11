// Silent repair API — Lovable-style background fix agent.
// Called by the client-side ErrorMonitor when it detects a runtime error in the preview.
// Unlike sending to chat (which streams visible AI text), this endpoint:
//   1. Reads the broken files from the sandbox
//   2. Runs repairFile (DeepSeek Flash, 45s budget, no streaming)
//   3. Writes fixed content back to sandbox directly
//   4. Returns 200 — HMR picks up the change and refreshes the preview silently
// The user NEVER sees any chat message, AI narration, or "Polishing" indicator.
// This is the true Lovable-style silent heal.

import { Sandbox } from '@vercel/sandbox'
import { NextResponse } from 'next/server'
import { readSandboxFile, repairFile } from '@/lib/sandbox-util'
import { ensureValidCss } from '@/lib/css-guard'
import { logRepair } from '@/lib/telemetry'

export const maxDuration = 60

// Rate-limit: at most one silent repair per sandboxId per 30s
const lastRepairTime = new Map<string, number>()

export async function POST(request: Request) {
  let sandboxId: string | undefined
  let error: string | undefined
  let paths: string[] | undefined

  try {
    const body = await request.json()
    sandboxId = typeof body.sandboxId === 'string' ? body.sandboxId : undefined
    error = typeof body.error === 'string' ? body.error : undefined
    paths = Array.isArray(body.paths) ? body.paths.filter((p: unknown) => typeof p === 'string') : undefined
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  if (!sandboxId || !error) {
    return NextResponse.json({ error: 'missing sandboxId or error' }, { status: 400 })
  }

  // Rate-limit: one repair per sandbox per 30s
  const now = Date.now()
  const last = lastRepairTime.get(sandboxId) ?? 0
  if (now - last < 30_000) {
    return NextResponse.json({ skipped: 'rate-limited' }, { status: 200 })
  }
  lastRepairTime.set(sandboxId, now)

  // Default repair targets if none provided
  const repairPaths = (paths && paths.length > 0)
    ? paths.slice(0, 4)
    : ['src/App.tsx', 'src/index.css', 'src/pages/Home.tsx']

  try {
    let sandbox: Sandbox
    try {
      sandbox = await Sandbox.get({ sandboxId })
    } catch {
      // Sandbox expired or unavailable — nothing to repair
      return NextResponse.json({ skipped: 'sandbox-unavailable' }, { status: 200 })
    }

    let repairedAny = false
    for (const path of repairPaths) {
      try {
        const content = await readSandboxFile(sandbox, path)
        if (!content) continue
        const fixed = await repairFile(path, content, error)
        if (fixed && fixed !== content) {
          const finalContent = path.endsWith('.css') ? ensureValidCss(fixed) : fixed
          await sandbox.writeFiles([{ path, content: Buffer.from(finalContent, 'utf8') }])
          repairedAny = true
          logRepair({ layer: 'silent-repair', action: 'patched', detail: `${path}: ${error.slice(0, 100)}`, sandboxId })
        }
      } catch {
        // Non-fatal — continue to next file
      }
    }

    return NextResponse.json({ ok: true, repairedAny })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logRepair({ layer: 'silent-repair', action: 'error', detail: msg.slice(0, 200), sandboxId })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
