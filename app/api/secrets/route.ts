import { NextResponse } from 'next/server'
import { getProject } from '@/lib/projects-db'
import { getAdminSupabase } from '@/lib/supabase/server'
import { encryptSecret } from '@/lib/crypto/secrets'

// Per-project secrets — AES-256 encrypted at rest. Ownership-gated (RLS via getProject).
// The client only ever sees secret NAMES; values are write-only and decrypted only at
// deploy time (server-side) for injection. AI keys do NOT belong here — those use the
// Codemine Codey AI proxy.

async function owns(projectId: string): Promise<boolean> {
  const p = await getProject(projectId) // RLS-scoped to the caller
  return !!p
}

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId || !(await owns(projectId))) return NextResponse.json({ secrets: [] })
  const sb = getAdminSupabase()
  const { data } = await sb.from('project_secrets').select('name, created_at').eq('project_id', projectId).order('created_at', { ascending: false })
  return NextResponse.json({ secrets: data ?? [] })
}

export async function POST(req: Request) {
  const { projectId, name, value } = (await req.json()) as { projectId?: string; name?: string; value?: string }
  if (!projectId || !name || !value) return NextResponse.json({ error: 'projectId, name, value required' }, { status: 400 })
  if (/(^|_)(OPENAI|ANTHROPIC|CLAUDE|GEMINI|GOOGLE_AI|OPENROUTER)(_|$)/i.test(name)) {
    return NextResponse.json({ error: 'AI keys are not stored here — your app uses Codemine Codey AI automatically.' }, { status: 400 })
  }
  if (!(await owns(projectId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const sb = getAdminSupabase()
  const { error } = await sb.from('project_secrets').upsert(
    { project_id: projectId, name: name.trim(), value_encrypted: encryptSecret(value) },
    { onConflict: 'project_id,name' }
  )
  if (error) return NextResponse.json({ error: 'Failed to save secret' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const { projectId, name } = (await req.json()) as { projectId?: string; name?: string }
  if (!projectId || !name || !(await owns(projectId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const sb = getAdminSupabase()
  await sb.from('project_secrets').delete().eq('project_id', projectId).eq('name', name)
  return NextResponse.json({ ok: true })
}
