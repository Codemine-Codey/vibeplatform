import { NextResponse } from 'next/server'
import { generateClarifyQuestions } from '@/ai/clarify-questions'
import { getCurrentUser } from '@/lib/supabase/server'

export const maxDuration = 30

// Personalization questions for a NEW project's first prompt. ONE model call (the generator infers
// the project type itself) so it stays fast — the previous classify+generate pair timed out (504).
// Returns [] on any failure so the build proceeds with no questions. Auth-gated.
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ questions: [] })
  let prompt = ''
  try {
    const body = (await req.json()) as { prompt?: string }
    prompt = (body.prompt ?? '').trim()
  } catch {
    return NextResponse.json({ questions: [] })
  }
  if (!prompt) return NextResponse.json({ questions: [] })

  const questions = await generateClarifyQuestions(prompt)
  return NextResponse.json({ questions })
}
