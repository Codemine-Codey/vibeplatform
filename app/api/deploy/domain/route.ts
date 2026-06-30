import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { currentUserOwnsSandbox } from '@/lib/projects-db'

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? ''
function deployProjectName(sandboxId: string) {
  return 'cm-' + sandboxId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)
}

export async function POST(req: Request) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    return NextResponse.json({ error: 'Deploy service not configured' }, { status: 500 })
  }
  const body = await req.json() as { sandboxId?: string; domain?: string }
  const { sandboxId, domain } = body

  // AUTH + OWNERSHIP — derive the Pages project from an owned sandboxId, not a client name.
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!sandboxId || !(await currentUserOwnsSandbox(sandboxId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const projectName = deployProjectName(sandboxId)
  if (!domain) {
    return NextResponse.json({ error: 'domain required' }, { status: 400 })
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/domains`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: domain }),
    }
  )

  const data = await res.json() as { success: boolean; result?: unknown; errors?: { message: string }[] }

  if (!res.ok || !data.success) {
    return NextResponse.json({ error: data.errors?.[0]?.message ?? 'Failed to add domain' }, { status: 400 })
  }

  return NextResponse.json({ success: true, cname: `${projectName}.pages.dev` })
}
