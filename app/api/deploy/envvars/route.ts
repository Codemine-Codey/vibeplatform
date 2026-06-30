import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { currentUserOwnsSandbox } from '@/lib/projects-db'

// NO hardcoded account fallback (the old one was PrompttoApp's, a cross-project leak).
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? ''
function deployProjectName(sandboxId: string) {
  return 'cm-' + sandboxId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)
}

export async function POST(req: Request) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    return NextResponse.json({ error: 'Deploy service not configured' }, { status: 500 })
  }
  const body = await req.json() as { sandboxId?: string; vars?: Record<string, string> }
  const { sandboxId, vars } = body

  // AUTH + OWNERSHIP — derive the Pages project name from a sandboxId the caller OWNS,
  // never trust a client-supplied projectName (anyone could overwrite another app's env).
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!sandboxId || !(await currentUserOwnsSandbox(sandboxId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const projectName = deployProjectName(sandboxId)
  if (!vars || typeof vars !== 'object') {
    return NextResponse.json({ error: 'vars required' }, { status: 400 })
  }

  const envVars: Record<string, { type: string; value: string }> = {}
  for (const [key, value] of Object.entries(vars)) {
    if (key.trim()) {
      envVars[`VITE_${key.trim().toUpperCase().replace(/\s+/g, '_')}`] = { type: 'plain_text', value: String(value) }
    }
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_configs: {
          production: { env_vars: envVars },
        },
      }),
    }
  )

  const data = await res.json() as { success: boolean; errors?: { message: string }[] }

  if (!res.ok || !data.success) {
    return NextResponse.json({ error: data.errors?.[0]?.message ?? 'Failed to save variables' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
