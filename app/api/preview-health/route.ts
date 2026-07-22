import { NextRequest, NextResponse } from 'next/server'

// Same-origin health probe for a preview sandbox URL. The preview iframe is cross-origin,
// so the browser can't read its HTTP status; this proxies a HEAD/GET server-side and reports
// whether the sandbox dev server is alive. The client polls this while a preview is shown and,
// if it goes dead (sandbox expired / dev server died), reopens the project from its snapshot
// into a fresh sandbox (POST /api/projects/[id]/open) and swaps the iframe URL — so a returning
// user never sits on a dead 502 preview.
export const maxDuration = 20

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url || !/^https:\/\/[\w.-]+\.vercel\.run\/?/.test(url)) {
    return NextResponse.json({ alive: false, error: 'bad url' }, { status: 400 })
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'manual' })
    // 502/503/504 = the sandbox proxy has no healthy upstream (dev server dead / VM gone).
    const alive = res.status !== 502 && res.status !== 503 && res.status !== 504
    return NextResponse.json({ alive, status: res.status })
  } catch {
    // Network error / timeout — treat as not alive so the client can recover.
    return NextResponse.json({ alive: false, status: 0 })
  }
}
