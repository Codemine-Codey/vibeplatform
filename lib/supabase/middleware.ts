import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Pages reachable without being signed in. Marketing + legal pages live here so
// logged-out visitors can browse them; the auth pages are also public.
const PUBLIC_PATHS = ['/login', '/signup', '/auth', '/home', '/about', '/pricing', '/terms', '/privacy']
// Auth pages a signed-in user has no reason to see — they get bounced to the builder.
const AUTH_PATHS = ['/login', '/signup']

// Refreshes the Supabase auth session on every request and enforces the auth wall:
// unauthenticated users are redirected to /login; signed-in users on an auth page
// are sent to the builder. API routes are excluded (see matcher) — they handle auth
// themselves where needed.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p))
  const isAuthPage = AUTH_PATHS.some((p) => path.startsWith(p))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  // Only the auth pages bounce a signed-in user away — marketing/legal pages stay
  // viewable whether or not you're logged in.
  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}
