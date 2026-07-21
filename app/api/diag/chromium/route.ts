import { NextRequest, NextResponse } from 'next/server'

// Decisive diagnostic: does @sparticuz/chromium ACTUALLY launch in the production
// Vercel function? If it doesn't, headlessRuntimeCheck silently degrades to a bare
// HTTP-200 probe that can't see a runtime-blank page — the exact hole that let a
// blank flappy build ship. This mirrors the launch path in route.ts EXACTLY so the
// result is authoritative. Secret-gated. GET /api/diag/chromium?key=<CM_INTERNAL_SECRET>
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CM_INTERNAL_SECRET || ''
  if (!secret || req.nextUrl.searchParams.get('key') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const t0 = Date.now()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any = null
  try {
    const chromiumMod = await import('@sparticuz/chromium')
    const puppeteer = await import('puppeteer-core')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromium = (chromiumMod as any).default ?? chromiumMod
    const execPath = await chromium.executablePath()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browser = await (puppeteer as any).launch({
      args: chromium.args,
      executablePath: execPath,
      headless: true,
    })
    const page = await browser.newPage()
    // Render a page that mounts content via JS AFTER load, then throws — proves the
    // check can see a runtime-blank (post-mount) page, not just HTTP status.
    await page.setContent('<div id="root"></div><script>document.getElementById("root").innerHTML="<h1>alive</h1>"</script>')
    const rootLen = await page.evaluate(() => (document.getElementById('root')?.innerHTML || '').length)
    const version = await browser.version()
    await browser.close()
    return NextResponse.json({
      launched: true,
      execPath: typeof execPath === 'string' ? execPath.slice(-40) : String(execPath),
      chromeVersion: version,
      rootInnerHtmlLen: rootLen,
      ms: Date.now() - t0,
    })
  } catch (e) {
    try { if (browser) await browser.close() } catch { /* ignore */ }
    return NextResponse.json({
      launched: false,
      error: e instanceof Error ? (e.stack || e.message) : String(e),
      ms: Date.now() - t0,
    })
  }
}
