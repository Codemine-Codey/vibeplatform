import { NextRequest, NextResponse } from 'next/server'
import { Sandbox } from '@vercel/sandbox'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sandboxId: string }> }
) {
  const { sandboxId } = await params
  try {
    const sandbox = await Sandbox.get({ sandboxId })

    // Verify the sandbox can actually execute commands before claiming success
    try {
      await sandbox.runCommand({ cmd: 'echo', args: ['alive'] })
    } catch {
      return NextResponse.json({ status: 'dead' })
    }

    // Start dev server in background (fire-and-forget — takes ~10s to boot)
    sandbox
      .runCommand({
        detached: true,
        cmd: 'bash',
        args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'],
      })
      .then(cmd => cmd.wait())
      .catch(() => {})

    const url = sandbox.domain(3000)
    return NextResponse.json({ status: 'ok', url })
  } catch {
    return NextResponse.json({ status: 'dead' })
  }
}
