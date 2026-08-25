import { BRIEF_MODEL } from './constants'
import { getModelOptions } from './gateway'
import { guardColorTokens } from '@/lib/contrast'
import { generateText, stepCountIs, tool } from 'ai'
import type { Archetype, GameDesignContract, ProjectBrief, Skill } from './types/project-brief'
import z from 'zod/v3'

// ── Deterministic guarantees so a brief is NEVER junk, even when the model call fails ──
// A solid platform has no "sometimes": the worst case is a specific brief DERIVED from the
// user's own prompt, never "My Project". These run only on the rare fallback path.

// Pull a plausible brand from the prompt ("...called Ember & Ground", "a Sakura sushi site").
export function deriveBrandName(prompt: string, skill: Skill): string {
  const m = prompt.match(/\b(?:called|named)\s+([A-Z][\w&'’]*(?:\s+(?:&|and|[A-Z][\w'’]*)){0,3})/)
  if (m) return m[1].replace(/\s+and\s+/gi, ' & ').trim()
  const caps = prompt.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/)
  if (caps) return caps[1]
  return skill === 'game' ? 'Nova Arcade' : skill === 'webapp' ? 'Flow' : 'Atelier'
}

// Keyword-heuristic archetype so even a fallback commits to a distinct look (never generic).
function pickArchetype(prompt: string, skill: Skill): Archetype {
  const p = prompt.toLowerCase()
  if (skill === 'game') return /neon|cyber|space|retro|arcade|synth/.test(p) ? 'cyber-neon' : 'playful-rounded'
  if (/luxur|fine|elegant|premium|jewel|couture/.test(p)) return 'dark-luxe'
  if (/coffee|cafe|restaurant|food|bakery|bistro|artisan/.test(p)) return 'warm-boutique'
  if (/tech|saas|startup|dashboard|\bai\b|developer|platform/.test(p)) return 'swiss-minimal'
  if (/agency|studio|portfolio|creative|design|art/.test(p)) return 'editorial-magazine'
  return 'corporate-clean'
}

// A complete generic game contract so a fallback game is never gameDesign:NONE (which is what
// shipped the mechanic-less snake). Loosely seeded from the prompt; the real expansion is richer.
function fallbackGameDesign(prompt: string): GameDesignContract {
  return {
    coreLoop: `Control the player, avoid hazards, collect/score, survive longer as difficulty rises — derived from: "${prompt.slice(0, 80)}"`,
    controls: 'Arrow keys / WASD to move, Space for the primary action; touch buttons on mobile',
    winCondition: 'N/A — endless, chase a high score',
    loseCondition: 'Collide with a hazard or run out of lives → Game Over screen',
    difficultyProgression: 'Speed and spawn rate increase steadily as the score climbs',
    entities: ['player', 'obstacle/enemy', 'collectible', 'score display'],
    physics: { playerSpeed: 220, enemySpeed: 180 },
    juice: ['score popup on collect', 'flash + shake on hit', 'sound on key events'],
  }
}

// Best-effort recovery of the model's args when the tool call malformed its JSON. The SDK
// error carries the raw text; we extract it, repair common truncation (unbalanced braces),
// and parse. Returns a partial brief or null — never throws.
export function salvageArgs(blob: string | null): Record<string, unknown> | null {
  if (!blob) return null
  let raw: string | null = null
  const m = blob.match(/"_raw_arguments"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (m) { try { raw = JSON.parse(`"${m[1]}"`) } catch { raw = m[1] } }
  if (!raw) { const b = blob.indexOf('{'); if (b >= 0) raw = blob.slice(b) }
  if (!raw) return null
  const tryParse = (s: string): Record<string, unknown> | null => { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : null } catch { return null } }
  let obj = tryParse(raw)
  if (!obj) {
    // Repair: cut to the last complete-looking point and balance braces/brackets.
    let s = raw.replace(/,\s*$/, '')
    const opens = (s.match(/{/g) || []).length, closes = (s.match(/}/g) || []).length
    const bo = (s.match(/\[/g) || []).length, bc = (s.match(/\]/g) || []).length
    s = s + ']'.repeat(Math.max(0, bo - bc)) + '}'.repeat(Math.max(0, opens - closes))
    obj = tryParse(s)
  }
  return obj
}

// Per-type briefing, each ORDERED by what matters most for that type (a website prompt and a
// game prompt must NOT follow the same template). High information density is the goal — each
// decision specific to THIS product, not generic filler.
const SKILL_CONTEXT: Record<Skill, string> = {
  website:
    'a multi-section marketing website. Build the brief in THIS priority order: ' +
    '(1) brand + who it serves + the primary conversion action, (2) visual direction (archetype/colour/type/motion), ' +
    '(3) page structure + per-page section breakdown, (4) real copy direction per section, ' +
    '(5) interactions (nav, hover, forms, modals) + form/empty/error/success states where forms exist, ' +
    '(6) responsive behaviour (desktop → tablet → mobile nav + stacking), (7) the CTA/conversion path. ' +
    'Plan a real MULTI-PAGE site: Home (rich 5-7 sections) + About/Services/Menu/Work/Gallery/Pricing/Contact as fits.',
  webapp:
    'a fully functional web application. Build the brief in THIS priority order: ' +
    '(1) the primary user + the ONE job they come to do, (2) core workflows end-to-end, (3) every screen/view + its route, ' +
    '(4) state pattern, (5) the data model (typed entities + relationships) + persistence, (6) permissions/roles if any, ' +
    '(7) interactions + EVERY state handled (empty, loading, error, success — never a blank screen), (8) UI polish, ' +
    '(9) responsive (desktop → mobile: drawer nav, touch targets). The core loop must be 100% functional — no stubs.',
  game:
    'a complete web game. Build the brief in THIS priority order: ' +
    '(1) the core game loop (moment-to-moment), (2) mechanics + rules, (3) controls (keyboard AND touch), ' +
    '(4) scoring + difficulty progression, (5) game states (start → playing → pause → game over → restart), ' +
    '(6) UI/HUD (score, lives, high score), (7) audio/juice, (8) visual style, (9) mobile controls + performance. ' +
    'Define exact physics constants (gravity, speeds, sizes) — these numbers go verbatim into the code.',
}

export async function expandPrompt(
  userPrompt: string,
  skill: Skill,
): Promise<ProjectBrief> {
  let output: Omit<ProjectBrief, 'skill'> | null = null
  let salvageBlob: string | null = null  // raw args of a malformed tool call, for salvage below

  // RETRY before falling back: the brief step intermittently fails to emit a valid tool call
  // (malformed JSON on a large payload). One clean retry turns a ~10-15% junk-fallback rate into
  // near-zero at ~a cent extra. Only the bland fallback (below) is worse than a retry.
  for (let attempt = 1; attempt <= 2 && output === null; attempt++) {
   try {
    const _diagRes = await generateText({
      // The brief runs on the strong BRIEF_MODEL. Reasoning was tried ON but the long silent
      // think caused the SSE stream to idle out and drop mid-build (E2E test 2026-07-21), for
      // little visible gain — so it's OFF. Token budget stays generous so the richer schema
      // (visualNarrative + pageMap + signature moves) never truncates into a fallback.
      ...getModelOptions(BRIEF_MODEL),
      maxOutputTokens: 16000,
      // 5 (was 2): a large create_brief tool call occasionally malforms its JSON; the model
      // detects it ("Let me fix that JSON parsing issue") but needs steps to re-emit. 2 left no
      // room → silent fallback to a bland brief (root cause of blank websites + gameDesign:NONE).
      stopWhen: stepCountIs(5),
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
- archetype (CRITICAL for variety — pick the ONE that fits this brand best, NEVER default to the safe/plain option): choose from editorial-magazine, bento-grid, swiss-minimal, brutalist-mono, immersive-parallax, glassmorphic-dark, warm-boutique, kinetic-type, retro-print, luxury-serif, playful-rounded, corporate-clean, art-deco, cyber-neon, organic-blob, maximalist-collage, scandinavian-clean, dark-luxe, vibrant-gradient, neo-memphis. Match it to the brand's soul — fine-dining → luxury-serif / dark-luxe / art-deco / editorial-magazine; dev tool/SaaS → swiss-minimal / bento-grid / glassmorphic-dark / cyber-neon; creative agency → kinetic-type / brutalist-mono / maximalist-collage / immersive-parallax; boutique/cafe → warm-boutique / scandinavian-clean / retro-print; startup/app/event → vibrant-gradient / organic-blob / playful-rounded / neo-memphis. Two different briefs should rarely get the same archetype. This is what stops every site looking the same — commit hard to the archetype's structural language.
- navStyle (fits the archetype): left-logo-right-links, centered-logo, split-cta, floating-pill, transparent-over-hero, minimal-underline, sidebar-drawer, or mega-menu. Pick what suits the layout (e.g. luxury → centered-logo or minimal-underline; immersive → transparent-over-hero; SaaS → split-cta; content-heavy multi-page → mega-menu).
- backgroundTreatment (LEGIBILITY FIRST — the background must NEVER compete with content; it sits quietly BEHIND, at low opacity): flat, gradient-mesh, noise-grain, animated-gradient, scroll-parallax, aurora-glow, particles, dot-grid, topographic, spotlight-follow, video-loop, or 3d-scene. DEFAULT to flat or a very subtle treatment. Only choose a bolder one when it genuinely fits the brand AND stays subtle (e.g. dark premium → a faint aurora-glow; tech → a faint dot-grid or gradient-mesh; agency/product → a restrained 3d-scene or scroll-parallax). If in doubt, pick flat — a clean readable page beats a busy one. NEVER pick a loud/heavy background just to look "alive"; a noisy background that makes text hard to read is a failure.
- pageMap (websites — MULTI-PAGE IS THE DEFAULT): an array of pages, each { page, route, sections[] }. A plain request like "create a website for my <business>" MUST become a real multi-page site — 3-5 pages typical (e.g. Home "/", About "/about", Services/Menu/Work "/services", maybe Gallery or Pricing, Contact "/contact"), sections distributed across them, with Home still a rich 5-7 section landing. Choose pages that fit the business (a restaurant → Home, Menu, About, Reservations/Contact; an agency → Home, Work, Services, About, Contact; a SaaS → Home, Features, Pricing, About/Blog, Contact). Use a SINGLE page (one entry, route "/") ONLY when the user explicitly asks for a "one-page", "single page", or "landing page", or the request is genuinely trivial. Each page's sections must be specific and distinct.
- sections: be specific AND say what each does, not just its name — "Hero — full-viewport headline + primary CTA + product shot", "Menu — filterable grid of dishes with prices", not just "Hero"/"Menu". This is exactly what will be built.
- qualityBar: 4-6 PROJECT-SPECIFIC acceptance criteria — concrete "done only when…" checks unique to THIS product that the build must satisfy (e.g. "reservation form rejects past dates", "cart total updates live as quantity changes", "snake speeds up every 5 points", "dashboard shows an empty-state when there are no orders yet"). Do NOT list universals like "no console errors" or "no dead links" — those are always enforced. Make each one testable against this specific build.
- features: list concrete, specific features (not vague like "user-friendly UI")
- ${'gameDesign (ONLY for games)'}: a TYPED contract with exact sub-fields — fill every field precisely so the code uses these EXACT values. Skip for non-games.
- ${'webappDesign (ONLY for webapps)'}: a TYPED architecture contract — enumerate every view/screen with route + key components, the core data models with typed fields, state pattern, and persistence. Skip for games/websites.
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
            archetype: z.enum(['editorial-magazine', 'bento-grid', 'swiss-minimal', 'brutalist-mono', 'immersive-parallax', 'glassmorphic-dark', 'warm-boutique', 'kinetic-type', 'retro-print', 'luxury-serif', 'playful-rounded', 'corporate-clean', 'art-deco', 'cyber-neon', 'organic-blob', 'maximalist-collage', 'scandinavian-clean', 'dark-luxe', 'vibrant-gradient', 'neo-memphis']).describe('The committed visual archetype that best fits this brand — pick boldly, never the plain default. Drives the whole structural language.'),
            navStyle: z.enum(['left-logo-right-links', 'centered-logo', 'split-cta', 'floating-pill', 'transparent-over-hero', 'minimal-underline', 'sidebar-drawer', 'mega-menu']).describe('Nav style that suits the archetype + page count'),
            backgroundTreatment: z.enum(['flat', 'gradient-mesh', 'noise-grain', 'animated-gradient', 'scroll-parallax', 'aurora-glow', 'particles', '3d-scene', 'dot-grid', 'topographic', 'spotlight-follow', 'video-loop']).describe('Background depth/motion treatment — bias away from flat; use 3d-scene/spotlight-follow/video-loop for wow when it fits'),
            pageMap: z.array(z.object({
              page: z.string().describe('Page name, e.g. "Home", "About", "Services", "Contact"'),
              route: z.string().describe('Route path, e.g. "/", "/about", "/services"'),
              sections: z.array(z.string()).describe('Ordered sections that render on this page'),
            })).default([]).describe('WEBSITES: the multi-page routing plan — REQUIRED, NOT optional. Websites are MULTI-PAGE by default: ALWAYS return 3-5 pages (Home "/" is a rich 5-7 section landing, plus business-appropriate pages like About/Menu/Services/Work/Gallery/Pricing/Contact), sections distributed across them, each page distinct. Return a SINGLE entry (route "/") ONLY when the user EXPLICITLY says "one-page"/"single page"/"landing page only". For webapps/games return an empty array [].'),
            sections: z.array(z.string()).describe('Ordered list of sections/screens/views to build (for websites: the union across all pages; pageMap defines per-page placement)'),
            features: z.array(z.string()).describe('Specific features or mechanics to implement'),
            gameDesign: z.object({
              coreLoop: z.string().describe('The exact moment-to-moment gameplay loop in one sentence'),
              controls: z.string().describe('Exact keys + touch controls, e.g. "Space/Tap to jump, Arrow keys to move"'),
              winCondition: z.string().describe('How the player wins or reaches a milestone, or "N/A — endless"'),
              loseCondition: z.string().describe('What triggers game-over and shows the end screen'),
              difficultyProgression: z.string().describe('Concrete description of how difficulty ramps over time'),
              entities: z.array(z.string()).min(2).describe('Every entity in the game: player, obstacles, collectibles, enemies, projectiles'),
              physics: z.object({
                gravity: z.number().optional().describe('Gravity constant in px/s² (e.g. 800 for a fast-falling game)'),
                jumpForce: z.number().optional().describe('Jump velocity in px/s — negative = upward (e.g. -350)'),
                playerSpeed: z.number().optional().describe('Player horizontal movement speed in px/s'),
                enemySpeed: z.number().optional().describe('Obstacle or enemy movement speed in px/s'),
                gap: z.number().optional().describe('Gap or clearance size in px (e.g. vertical pipe opening: 160)'),
              }).describe('Physics constants — these numbers go verbatim into the code; choose them carefully for good feel'),
              juice: z.array(z.string()).min(2).describe('All feedback effects that make it feel designed: screen shake, flash, particles, sounds, score popups'),
            }).optional().describe('GAMES ONLY: the complete typed game design contract. Omit for non-games.'),
            webappDesign: z.object({
              views: z.array(z.object({
                name: z.string().describe('Screen/view name, e.g. "Board", "Task Detail", "Settings"'),
                route: z.string().describe('Route path, e.g. "/", "/task/:id", "/settings"'),
                components: z.array(z.string()).describe('Key UI components rendered on this view'),
              })).min(1).describe('Every view/screen in the app with route and key components'),
              dataModels: z.array(z.object({
                name: z.string().describe('Entity name, e.g. "Task", "Note", "User"'),
                fields: z.array(z.string()).describe('Typed fields, e.g. ["id: string", "title: string", "done: boolean"]'),
              })).optional().describe('Core data models the app creates/reads/updates/deletes'),
              statePattern: z.enum(['useState', 'useReducer', 'zustand', 'context']).describe('State management approach — useState for simple, useReducer for complex logic'),
              persistence: z.enum(['localStorage', 'sessionStorage', 'none']).describe('How user data is persisted across page loads'),
            }).optional().describe('WEBAPPS ONLY: typed architecture contract. Omit for games/websites.'),
            techStack: z.string().describe('Tech choices, e.g. "React + Vite, localStorage, React Router v6"'),
            qualityBar: z.array(z.string()).min(3).max(6).describe('4-6 PROJECT-SPECIFIC acceptance criteria ("done only when…") unique to THIS product — testable against this build (e.g. "reservation form rejects past dates", "snake speeds up every 5 points"). NOT universals like "no console errors"/"no dead links" (always enforced separately).'),
          }),
          execute: async (args) => {
            output = args as Omit<ProjectBrief, 'skill'>
            return 'expanded'
          },
        }),
      },
    })
    // DIAGNOSTIC: if the tool never set output, surface WHY (finishReason, tool calls made,
    // any tool-call validation errors) instead of silently falling back to the bland brief.
    if (!output) {
      const toolNames = (_diagRes.toolCalls ?? []).map((t) => t.toolName)
      console.error(`[expander-diag] attempt ${attempt}/2 skill=${skill} output=NULL finishReason=${_diagRes.finishReason} steps=${_diagRes.steps?.length} toolCalls=[${toolNames.join(',')}] text="${(_diagRes.text || '').slice(0, 160)}"`)
      for (const step of _diagRes.steps ?? []) {
        for (const c of (step.content ?? []) as Array<{ type?: string; toolName?: string; error?: unknown; input?: unknown }>) {
          if (c?.type === 'tool-error' || (c as { type?: string })?.type === 'tool-call-error') {
            const blob = JSON.stringify(c.error ?? c)
            if (blob.includes('_raw_arguments') || blob.includes('brandName')) salvageBlob = blob
            console.error(`[expander-diag]   tool-error ${c.toolName}: ${blob.slice(0, 300)}`)
          }
        }
      }
    }
   } catch (e) {
    console.error(`[expander-diag] attempt ${attempt}/2 skill=${skill} THREW: ${(e as Error)?.message} :: ${((e as Error)?.stack || '').slice(0, 200)}`)
   }
  }

  if (output) {
    const brief = { ...(output as Omit<ProjectBrief, 'skill'>), skill }
    // Visibility: log the design DNA the brief committed to, so a bland/single-page result
    // can be traced to the brief (not the generator). Shows in Vercel function logs.
    console.log(
      `[brief] skill=${skill} archetype=${brief.archetype ?? 'NONE'} nav=${brief.navStyle ?? 'NONE'} bg=${brief.backgroundTreatment ?? 'NONE'} pages=${brief.pageMap?.length ?? 0} sections=${brief.sections?.length ?? 0}`
    )
    // A3 — contrast guard: guarantee readable text by math. If the model produced
    // a low-contrast palette (text near the background), auto-correct before the
    // painter ever sees it, so headlines can never blend into the background.
    if (brief.colorTokens) {
      const { tokens, changed } = guardColorTokens(brief.colorTokens)
      if (changed.length > 0) {
        brief.colorTokens = tokens
        console.warn('[contrast-guard] corrected low-contrast tokens:', changed.join(', '))
      }
    }
    return brief
  }

  // SALVAGE FIRST: if the tool call malformed its JSON, recover the model's OWN data (zero
  // extra model calls) and use whatever fields parsed. Turns most "failures" into real briefs.
  const salvaged = salvageArgs(salvageBlob)
  if (salvaged && typeof salvaged.brandName === 'string' && (salvaged.visualNarrative || salvaged.colorTokens)) {
    console.warn('[brief] recovered a malformed tool call via salvage (no extra model call)')
    output = salvaged as unknown as Omit<ProjectBrief, 'skill'>
    const brief = { ...(output as Omit<ProjectBrief, 'skill'>), skill }
    if (brief.colorTokens) {
      const { tokens, changed } = guardColorTokens(brief.colorTokens)
      if (changed.length > 0) brief.colorTokens = tokens
    }
    console.log(`[brief] SALVAGED skill=${skill} archetype=${brief.archetype ?? 'NONE'} pages=${brief.pageMap?.length ?? 0} sections=${brief.sections?.length ?? 0}`)
    return brief
  }

  // DERIVED FALLBACK — the never-junk floor. Specific to THIS prompt (brand + archetype from the
  // user's words, and for games a COMPLETE gameDesign so it's never mechanic-less). A solid
  // platform's worst case is mediocre-but-specific, never "My Project" with no game rules.
  console.warn('[brief] expansion failed after retry + salvage — using DERIVED fallback (from prompt)')
  const defaults: Record<Skill, Partial<ProjectBrief>> = {
    website: {
      sections: ['Hero', 'About', 'Services', 'Gallery', 'Testimonials', 'Contact', 'Footer'],
      features: [],
      archetype: 'editorial-magazine',
      navStyle: 'split-cta',
      backgroundTreatment: 'noise-grain',
      pageMap: [
        { page: 'Home', route: '/', sections: ['Hero', 'About', 'Services', 'Testimonials', 'CTA'] },
        { page: 'About', route: '/about', sections: ['Story', 'Team', 'Values'] },
        { page: 'Services', route: '/services', sections: ['Services', 'Process', 'Pricing'] },
        { page: 'Contact', route: '/contact', sections: ['Contact form', 'Map', 'Hours'] },
      ],
      qualityBar: [
        'Every nav link goes to a real page or a real on-page section — no dead links',
        'The contact form validates required fields and shows a success state on submit',
        'Each page has its own distinct content — no page is a copy of the homepage',
        'Layout holds from desktop to a 375px phone with no horizontal overflow',
      ],
    },
    webapp: {
      sections: ['Dashboard', 'Main View', 'Settings'],
      features: ['CRUD operations', 'localStorage persistence'],
      qualityBar: [
        'The core create/read/update/delete loop works end-to-end',
        'Data persists across a page reload (localStorage)',
        'Empty, loading, and error states are handled — never a blank screen',
        'Works on mobile with reachable touch targets and a usable nav',
      ],
    },
    game: {
      sections: ['Start Screen', 'Gameplay', 'Game Over'],
      features: ['Keyboard controls', 'Touch controls', 'Score tracking', 'High score'],
      gameDesign: fallbackGameDesign(userPrompt),
      qualityBar: [
        'Full loop works: start screen → play → game over → restart',
        'Both keyboard and touch controls move the player',
        'Score increments during play and a high score persists across reloads',
        'Difficulty ramps as the game progresses',
      ],
    },
  }

  return {
    brandName: deriveBrandName(userPrompt, skill),
    tagline: 'Built with Codemine',
    skill,
    archetype: pickArchetype(userPrompt, skill),
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
