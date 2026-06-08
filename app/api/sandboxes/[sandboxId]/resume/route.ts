import { APIError } from '@vercel/sandbox/dist/api-client/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { Sandbox } from '@vercel/sandbox'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sandboxId: string }> }
) {
  const { sandboxId } = await params
  try {
    const sandbox = await Sandbox.get({ sandboxId })

    // Restart dev server in background
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
  } catch (error) {
    if (
      error instanceof APIError &&
      error.json.error.code === 'sandbox_stopped'
    ) {
      return NextResponse.json({ status: 'dead' })
    }
    return NextResponse.json({ status: 'dead' })
  }
}
