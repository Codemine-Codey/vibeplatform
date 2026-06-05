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

Classify confidently. Most prompts are clear. Only set clarify=true for genuinely vague inputs like "make something cool" or "surprise me".`,
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
