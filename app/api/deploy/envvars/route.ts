import { NextResponse } from 'next/server'

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? '77da4568eb934dee94fa9fc54faec977'
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? ''

export async function POST(req: Request) {
  const body = await req.json() as { projectName?: string; vars?: Record<string, string> }
  const { projectName, vars } = body

  if (!projectName || !vars || typeof vars !== 'object') {
    return NextResponse.json({ error: 'projectName and vars required' }, { status: 400 })
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
