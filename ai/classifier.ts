import { FILE_GENERATION_MODEL } from './constants'
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
      ...getModelOptions(FILE_GENERATION_MODEL),
      stopWhen: stepCountIs(2),
      system: `You classify user prompts for a web builder. Use the classify tool.

Skill types:
- website: landing pages, business sites, portfolios, restaurants, agencies, stores, personal sites
- webapp: todo apps, dashboards, calculators, budget/habit trackers, notes, quizzes, forms, tools
- game: any game clone or original — arcade, puzzle, platformer, card game, board game, trivia

IMPORTANT: Set clarify=true when:
- The message is a greeting or conversational filler ("hey", "hi", "hello", "yo", "test", "ok", "sure", "what", "hmm", "cool")
- The prompt contains no description of what to build ("make something", "surprise me", "build it", "go ahead")
- The prompt is fewer than 4 words AND doesn't clearly describe a project type
- You cannot determine what the user wants to build with reasonable confidence

Only classify with clarify=false when the prompt clearly describes something to build.`,
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

  return output ?? { skill: 'website', clarify: false, question: null }
}
