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
- colorPalette: if the user explicitly mentions colors (e.g. "off-white background", "dark theme", "pastel", "neon"), use those EXACTLY and build the full palette around them. If no colors mentioned, derive from context and brand personality — never default to generic blue/grey.
- fontPairing: use one of these exact pairings based on brand type (do NOT deviate):
  * luxury / fine dining / editorial / fashion / high-end → "Cormorant Garamond + Karla"
  * tech / SaaS / startup / productivity / developer → "Space Grotesk + DM Sans"
  * gaming / bold / esports / energetic / action → "Syne + JetBrains Mono"
  * wellness / nature / organic / calm / spa → "Lora + Nunito"
  * creative / agency / portfolio / artistic / design → "Fraunces + Plus Jakarta Sans"
  * finance / legal / corporate / serious / professional → "Libre Baskerville + Source Sans 3"
  * restaurant / cafe / food / artisan / bistro → "Playfair Display + Source Sans 3"
  * casual / friendly / consumer / colorful / fun → "Nunito + Inter"
  * default / general purpose → "Plus Jakarta Sans + Inter"
- tone: capture the emotional feel precisely — "warm, intimate, rustic" vs "dark, bold, upscale" vs "clean, airy, minimal"
- brandPersonality: 2-3 words that a designer would use to describe the visual language
- visualNarrative: write 2-3 sentences as if describing the experience to a developer. Make it sensory and evocative — what does a user feel in the first 30 seconds? What's the dominant mood? What does the hero look like? Think: "The hero is full-viewport, near-black with warm amber typography..." NOT "This is a website about coffee."
- layoutStyle: e.g. "editorial dark with large typography", "clean white minimal with generous whitespace", "bold geometric with strong color blocks", "immersive parallax with layered sections"
- motionIntensity: "subtle" for luxury/wellness/minimal brands, "moderate" for SaaS/apps/restaurants, "dramatic" for games/agencies/bold brands
- sections: be specific — this is exactly what will be built
- features: list concrete, specific features (not vague like "user-friendly UI")
- techStack: React + Vite is default; add localStorage/router only if needed
- CRITICAL: if the user gives explicit visual direction ("off-white", "minimalist", "dark", "colorful", "earthy"), that overrides everything else — honor it exactly

Use the create_brief tool.`,
      messages: [{ role: 'user', content: `Prompt: "${userPrompt}"\nType: ${skill}` }],
      tools: {
        create_brief: tool({
          description: 'Return the expanded project brief',
          inputSchema: z.object({
            brandName: z.string().describe('Specific brand/product/game name'),
            tagline: z.string().describe('Compelling one-line description'),
            colorPalette: z.string().describe('3-4 specific colors with context, e.g. "deep espresso #1A0F0A, warm amber #D4850A, cream #FDF6E3"'),
            fontPairing: z.string().describe('Exact Google Fonts pairing from the approved list, e.g. "Playfair Display + Source Sans 3"'),
            tone: z.string().describe('Brand personality adjectives, e.g. "warm, artisanal, premium"'),
            brandPersonality: z.string().describe('Visual and emotional feel in 2-3 words'),
            visualNarrative: z.string().describe('2-3 sentences describing the sensory experience of using this product — mood, hero visual, dominant feeling. Evocative, not descriptive.'),
            layoutStyle: z.string().describe('Layout archetype, e.g. "editorial dark with oversized typography", "clean minimal with generous whitespace"'),
            motionIntensity: z.enum(['subtle', 'moderate', 'dramatic']).describe('Animation intensity — subtle for luxury/wellness, moderate for SaaS/restaurant, dramatic for games/bold brands'),
            sections: z.array(z.string()).describe('Ordered list of sections/screens/views to build'),
            features: z.array(z.string()).describe('Specific features or mechanics to implement'),
            techStack: z.string().describe('Tech choices, e.g. "React + Vite, localStorage, React Router v6"'),
          }),
          execute: async (args) => {
            output = args as Omit<ProjectBrief, 'skill'>
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
    fontPairing: 'Plus Jakarta Sans + Inter',
    tone: 'modern, clean, professional',
    brandPersonality: 'modern, focused',
    visualNarrative: 'A clean, modern interface that gets out of the way and lets the content shine. Generous whitespace, crisp typography, and purposeful color accents create a professional feel from the first glance.',
    layoutStyle: 'clean minimal with generous whitespace',
    motionIntensity: 'moderate' as const,
    techStack: 'React + Vite',
    ...defaults[skill],
  } as ProjectBrief
}
