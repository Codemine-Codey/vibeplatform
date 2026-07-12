import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/supabase/server'

// Temporary auth-debug endpoint. Returns what cookies the server sees + getCurrentUser result.
// Remove after diagnosing the production 401 issue.
export async function GET() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const user = await getCurrentUser()
  return NextResponse.json({
    user: user ? { id: user.id, email: user.email } : null,
    cookieCount: allCookies.length,
    cookieNames: allCookies.map((c) => c.name),
  })
}
