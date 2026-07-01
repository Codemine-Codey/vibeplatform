import { NextResponse } from 'next/server'
import { getProject, saveChatMessages } from '@/lib/projects-db'

export const maxDuration = 20

// Persist the conversation for a project so a later "open" restores the chat, not just the
// files. Owner-gated via getProject (RLS). Called by the client after each completed turn.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await getProject(id) // RLS — only the owner's row is returned
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  let messages: unknown[] = []
  try {
    const body = (await req.json()) as { messages?: unknown[] }
    messages = Array.isArray(body.messages) ? body.messages : []
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  await saveChatMessages(id, messages)
  return NextResponse.json({ ok: true })
}
