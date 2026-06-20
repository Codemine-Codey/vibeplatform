import { NextResponse } from 'next/server'
import { Sandbox } from '@vercel/sandbox'

// Kill a sandbox early to stop paying for idle provisioned memory. Called by the
// client "kill-on-leave" beacon when the user closes the tab or navigates away —
// abandoned sessions die immediately instead of running out the 30-min ceiling.
// Accepts sendBeacon (which posts as text/plain), so we parse the body leniently.
export async function POST(req: Request) {
  let sandboxId: string | undefined
  try {
    const raw = await req.text()
    sandboxId = raw ? (JSON.parse(raw) as { sandboxId?: string }).sandboxId : undefined
  } catch {
    /* malformed body — nothing to stop */
  }
  if (!sandboxId) return NextResponse.json({ ok: false }, { status: 200 })

  try {
    const sandbox = await Sandbox.get({ sandboxId })
    await sandbox.stop()
    return NextResponse.json({ ok: true })
  } catch {
    // Already gone / expired / not found — treat as success (the goal is "not running").
    return NextResponse.json({ ok: true })
  }
}
