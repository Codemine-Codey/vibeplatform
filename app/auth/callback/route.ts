import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

// OAuth (Google) redirect target. Supabase sends the user back here with a `code`
// that we exchange for a real session cookie, then forward them into the builder.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await getServerSupabase()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — send them back to login with a flag we can surface.
  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
