import { type ChatUIMessage } from '@/components/chat/types'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from 'ai'
import { DEFAULT_MODEL, FILE_GENERATION_MODEL } from '@/ai/constants'
import { NextResponse } from 'next/server'
import { getModelOptions } from '@/ai/gateway'
import { checkBotId } from 'botid/server'
import { tools } from '@/ai/tools'
import { classifyPrompt } from '@/ai/classifier'
import { expandPrompt } from '@/ai/expander'
import { formatBrief } from '@/ai/types/project-brief'
import { getSkillPack } from '@/ai/packs'
import prompt from './prompt.md'

export const maxDuration = 300

interface BodyData {
  messages: ChatUIMessage[]
}

function getLastUserText(messages: ChatUIMessage[]): string {
  const last = [...messages].reverse().find(m => m.role === 'user')
  if (!last) return ''
  return last.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join(' ')
    .trim()
}

function hasActiveSandbox(messages: ChatUIMessage[]): boolean {
  return messages.some(msg =>
    Array.isArray(msg.parts) &&
    msg.parts.some(p => p.type === 'data-create-sandbox')
  )
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
        let systemPrompt = prompt
        let activeTemplateId: string | null = null

        // Run prompt expansion on new project turns only (no sandbox yet)
        if (!hasActiveSandbox(messages)) {
          const userText = getLastUserText(messages)
          if (userText) {
            try {
              const { skill, clarify, templateId } = await classifyPrompt(userText)
              activeTemplateId = templateId
              if (!clarify && skill) {
                const brief = await expandPrompt(userText, skill)

                // Cache-optimal order: stable content first, dynamic brief last.
                // DeepSeek KV cache prefix-matches from the start — putting the
                // brief at the end means the large stable block (~10k tokens) is
                // cached across all 20 agentic steps, only the brief (~400 tokens)
                // is processed fresh each time.
                const templateNote = templateId
                  ? `\n\n## PRE-BUILT SCAFFOLD: ${templateId}\n` +
                    `Core application files are already in the sandbox. Follow the createSandbox tool result instructions — write only the personality/brand file(s).\n` +
                    `When writing personality files: derive EVERY value from the PROJECT BRIEF above. ` +
                    `The brief's colorPalette, fontPairing, tone, and brandName are the source of truth — not the file defaults. ` +
                    `If the brief says warm/light/airy, make it warm/light/airy. If it says dark/moody/bold, make it dark/moody/bold. ` +
                    `Brand name in nav, title, headings = brief's brandName. ` +
                    `NEVER say "template" or "scaffold" to the user.`
                  : ''

                systemPrompt =
                  `${prompt}\n\n## SKILL PACK — ${skill.toUpperCase()} PATTERNS\n` +
                  `Apply these design and code patterns for this project type. These are non-negotiable quality standards.\n\n` +
                  getSkillPack(skill) +
                  `\n\n## PROJECT BRIEF (authoritative design spec — use this, do not ask clarifying questions)\n` +
                  `Your first message MUST be one sentence confirming what you're building, derived from this brief. Then immediately start the workflow.\n\n` +
                  formatBrief(brief) +
                  templateNote
              }
            } catch {
              // Expansion failure is non-fatal — continue with base prompt
            }
          }
        }

        const result = streamText({
          ...getModelOptions(DEFAULT_MODEL),
          system: systemPrompt,
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
          stopWhen: stepCountIs(30),
          maxOutputTokens: 8000,
          tools: tools({ modelId: FILE_GENERATION_MODEL, writer, templateId: activeTemplateId }),
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
