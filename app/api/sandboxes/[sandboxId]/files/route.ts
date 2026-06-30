import { NextResponse, type NextRequest } from 'next/server'
import { Sandbox } from '@vercel/sandbox'
import { getCurrentUser } from '@/lib/supabase/server'
import { currentUserOwnsSandbox } from '@/lib/projects-db'
import z from 'zod/v3'

const FileParamsSchema = z.object({
  sandboxId: z.string(),
  path: z.string(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sandboxId: string }> }
) {
  const { sandboxId } = await params
  const fileParams = FileParamsSchema.safeParse({
    path: request.nextUrl.searchParams.get('path'),
    sandboxId,
  })

  if (fileParams.success === false) {
    return NextResponse.json(
      { error: 'Invalid parameters. You must pass a `path` as query' },
      { status: 400 }
    )
  }

  // AUTH + OWNERSHIP — only the owner of this sandbox may read its files (sandboxIds
  // appear in preview URLs, so they're not secrets). Without this, anyone could read
  // another project's .env (its AI token + injected secrets).
  const user = await getCurrentUser()
  if (!user || !(await currentUserOwnsSandbox(sandboxId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // Path guard — code view reads project SOURCE only; never .env (secrets) or outside root.
  const p = fileParams.data.path
  if (p.includes('..') || p.startsWith('/') || /(^|\/)\.env(\.|$)/.test(p)) {
    return NextResponse.json({ error: 'Forbidden path' }, { status: 403 })
  }

  const sandbox = await Sandbox.get(fileParams.data)
  const stream = await sandbox.readFile(fileParams.data)
  if (!stream) {
    return NextResponse.json(
      { error: 'File not found in the Sandbox' },
      { status: 404 }
    )
  }

  return new NextResponse(
    new ReadableStream({
      async pull(controller) {
        for await (const chunk of stream) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })
  )
}
