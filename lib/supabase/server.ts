import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
// NOTE: `next/headers` is imported LAZILY inside getServerSupabase (below), NOT at the top
// level. This module is in the buildProject import chain, which also runs inside the
// Trigger.dev task (plain Node, no Next runtime). A top-level `import 'next/headers'` throws
// at module load there → getAdminSupabase() (used for every run_events write) becomes
// unreachable → the durable log stays empty → the reaper marks the build abandoned. That was
// the entire "worker build shows nothing" failure. Keep this import lazy.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Per-request server client bound to the signed-in user's auth cookies. All
// queries through this client are constrained by Row-Level Security, so a user
// can only ever read/write their own rows.
export async function getServerSupabase() {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // called from a Server Component where cookies are read-only — safe to ignore;
          // middleware refreshes the session cookie instead.
        }
      },
    },
  })
}

// Service-role admin client — BYPASSES RLS. Server-only, never sent to the browser.
// Used for privileged operations (writing project rows on the user's behalf during
// generation, saving/restoring file snapshots to Storage).
export function getAdminSupabase() {
  return createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Convenience: the currently signed-in user (or null).
// Also accepts Bearer token in Authorization header for server-to-server calls (e.g. test scripts).
export async function getCurrentUser(req?: Request) {
  const bearer = req?.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (bearer) {
    const admin = getAdminSupabase()
    const { data } = await admin.auth.getUser(bearer)
    return data.user ?? null
  }
  const sb = await getServerSupabase()
  const { data } = await sb.auth.getUser()
  return data.user ?? null
}
