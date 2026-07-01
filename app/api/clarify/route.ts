import { NextResponse } from 'next/server'
import { classifyPrompt } from '@/ai/classifier'
import { generateClarifyQuestions } from '@/ai/clarify-questions'
import { getCurrentUser } from '@/lib/supabase/server'

export const maxDuration = 30

// Personalization questions for a NEW project's first prompt. Returns [] when the prompt is too
// vague to classify (the normal flow handles that) or on any failure — the build then proceeds
// with no questions. Fast (Flash), auth-gated.
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

  const cls = await classifyPrompt(prompt)
  if (cls.clarify || !cls.skill) return NextResponse.json({ questions: [] })
  const questions = await generateClarifyQuestions(prompt, cls.skill)
  return NextResponse.json({ questions })
}
