import { type ChatUIMessage } from '@/components/chat/types'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from 'ai'
import { FILE_GENERATION_MODEL } from '@/ai/constants'
import { NextResponse } from 'next/server'
import {
  getFallbackModel,
  getIterationModel,
  getOrchestrationModel,
  isRateLimitError,
} from '@/ai/gateway'
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
        const isNewProject = !hasActiveSandbox(messages)

        // ── System prompt (with optional brief injection for new projects) ──
        let systemPrompt = prompt

        if (isNewProject) {
          const userText = getLastUserText(messages)
          if (userText) {
            try {
              const { skill, clarify } = await classifyPrompt(userText)
              if (!clarify && skill) {
                const brief = await expandPrompt(userText, skill)
                systemPrompt =
                  `${prompt}\n\n## PROJECT BRIEF\n` +
                  `This brief was pre-analyzed from the user's prompt. Use it as the authoritative design spec.\n` +
                  `Your first message MUST be one sentence confirming what you're building, derived from this brief. Then immediately start the workflow.\n\n` +
                  formatBrief(brief) +
                  `\n\n## SKILL PACK — ${skill.toUpperCase()} PATTERNS\n` +
                  `Apply these design and code patterns for this project type. These are non-negotiable quality standards.\n\n` +
                  getSkillPack(skill)
              }
            } catch {
              // Expansion failure is non-fatal — continue with base prompt
            }
          }
        }

        // ── Convert messages ────────────────────────────────────────────────
        const convertedMessages = await convertToModelMessages(
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
        )

        // ── Model selection ─────────────────────────────────────────────────
        // New project → Sonnet 4.6 (best quality, fewer repair loops)
        // Existing project (edit/chat) → DeepSeek Flash (fast, cheap)
        const primaryModel = isNewProject ? getOrchestrationModel() : getIterationModel()
        const fallbackModel = isNewProject ? getFallbackModel() : null

        const streamOpts = {
          system: systemPrompt,
          messages: convertedMessages,
          stopWhen: stepCountIs(20),
          maxOutputTokens: 4000,
          tools: tools({ modelId: FILE_GENERATION_MODEL, writer }),
        } as const

        // ── Stream with automatic fallback on any primary error ────────────
        // Fallback activates on rate limits (429) AND any other error (model
        // not found, network failure, etc.) — gives users a response no matter what.
        let fallbackTriggered = false

        const result = streamText({
          ...streamOpts,
          ...primaryModel,
          onError: ({ error }) => {
            if (fallbackModel && !fallbackTriggered) {
              fallbackTriggered = true
              const reason = isRateLimitError(error) ? 'rate-limited' : 'errored'
              console.warn(`[chat] Primary model ${reason} — switching to fallback`)
              const fallback = streamText({
                ...streamOpts,
                ...fallbackModel,
                onError: (e) => console.error('[chat] Fallback model error:', e.error),
              })
              fallback.consumeStream()
              writer.merge(fallback.toUIMessageStream({ sendReasoning: false, sendStart: false }))
            } else {
              console.error('[chat] Stream error (no fallback available):', error)
            }
          },
        })

        result.consumeStream()
        writer.merge(result.toUIMessageStream({ sendReasoning: false, sendStart: false }))
      },
    }),
  })
}
