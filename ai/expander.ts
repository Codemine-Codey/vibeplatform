import { FILE_GENERATION_MODEL } from './constants'
import { getModelOptions } from './gateway'
import { generateText, stepCountIs, tool } from 'ai'
import type { ProjectBrief, Skill } from './types/project-brief'
import z from 'zod/v3'

const SKILL_CONTEXT: Record<Skill, string> = {
  website: 'a multi-section marketing website. Plan: Hero, About/Story, Services/Features, Social Proof (testimonials or stats), CTA, Footer. Add 2+ sub-pages where relevant.',
  webapp: 'a fully functional web application. Plan all views, user flows, states (empty/loading/error/success), and core features. Include localStorage persistence.',
  game: 'a complete web game. Plan: Start Screen, Gameplay, Pause, Game Over, Score/High Score, Play Again. Define all game constants (colors, speeds, sizes).',
}

export async function expandPrompt(
  userPrompt: string,
  skill: Skill,
): Promise<ProjectBrief> {
  let output: Omit<ProjectBrief, 'skill'> | null = null

  try {
    await generateText({
      ...getModelOptions(FILE_GENERATION_MODEL),
      stopWhen: stepCountIs(2),
      system: `You are a creative director for a premium web builder. Expand the user's prompt into a detailed project brief.

The project is ${SKILL_CONTEXT[skill]}

Rules:
- brandName: create a specific, memorable name that fits the context (not generic like "MyApp")
- colorPalette: derive from context, never default to generic blue/grey unless it genuinely fits
- fontPairing: choose Google Fonts matching the brand personality
- sections: be specific — this is exactly what will be built
- features: list concrete, specific features (not vague like "user-friendly UI")
- techStack: React + Vite is default; add localStorage/router only if needed

Use the create_brief tool.`,
      messages: [{ role: 'user', content: `Prompt: "${userPrompt}"\nType: ${skill}` }],
      tools: {
        create_brief: tool({
          description: 'Return the expanded project brief',
          inputSchema: z.object({
            brandName: z.string().describe('Specific brand/product/game name'),
            tagline: z.string().describe('Compelling one-line description'),
            colorPalette: z.string().describe('3-4 specific colors, e.g. "deep navy, electric blue, crisp white"'),
            fontPairing: z.string().describe('Google Fonts pairing, e.g. "Playfair Display + DM Sans"'),
            tone: z.string().describe('Brand personality adjectives, e.g. "warm, artisanal, premium"'),
            brandPersonality: z.string().describe('Visual and emotional feel in 2-3 words'),
            sections: z.array(z.string()).describe('Ordered list of sections/screens/views to build'),
            features: z.array(z.string()).describe('Specific features or mechanics to implement'),
            techStack: z.string().describe('Tech choices, e.g. "React + Vite, localStorage, React Router v6"'),
          }),
          execute: async (args) => {
            output = args
            return 'expanded'
          },
        }),
      },
    })
  } catch {
    // Non-fatal — use fallback below
  }

  if (output) {
    return { ...(output as Omit<ProjectBrief, 'skill'>), skill }
  }

  // Fallback brief when expansion fails
  const defaults: Record<Skill, Partial<ProjectBrief>> = {
    website: {
      sections: ['Hero', 'About', 'Services', 'Testimonials', 'CTA', 'Footer'],
      features: [],
    },
    webapp: {
      sections: ['Dashboard', 'Main View', 'Settings'],
      features: ['CRUD operations', 'localStorage persistence'],
    },
    game: {
      sections: ['Start Screen', 'Gameplay', 'Game Over'],
      features: ['Keyboard controls', 'Touch controls', 'Score tracking', 'High score'],
    },
  }

  return {
    brandName: 'My Project',
    tagline: 'Built with Codemine',
    skill,
    colorPalette: 'modern neutrals with a bold accent',
    fontPairing: 'Inter + Inter',
    tone: 'modern, clean, professional',
    brandPersonality: 'modern, focused',
    techStack: 'React + Vite',
    ...defaults[skill],
  } as ProjectBrief
}
