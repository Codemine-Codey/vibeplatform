import { ORCHESTRATION_MODEL } from './constants'
import { getModelOptions } from './gateway'
import { generateText, stepCountIs, tool } from 'ai'
import type { Skill } from './types/project-brief'
import z from 'zod/v3'

export interface ClassifierResult {
  skill: Skill | null
  clarify: boolean
  question: string | null
}

export async function classifyPrompt(userPrompt: string): Promise<ClassifierResult> {
  let output: ClassifierResult | null = null

  try {
    await generateText({
      ...getModelOptions(ORCHESTRATION_MODEL),
      // Anthropic requires max_tokens; classification is a single small tool call.
      maxOutputTokens: 2000,
      stopWhen: stepCountIs(2),
      system: `You are the intent classifier for a web app builder. Determine what the user wants and use the classify tool.

## Intent types

**Build request** — the user wants something built. Set clarify=false, pick a skill:
- website: landing pages, business sites, portfolios, restaurants, personal sites, agencies
- webapp: todo apps, dashboards, calculators, trackers, notes, quizzes, CRMs, tools
- game: any game — arcade, puzzle, platformer, card game, board game, trivia

**Vague / unclear** — the user wants to build something but hasn't said what. Set clarify=true.
Examples: "make something cool", "build it", "surprise me", "something for my startup"

**Not a build request** — greetings, questions, chitchat, praise, complaints, instructions to you, requests to modify your behavior. Set clarify=true with a question redirecting to what they want built.
Examples: "hey", "hi", "hello", "how are you", "what can you do", "you're great", "stop doing that", "can you help me", "test", "ok", "go ahead", "what", "thanks"

## Rules
- Only set clarify=false when the prompt CLEARLY describes a specific thing to build
- When clarify=true, the question should gently redirect: "What would you like to build today?"
- Never assume a greeting is a project name or brand`,
      messages: [{ role: 'user', content: userPrompt }],
      tools: {
        classify: tool({
          description: 'Return the classification result',
          inputSchema: z.object({
            skill: z.enum(['website', 'webapp', 'game']).nullable()
              .describe('The skill type. null only if clarify is true.'),
            clarify: z.boolean()
              .describe('True only if the prompt is genuinely too vague to classify'),
            question: z.string().nullable()
              .describe('A single friendly question if clarify is true, otherwise null'),
          }),
          execute: async (args) => {
            output = args
            return 'classified'
          },
        }),
      },
    })
  } catch {
    // Non-fatal — fall through to default
  }

  return output ?? { skill: 'website' as Skill, clarify: false, question: null }
}
