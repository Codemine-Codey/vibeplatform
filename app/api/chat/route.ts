import { type ChatUIMessage } from '@/components/chat/types'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from 'ai'
import { DEFAULT_MODEL } from '@/ai/constants'
import { NextResponse } from 'next/server'
import { getModelOptions } from '@/ai/gateway'
import { checkBotId } from 'botid/server'
import { tools } from '@/ai/tools'
import prompt from './prompt.md'

// Allow up to 300s (Vercel Pro max) for long generations
export const maxDuration = 300

interface BodyData {
  messages: ChatUIMessage[]
}

export async function POST(req: Request) {
  const [checkResult, { messages }] = await Promise.all([
    checkBotId(),
    req.json() as Promise<BodyData>,
  ])

  if (checkResult.isBot) {
    return NextResponse.json({ error: `Bot detected` }, { status: 403 })
  }

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        const result = streamText({
          ...getModelOptions(DEFAULT_MODEL),
          system: prompt,
          messages: await convertToModelMessages(
            messages.map((message) => {
              message.parts = message.parts.map((part) => {
                if (part.type === 'data-report-errors') {
                  return {
                    type: 'text',
                    text:
                      `There are errors in the generated code. This is the summary of the errors we have:\n` +
                      `\`\`\`${part.data.summary}\`\`\`\n` +
                      (part.data.paths?.length
                        ? `The following files may contain errors:\n` +
                          `\`\`\`${part.data.paths?.join('\n')}\`\`\`\n`
                        : '') +
                      `Fix the errors reported.`,
                  }
                }
                return part
              })
              return message
            })
          ),
          stopWhen: stepCountIs(25),
          tools: tools({ modelId: DEFAULT_MODEL, writer }),
          onError: (error) => {
            console.error('Error communicating with AI')
            console.error(JSON.stringify(error, null, 2))
          },
        })
        result.consumeStream()
        writer.merge(
          result.toUIMessageStream({
            sendReasoning: false,
            sendStart: false,
          })
        )
      },
    }),
  })
}
