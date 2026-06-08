import { NextRequest, NextResponse } from 'next/server'
import { Sandbox } from '@vercel/sandbox'

/**
 * We must change the SDK to add data to the instance and then
 * use it to retrieve the status of the Sandbox.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sandboxId: string }> }
) {
  const { sandboxId } = await params
  try {
    const sandbox = await Sandbox.get({ sandboxId })
    const isRunning = sandbox.status === 'running' || sandbox.status === 'pending'
    return NextResponse.json({ status: isRunning ? 'running' : 'stopped' })
  } catch {
    return NextResponse.json({ status: 'stopped' })
  }
}
