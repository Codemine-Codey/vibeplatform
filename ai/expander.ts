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
      // Speed v2 Lever 6: reasoning OFF. The brief is a structured tool call whose
      // fields (palette, fonts, signature moves, archetype) already pin the design
      // decisions — extended thinking added 15-30s for little gain. Score-gated:
      // if design quality dips on the test prompts, restore { reasoning: true }.
      ...getModelOptions(FILE_GENERATION_MODEL),
      maxOutputTokens: 8000,
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
- visualNarrative: write 5-7 sentences as a creative director briefing a developer. This is the most important field — it sets the entire visual language. Cover ALL of these in order:
  1. Hero visual: what fills the viewport? (image placement, typography size and position, dominant color, mood)
  2. Color story: specific hex hints or hue descriptions, light/dark mode, contrast feel
  3. Typography scale: which font does what role? At what size? Tracking? Weight? What emotion does it carry?
  4. Motion language: how do elements enter? How fast? What easing? What does interaction feel like?
  5. Overall emotional impression: what does the user feel after 30 seconds? One sentence that captures the soul of the product.
  Be specific and visual — "The hero is full-viewport near-black (#0D0A06) with 7xl Cormorant Garamond in warm amber, set left-of-center..." NOT "This is a dark elegant website."
- colorTokens: the LOCKED semantic palette as 6 hex values — this is the single source of truth the whole project is built from. Choose domain-driven, non-generic colours with a deliberate contrast strategy (never default blue/grey). Roles:
  * background: the page background
  * surface: cards / raised sections (subtly distinct from background)
  * foreground: primary text (must have strong contrast on background)
  * mutedForeground: secondary text (readable but quieter)
  * primary: the brand colour for CTAs and key accents
  * accent: a secondary highlight that complements primary
  If the user named colours, build these around them exactly. Make it feel intentional, like a real brand system.
- signatureMoves: 2-3 SPECIFIC, memorable design moves that make this look art-directed rather than templated — e.g. "a full-bleed hero with the headline overlapping the image", "a scroll-linked horizontal marquee of work", "a grain/noise texture over a deep gradient", "an asymmetric broken-grid gallery", "a custom oversized cursor on interactive areas". Be concrete and unusual — NOT "clean layout" or "nice animations". Each move MUST be achievable with HTML + Tailwind + framer-motion + CSS only — NO SVG, no <canvas> (for websites/apps). Describe dividers/shapes as CSS borders, gradients, or animated divs, never SVG.
- layoutStyle: a committed archetype — "editorial / magazine", "bento grid", "asymmetric split", "broken-grid", "immersive parallax", "brutalist mono", etc. — not a generic stacked template.
- motionIntensity: "subtle" for luxury/wellness/minimal brands, "moderate" for SaaS/apps/restaurants, "dramatic" for games/agencies/bold brands
- sections: be specific — this is exactly what will be built
- features: list concrete, specific features (not vague like "user-friendly UI")
- ${'gameDesign (ONLY for games)'}: a tight contract — core gameplay loop, exact controls (keys + touch), win/lose conditions, difficulty curve, and the "juice" (screen shake, particles, sound cues, score popups) that makes it feel designed. Skip for non-games.
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
            colorTokens: z.object({
              background: z.string().describe('Page background, hex e.g. "#0D0A06"'),
              surface: z.string().describe('Cards/raised sections, hex'),
              foreground: z.string().describe('Primary text, hex — strong contrast on background'),
              mutedForeground: z.string().describe('Secondary text, hex — quieter but readable'),
              primary: z.string().describe('Brand/CTA colour, hex'),
              accent: z.string().describe('Secondary highlight, hex'),
            }).describe('The LOCKED semantic palette — 6 hex roles that become the project\'s only colours'),
            signatureMoves: z.array(z.string()).min(2).max(3).describe('2-3 specific, memorable, unusual design moves that make it look art-directed'),
            fontPairing: z.string().describe('Exact Google Fonts pairing from the approved list, e.g. "Playfair Display + Source Sans 3"'),
            tone: z.string().describe('Brand personality adjectives, e.g. "warm, artisanal, premium"'),
            brandPersonality: z.string().describe('Visual and emotional feel in 2-3 words'),
            visualNarrative: z.string().describe('5-7 sentences covering: (1) hero viewport visual with specific colors+typography, (2) color story with hex hints, (3) typography roles and emotional weight, (4) motion language and easing feel, (5) overall emotional impression in one closing sentence. Specific and visual — no generic descriptions.'),
            layoutStyle: z.string().describe('Layout archetype, e.g. "editorial dark with oversized typography", "clean minimal with generous whitespace"'),
            motionIntensity: z.enum(['subtle', 'moderate', 'dramatic']).describe('Animation intensity — subtle for luxury/wellness, moderate for SaaS/restaurant, dramatic for games/bold brands'),
            sections: z.array(z.string()).describe('Ordered list of sections/screens/views to build'),
            features: z.array(z.string()).describe('Specific features or mechanics to implement'),
            gameDesign: z.string().optional().describe('GAMES ONLY: core loop, exact controls (keys+touch), win/lose, difficulty curve, and juice (shake/particles/sound/score popups). Omit for non-games.'),
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
    colorTokens: {
      background: '#FAFAF7',
      surface: '#FFFFFF',
      foreground: '#0F0F0F',
      mutedForeground: '#5A5A5A',
      primary: '#2B6CB0',
      accent: '#E07A3F',
    },
    signatureMoves: [
      'A full-bleed hero with an oversized headline overlapping the imagery',
      'Sections that fade and rise on scroll with a subtle stagger',
    ],
    fontPairing: 'Plus Jakarta Sans + Inter',
    tone: 'modern, clean, professional',
    brandPersonality: 'modern, focused',
    visualNarrative: 'The hero is full-viewport white with a bold 6xl Plus Jakarta Sans headline in near-black (#0F0F0F), left-aligned, with a single accent color strip. The color palette is clean neutrals — off-white (#FAFAFA) backgrounds, slate-900 text, one bold accent that earns attention without competing. Plus Jakarta Sans carries the headlines at display scale with tight tracking; Inter handles body copy at 17px with relaxed line height. Motion is purposeful: sections fade and rise 32px on scroll over 0.7s ease-out, cards lift 4px on hover with no spring physics. The overall feeling is a product that respects the user\'s time — clear, fast, professional.',
    layoutStyle: 'clean minimal with generous whitespace',
    motionIntensity: 'moderate' as const,
    techStack: 'React + Vite',
    ...defaults[skill],
  } as ProjectBrief
}
