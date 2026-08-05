import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Run on all pages EXCEPT static assets, API routes, and Workflow SDK callbacks.
  // .well-known/workflow/* must be excluded — it's the engine's internal step/flow
  // webhook route; auth middleware would 401 it and silently kill every workflow step.
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|\\.well-known/workflow/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
