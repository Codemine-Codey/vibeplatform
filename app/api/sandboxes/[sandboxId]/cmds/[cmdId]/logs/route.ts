import { NextResponse, type NextRequest } from 'next/server'
import { Sandbox } from '@vercel/sandbox'

interface Params {
  sandboxId: string
  cmdId: string
}

// Synthetic, client-only commands that have no real logs in the sandbox.
// 'cm-browser-console' is created by addBrowserError to carry runtime errors —
// trying to fetch it from the sandbox throws and spammed the console with 500s.
const SYNTHETIC_COMMANDS = new Set(['cm-browser-console'])

function emptyStream(): NextResponse {
  return new NextResponse(
    new ReadableStream({
      start(controller) {
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } }
  )
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const logParams = await params
  const encoder = new TextEncoder()

  // Client-synthetic command — no sandbox logs to stream. Return empty, not 500.
  if (SYNTHETIC_COMMANDS.has(logParams.cmdId)) {
    return emptyStream()
  }

  let command
  try {
    const sandbox = await Sandbox.get(logParams)
    command = await sandbox.getCommand(logParams.cmdId)
  } catch {
    // Sandbox paused/gone or command not found yet — return empty gracefully.
    return emptyStream()
  }

  return new NextResponse(
    new ReadableStream({
      async pull(controller) {
        try {
          for await (const logline of command.logs()) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  data: logline.data,
                  stream: logline.stream,
                  timestamp: Date.now(),
                }) + '\n'
              )
            )
          }
        } catch {
          /* stream ended abruptly — close cleanly */
        }
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } }
  )
}
