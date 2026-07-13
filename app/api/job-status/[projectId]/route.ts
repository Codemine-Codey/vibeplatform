import { NextResponse } from 'next/server'
import { getProject } from '@/lib/projects-db'

// Poll endpoint for client reconnection after a dropped stream.
// The preview_url is persisted to the project row the moment the dev server starts —
// so even if the Vercel function cap kills the SSE stream, the client can recover
// the URL here and show the project without requiring a full rebuild.
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

  // getProject is RLS-scoped — only the owner's row is returned, so no auth check needed.
  const project = await getProject(projectId)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const status = project.preview_url ? 'ready' : 'pending'
  return NextResponse.json({
    status,
    preview_url: project.preview_url ?? null,
    sandbox_id: project.sandbox_id ?? null,
  })
}
