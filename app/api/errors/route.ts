import { FILE_GENERATION_MODEL } from '@/ai/constants'
import { getModelOptions } from '@/ai/gateway'
import { NextResponse } from 'next/server'
import { checkBotId } from 'botid/server'
import { generateText, tool, stepCountIs } from 'ai'
import { linesSchema } from '@/components/error-monitor/schemas'
import { resultSchema } from '@/components/error-monitor/schemas'
import prompt from './prompt.md'
import z from 'zod/v3'

export const maxDuration = 60

export async function POST(req: Request) {
  const checkResult = await checkBotId()
  if (checkResult.isBot) {
    return NextResponse.json({ error: `Bot detected` }, { status: 403 })
  }

  const body = await req.json()
  const parsedBody = linesSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json({ error: `Invalid request` }, { status: 400 })
  }

  let output: { shouldBeFixed: boolean; summary: string; paths: string[] } | null = null

  try {
    await generateText({
      ...getModelOptions(FILE_GENERATION_MODEL),
      system: prompt,
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
