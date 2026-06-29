import { NextResponse } from 'next/server'
import { getProject } from '@/lib/projects-db'

// Per-project file storage on ONE shared R2 bucket, isolated by a `${projectId}/` key
// prefix (so we never hit CF's bucket-count limit). Every op is ownership-gated (RLS via
// getProject) AND prefixed by projectId — one project can never touch another's files.
const CF_ID = process.env.CF_ACCOUNT_ID ?? ''
const CF_TOK = process.env.CF_API_TOKEN ?? ''
const BUCKET = 'codemine-storage'
const PUBLIC_HOST = process.env.CM_R2_PUBLIC_HOST ?? '' // set once public access/domain is on

const base = `https://api.cloudflare.com/client/v4/accounts/${CF_ID}/r2/buckets/${BUCKET}`
const H = { Authorization: `Bearer ${CF_TOK}` }

async function owns(projectId: string): Promise<boolean> {
  return !!(await getProject(projectId)) // RLS-scoped to the caller
}
function publicUrl(key: string): string | undefined {
  return PUBLIC_HOST ? `https://${PUBLIC_HOST}/${key}` : undefined
}

// LIST a project's files.
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId || !(await owns(projectId))) return NextResponse.json({ files: [] })
  const res = await fetch(`${base}/objects?prefix=${encodeURIComponent(projectId + '/')}&per_page=1000`, { headers: H, signal: AbortSignal.timeout(15_000) }).catch(() => null)
  if (!res) return NextResponse.json({ files: [] })
  const data = (await res.json()) as { result?: Array<{ key: string; size: number; last_modified: string }> }
  const files = (data.result ?? []).map((o) => ({
    name: o.key.slice(projectId.length + 1),
    key: o.key,
    size: o.size,
    modified: o.last_modified,
    url: publicUrl(o.key),
  }))
  return NextResponse.json({ files, publicEnabled: !!PUBLIC_HOST })
}

// UPLOAD a file (multipart: projectId + file).
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const projectId = form?.get('projectId')?.toString()
  const file = form?.get('file') as File | null
  if (!projectId || !file) return NextResponse.json({ error: 'projectId and file required' }, { status: 400 })
  if (!(await owns(projectId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `${projectId}/${Date.now()}-${safeName}`
  const res = await fetch(`${base}/objects/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': file.type || 'application/octet-stream' },
    body: Buffer.from(await file.arrayBuffer()),
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null)
  if (!res || !res.ok) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  return NextResponse.json({ ok: true, key, url: publicUrl(key) })
}

// DELETE a file — key must start with the caller's projectId prefix.
export async function DELETE(req: Request) {
  const { projectId, key } = (await req.json()) as { projectId?: string; key?: string }
  if (!projectId || !key || !key.startsWith(projectId + '/') || !(await owns(projectId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await fetch(`${base}/objects/${encodeURIComponent(key)}`, { method: 'DELETE', headers: H, signal: AbortSignal.timeout(15_000) }).catch(() => {})
  return NextResponse.json({ ok: true })
}
