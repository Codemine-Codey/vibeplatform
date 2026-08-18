import { NextResponse } from 'next/server'
import buildInfo from '@/lib/build-info.json'
import { FILE_GENERATION_MODEL, LEAF_MODEL } from '@/ai/constants'

// Reports the exact commit this deployment was built from. The E2E harness fetches
// this BEFORE any test and refuses to run if it doesn't match the local git HEAD —
// so a test can never silently run against stale code (mechanizes "always test latest").
// force-dynamic so it's never edge-cached to a stale build marker.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({
    commit: (buildInfo as { commit?: string }).commit ?? 'unknown',
    builtAt: (buildInfo as { builtAt?: string }).builtAt ?? null,
    envSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    // Active model config — lets a test confirm the CM_FILE_MODEL / FANOUT_ENABLED env
    // override is actually live on this deployment BEFORE spending money on a build.
    fileModel: FILE_GENERATION_MODEL,
    leafModel: LEAF_MODEL,
    fanout: process.env.FANOUT_ENABLED === 'true',
  })
}
