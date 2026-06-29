import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase/server'

export const maxDuration = 60

// ── Codemine-AI-Support — the ONLY AI a generated app may use ─────────────────
// User apps call this with their per-project AI token (never a raw provider key).
// We forward to OpenRouter pinned to DeepSeek V4 Flash (whitelabeled — the app/user
// never sees the provider), meter the usage, and (later) deduct credits. User-supplied
// AI keys are refused at the app level (the builder is instructed never to use them).
// OpenAI-compatible Chat Completions shape, so generated apps integrate trivially.

const PLATFORM_AI_KEY = process.env.CODEMINE_AI_KEY ?? '' // platform OpenRouter key (set later)
const AI_MODEL = 'deepseek/deepseek-v4-flash'           // the only model user apps get

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export function OPTIONS() {
  return new Response(null, { headers: CORS })
}

export async function POST(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Missing Codemine AI token' }, { status: 401, headers: CORS })
  if (!PLATFORM_AI_KEY) return NextResponse.json({ error: 'AI is not configured yet' }, { status: 503, headers: CORS })

  const sb = getAdminSupabase()

  // Validate the per-project token → the owning project + user.
  const { data: project } = await sb.from('projects').select('id, user_id').eq('ai_token', token).single()
  if (!project) return NextResponse.json({ error: 'Invalid Codemine AI token' }, { status: 401, headers: CORS })

  // Credits gate — enforcement turns on once pricing is set; for now we meter only.
  const { data: credits } = await sb.from('user_credits').select('balance').eq('user_id', project.user_id).single()
  const balance = Number(credits?.balance ?? 0)
  // if (balance <= 0) return NextResponse.json({ error: 'Out of AI credits' }, { status: 402, headers: CORS })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: CORS }) }

  // Force the model + provider — user apps ONLY get DeepSeek V4 Flash, whitelabeled.
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PLATFORM_AI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      model: AI_MODEL,
      provider: { order: ['DeepSeek'], allow_fallbacks: true },
    }),
    signal: AbortSignal.timeout(55_000),
  }).catch(() => null)

  if (!upstream) return NextResponse.json({ error: 'AI service unavailable' }, { status: 502, headers: CORS })

  const data = (await upstream.json().catch(() => ({}))) as { usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string }

  // Meter usage (credits deduction wired but zero until pricing is set).
  const inTok = data.usage?.prompt_tokens ?? 0
  const outTok = data.usage?.completion_tokens ?? 0
  sb.from('ai_usage').insert({
    user_id: project.user_id, project_id: project.id, model: 'codemine-ai-support',
    tokens_in: inTok, tokens_out: outTok, credits_used: 0,
  }).then(() => {}, () => {})

  // Whitelabel: never expose the underlying model/provider name to the app.
  if (data.model) data.model = 'codemine-ai-support'
  return NextResponse.json(data, { status: upstream.status, headers: CORS })
}
