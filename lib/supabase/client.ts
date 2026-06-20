'use client'

import { createBrowserClient } from '@supabase/ssr'

// Browser client — uses the public anon key, constrained by RLS. Safe to ship to
// the client. Memoized so we don't create a new client on every render.
let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function getBrowserSupabase() {
  if (browserClient) return browserClient
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return browserClient
}
