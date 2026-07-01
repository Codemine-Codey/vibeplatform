import { ORCHESTRATION_MODEL } from './constants'
import { getModelOptions } from './gateway'
import { generateText, stepCountIs, tool } from 'ai'
import z from 'zod/v3'

export interface ClarifyQuestion {
  question: string
  options: string[] // exactly 3 concrete choices; the user may also type their own or skip
}

// Generate 2-3 SHORT personalization questions for a new project, each with 3 concrete options.
// Asked once on the first build request so the result matches the user's taste — never about tech.
// ONE fast model call (it infers the project type itself — no separate classify step, which made
// the endpoint time out).
export async function generateClarifyQuestions(userPrompt: string): Promise<ClarifyQuestion[]> {
  let output: ClarifyQuestion[] | null = null
  try {
    await generateText({
      ...getModelOptions(ORCHESTRATION_MODEL),
      maxOutputTokens: 1200,
      stopWhen: stepCountIs(2),
      system:
        `You personalize a web project (website, app, or game) BEFORE it is built.\n\n` +
        `STEP 1 — decide if this message is a real request to BUILD something (a website, app, or game). ` +
        `If it is NOT — a greeting ("hi", "hello"), a question, chit-chat, thanks, a command to you, or too ` +
        `vague to build ("make something") — call the ask tool with an EMPTY questions array. Ask NOTHING.\n\n` +
        `STEP 2 — only if it IS a build request: infer what they want, then ask 2-3 short, plain-language ` +
        `questions whose answers meaningfully change the result — visual style/mood, audience/purpose, or the ` +
        `core focus. Each question has EXACTLY 3 concrete, distinct options (the user can also type their own).\n\n` +
        `Rules:\n` +
        `- NEVER ask about tech, stack, hosting, database, or framework — those are decided.\n` +
        `- Keep questions non-technical and specific to what they asked for.\n` +
        `- Options must be concrete and different from each other (e.g. "Warm & minimal", "Bold & playful", "Dark & sleek").\n` +
        `- Website → visual style, tone, main goal. App → core use, style, who it's for. Game → art style, vibe, core challenge.\n` +
        `Return either 0 questions (not a build request) or 2-3 questions (a build request). Use the ask tool.`,
      messages: [{ role: 'user', content: userPrompt }],
      tools: {
        ask: tool({
          description: 'Return the personalization questions',
          inputSchema: z.object({
            questions: z
              .array(
                z.object({
                  question: z.string().describe('A short, plain-language question (no jargon)'),
                  options: z.array(z.string()).length(3).describe('Exactly 3 concrete, distinct choices'),
                })
              )
              .max(4)
              .describe('EMPTY if this is not a build request; otherwise 2-3 questions'),
          }),
          execute: async (args) => {
            output = args.questions
            return 'ok'
          },
        }),
      },
    })
  } catch {
    /* non-fatal — no questions, build proceeds normally */
  }
  return output ?? []
}
