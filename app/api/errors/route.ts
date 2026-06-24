import { ERROR_MODEL } from '@/ai/constants'
import { getModelOptions } from '@/ai/gateway'
import { NextResponse } from 'next/server'
import { generateText, tool, stepCountIs } from 'ai'
import { linesSchema } from '@/components/error-monitor/schemas'
import { resultSchema } from '@/components/error-monitor/schemas'
import prompt from './prompt.md'
import z from 'zod/v3'

export const maxDuration = 60

export async function POST(req: Request) {
  // BotID removed (see chat/route.ts) — was silently blocking requests in production.
  const body = await req.json()
  const parsedBody = linesSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json({ error: `Invalid request` }, { status: 400 })
  }

  let output: { shouldBeFixed: boolean; summary: string; paths: string[] } | null = null

  try {
    const { providerOptions, ...modelOpts } = getModelOptions(ERROR_MODEL)
    await generateText({
      ...modelOpts,
      // System prompt is static — mark as ephemeral cache for Anthropic (reused across requests)
      system: prompt,
      providerOptions,
      messages: [{ role: 'user', content: JSON.stringify(parsedBody.data) }],
      tools: {
        report_errors: tool({
          description: 'Report the error analysis result',
          inputSchema: z.object({
            shouldBeFixed: z.boolean(),
            summary: z.string(),
            paths: z.array(z.string()),
          }),
          execute: async (args) => {
            output = args
            return 'reported'
          },
        }),
      },
      stopWhen: stepCountIs(2),
    })
  } catch (err) {
    console.error('[errors] Error analysis failed:', err)
    return NextResponse.json({ shouldBeFixed: false, summary: '', paths: [] }, { status: 200 })
  }

  if (!output) {
    return NextResponse.json(
      { shouldBeFixed: false, summary: '', paths: [] },
      { status: 200 }
    )
  }

  const parsed = resultSchema.safeParse(output)
  return NextResponse.json(parsed.success ? parsed.data : output, { status: 200 })
}
