import { NextResponse } from 'next/server'

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? '77da4568eb934dee94fa9fc54faec977'
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? ''

export async function POST(req: Request) {
  const body = await req.json() as { projectName?: string; domain?: string }
  const { projectName, domain } = body

  if (!projectName || !domain) {
    return NextResponse.json({ error: 'projectName and domain required' }, { status: 400 })
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
