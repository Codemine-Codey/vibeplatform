import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/supabase/server'

// Temporary auth-debug endpoint. Returns request headers + cookies + getCurrentUser result.
// Remove after diagnosing the production 401 issue.
export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const user = await getCurrentUser()

  // Echo relevant headers the server actually received
  const headers: Record<string, string> = {}
  for (const [k, v] of req.headers.entries()) {
    if (/^(cookie|authorization|x-forwarded|host|content-type)$/i.test(k)) {
      headers[k] = k.toLowerCase() === 'cookie' ? `[${v.length} chars]` : v
    }
  }

  return NextResponse.json({
    user: user ? { id: user.id, email: user.email } : null,
    cookieCount: allCookies.length,
    cookieNames: allCookies.map((c) => c.name),
    headers,
  })
}
