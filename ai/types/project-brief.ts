export type Skill = 'website' | 'webapp' | 'game'

// Stage 1/3 — semantic color roles as data (not prose). Hex values, domain-driven.
// These become the SINGLE source of truth: written once as CSS variables in
// src/index.css, then referenced everywhere via token classes — no per-component
// re-decisions, which is what kills "the colors are sometimes off".
export interface ColorTokens {
  background: string       // page background
  surface: string          // cards, raised sections
  foreground: string       // primary text
  mutedForeground: string  // secondary / supporting text
  primary: string          // brand colour — CTAs, key accents
  accent: string           // secondary highlight
}

// W2 Design Director — enumerated VISUAL LANGUAGE. The single biggest anti-sameness
// lever: the model must COMMIT to one distinct archetype (not freeform "clean minimal"),
// one nav style, and a background treatment. Each maps to concrete structural rules in
// the design skills/library so "picked X" turns into a genuinely different-looking build.
export type Archetype =
  | 'editorial-magazine'   // asymmetric columns, big serif headlines, drop caps, generous margins
  | 'bento-grid'           // modular rounded cards of varying sizes, dense but airy
  | 'swiss-minimal'        // strict grid, oversized type, vast whitespace, 1-2 colours
  | 'brutalist-mono'       // raw borders, monospace, exposed structure, high contrast
  | 'immersive-parallax'   // full-bleed imagery, scroll-linked depth, layered
  | 'glassmorphic-dark'    // dark bg, frosted glass panels, glowing accents
  | 'warm-boutique'        // soft, organic, rounded, textured, earthy
  | 'kinetic-type'         // oversized animated typography as the hero
  | 'retro-print'          // vintage poster, halftone, bold flat colour blocks
  | 'luxury-serif'         // restrained high-end, tall serif, muted palette, negative space
  | 'playful-rounded'      // bright, bouncy, rounded shapes, friendly
  | 'corporate-clean'      // trustworthy, structured, refined, confident
  | 'art-deco'             // geometric symmetry, gold linework, tall elegant type, fan motifs
  | 'cyber-neon'           // dark futuristic, neon grid + glow, glitch, tech/gaming
  | 'organic-blob'         // flowing blob shapes, soft gradients, curvy sections
  | 'maximalist-collage'   // layered busy collage energy, mixed type, sticker/cut-out feel
  | 'scandinavian-clean'   // light wood/muted tones, functional, cozy-minimal (softer than swiss)
  | 'dark-luxe'            // black + gold/jewel tones, opulent high-contrast premium
  | 'vibrant-gradient'     // bold saturated gradients, energetic modern consumer
  | 'neo-memphis'          // 80s memphis — squiggles, confetti shapes, bold primaries, playful geometry

export type NavStyle =
  | 'left-logo-right-links'   // classic
  | 'centered-logo'           // logo centre, links split either side
  | 'split-cta'               // logo left, links centre, CTA button right
  | 'floating-pill'           // detached rounded pill floating over content
  | 'transparent-over-hero'   // transparent, turns solid on scroll
  | 'minimal-underline'       // text-only, animated underline on hover/active
  | 'sidebar-drawer'          // hamburger → slide-in drawer (mobile-first)
  | 'mega-menu'               // grouped columns for content-heavy multi-page

export type BackgroundTreatment =
  | 'flat'              // solid token background
  | 'gradient-mesh'     // soft multi-hue gradient field
  | 'noise-grain'       // subtle grain/texture over the background
  | 'animated-gradient' // slowly shifting gradient
  | 'scroll-parallax'   // parallax layers that move on scroll
  | 'aurora-glow'       // blurred glowing colour blobs
  | 'particles'         // lightweight particle field
  | '3d-scene'          // three.js / r3f scene (only when requested + suitable)
  | 'dot-grid'          // subtle dot or line grid (blueprint/technical feel)
  | 'topographic'       // layered topographic/contour lines drifting slowly
  | 'spotlight-follow'  // a soft radial spotlight that follows the cursor
  | 'video-loop'        // a muted looping background video with an overlay (hero only)

// Multi-page routing plan: which sections live on which page/route. One entry with
// route "/" = a single-page site. Multiple entries = a real multi-page site.
export interface PageSpec {
  page: string        // e.g. "Home", "About", "Services", "Contact"
  route: string       // e.g. "/", "/about", "/services", "/contact"
  sections: string[]  // ordered sections that render on this page
}

export interface ProjectBrief {
  brandName: string
  tagline: string
  skill: Skill
  colorPalette: string       // human-readable palette description
  colorTokens: ColorTokens   // Stage 1/3 — the locked semantic palette (hex)
  fontPairing: string        // e.g. "Playfair Display + Source Sans 3"
  tone: string               // e.g. "warm, artisanal, sophisticated"
  brandPersonality: string   // e.g. "premium, cozy, authentic"
  signatureMoves: string[]   // Stage 1 — 2-3 memorable, specific design moves
  sections: string[]         // website: ordered sections | game: screens | app: views
  features: string[]         // specific features/mechanics to implement
  techStack: string          // e.g. "React + Vite, localStorage, React Router"
  visualNarrative: string    // sensory/emotional creative direction
  layoutStyle: string        // layout archetype, e.g. "editorial dark", "bento"
  motionIntensity: 'subtle' | 'moderate' | 'dramatic'
  gameDesign?: string        // Stage 1 (games) — core loop, controls, win/lose, juice
  // W2 Design Director additions (optional for back-compat with the fallback brief)
  archetype?: Archetype
  navStyle?: NavStyle
  backgroundTreatment?: BackgroundTreatment
  pageMap?: PageSpec[]       // websites — the multi-page routing plan
}

function motionContract(intensity: ProjectBrief['motionIntensity']): string {
  switch (intensity) {
    case 'subtle':
      return 'Restrained — durations ~0.5s, translateY 16px on enter, no spring physics. Let content breathe.'
    case 'dramatic':
      return 'Dramatic — durations ~1.0s, translateY 64px, spring physics, bold stagger, a kinetic hero entrance.'
    default:
      return 'Purposeful — durations ~0.7s, translateY 32px, hover lifts, smooth stagger on lists.'
  }
}

// Each archetype → concrete, buildable structural rules. This is what makes "picked X"
// produce a genuinely different-looking site instead of the same stacked template.
const ARCHETYPE_CONTRACT: Record<Archetype, string> = {
  'editorial-magazine': 'Asymmetric multi-column layouts, an oversized serif display headline that overlaps imagery, a drop-cap intro paragraph, thin rule dividers, generous outer margins, captions in small caps. Think a printed magazine spread.',
  'bento-grid': 'A modular grid of rounded cards in varying spans (2x1, 1x2, 2x2). Each feature/stat/testimonial is a card. Uneven but balanced. Soft shadows, rounded-2xl, hover lift. NOT plain equal columns.',
  'swiss-minimal': 'A strict typographic grid, HUGE headlines (7xl+), vast whitespace, 1-2 colours only, left-aligned, hairline rules. Restraint is the point — almost no decoration, let type + space carry it.',
  'brutalist-mono': 'Exposed structure: thick visible borders, monospace type, raw high-contrast blocks, offset/overlapping elements, no rounded corners, stark black/white + one loud accent. Deliberately raw.',
  'immersive-parallax': 'Full-bleed edge-to-edge imagery, scroll-linked parallax depth (background moves slower than foreground), layered sections that overlap, a cinematic scroll journey. Sections bleed into each other.',
  'glassmorphic-dark': 'Dark background, frosted-glass panels (backdrop-blur + translucent surface + subtle border), glowing accent edges, soft neon highlights, depth via blur and light. Premium and futuristic.',
  'warm-boutique': 'Soft organic shapes, rounded-3xl, earthy textured palette, hand-crafted feel, imagery with warmth, gentle curves, cozy generous padding. Inviting, tactile, human.',
  'kinetic-type': 'Typography IS the design: oversized animated words as the hero, marquee/ticker rows, letters that react to scroll/hover, minimal imagery. The headline is the art.',
  'retro-print': 'Vintage poster energy: bold flat colour blocks, halftone/grain texture, chunky condensed type, offset print look, a limited retro palette. Nostalgic and confident.',
  'luxury-serif': 'Restrained luxury: a tall elegant serif, muted sophisticated palette, enormous negative space, small refined UI, slow subtle motion. Nothing shouts; everything is deliberate.',
  'playful-rounded': 'Bright saturated palette, bouncy rounded shapes, playful blobs, chunky rounded buttons, springy hover, friendly oversized emoji-free iconography. Fun and energetic.',
  'corporate-clean': 'Confident and trustworthy: a clear grid, refined type, structured cards, a professional restrained palette with one strong accent, crisp spacing. Polished, not boring — art-directed corporate.',
  'art-deco': 'Geometric symmetry, gold/brass linework and thin frames, tall elegant condensed type, fan/sunburst motifs (CSS gradients + borders), rich jewel background. Glamorous 1920s poise.',
  'cyber-neon': 'Dark futuristic base, neon accent glow (text-shadow/box-shadow), a faint tech grid, glitch/scanline touches, monospace accents. For gaming/tech/web3 — never for warm/food brands.',
  'organic-blob': 'Flowing organic blob shapes (border-radius morphing, SVG-free CSS blobs), soft multi-stop gradients, curved section dividers, generous rounded forms. Friendly-premium and fluid.',
  'maximalist-collage': 'Layered, deliberately busy collage energy: overlapping cut-out images, mixed type sizes/weights, sticker-like badges, bold clashing-but-curated colour. Confident and loud.',
  'scandinavian-clean': 'Light, calm, functional: muted warm neutrals + soft wood tones, plenty of air, simple rounded UI, cozy imagery, understated type. Softer and warmer than swiss-minimal.',
  'dark-luxe': 'Opulent dark: near-black base with gold or deep jewel accents, high contrast, thin refined serif, subtle sheen/gradient on surfaces, generous spacing. Expensive and dramatic.',
  'vibrant-gradient': 'Bold saturated gradient hero and accents, high-energy modern-consumer feel, big rounded type, gradient buttons and glows. Fresh and punchy — great for apps/startups/events.',
  'neo-memphis': 'Playful 80s Memphis: squiggles, confetti dots, zig-zags and geometric shapes (CSS), bold primary colours on a light base, chunky type. Retro-fun and energetic.',
}

const NAV_CONTRACT: Record<NavStyle, string> = {
  'left-logo-right-links': 'Logo left, primary links + CTA on the right. Classic and clear.',
  'centered-logo': 'Logo centred, links split to either side (2-3 left, 2-3 right). Balanced, editorial.',
  'split-cta': 'Logo left, links centred, a distinct primary CTA button pinned right.',
  'floating-pill': 'A detached rounded-full pill nav floating with a margin from the top, backdrop-blur, subtle shadow — hovers over the hero.',
  'transparent-over-hero': 'Transparent over the hero, no background; becomes a solid/blurred bar with a shadow after scrolling ~80px (track scrollY).',
  'minimal-underline': 'Text-only links, no buttons, an animated underline that slides in on hover and marks the active route. Very restrained.',
  'sidebar-drawer': 'Compact top bar; a hamburger opens a full slide-in drawer (mobile-first, also works on desktop for a minimal look). Great for content-heavy sites.',
  'mega-menu': 'Top bar where a primary item opens a wide grouped panel of links in columns. For content-heavy multi-page sites.',
}

const BG_CONTRACT: Record<BackgroundTreatment, string> = {
  'flat': 'Solid token background. Let layout + type carry it.',
  'gradient-mesh': 'A soft multi-hue mesh gradient (2-3 blurred radial blobs from the palette) behind content. CSS only.',
  'noise-grain': 'A subtle grain/noise texture over the background (a tiling data-URI or a low-opacity animated grain div). Adds tactility.',
  'animated-gradient': 'A slowly shifting CSS gradient (background-position or hue over ~12s ease-in-out infinite). Calm, alive.',
  'scroll-parallax': 'Background layers that translate on scroll (useScroll/useTransform) slower than the foreground for depth.',
  'aurora-glow': 'Large blurred glowing colour blobs (blur-3xl, palette hues, low opacity) drifting slowly behind content. Premium dark look.',
  'particles': 'A lightweight particle/constellation field (canvas or tsparticles) behind the hero. Keep it subtle and performant.',
  '3d-scene': 'A three.js / @react-three/fiber scene (floating geometry, a product, or an abstract shader) as the hero backdrop. Only when the brief calls for it and performance allows.',
  'dot-grid': 'A subtle dot or line grid (CSS radial-gradient or repeating-linear-gradient) at low opacity — a blueprint/technical texture behind content.',
  'topographic': 'Layered topographic/contour lines (repeating conic/linear gradients or a tiling pattern) drifting very slowly. Adds quiet depth.',
  'spotlight-follow': 'A soft radial spotlight that follows the cursor (a radial-gradient div positioned from pointer coords). Premium on dark backgrounds; disable on touch/reduced-motion.',
  'video-loop': 'A muted, autoplay, looping background video in the hero with a dark gradient overlay for legibility. Hero only; provide a poster + token-colour fallback.',
}

function designLanguageBlock(brief: ProjectBrief): string {
  const parts: string[] = []
  if (brief.archetype) parts.push(`- **Archetype: ${brief.archetype}** — ${ARCHETYPE_CONTRACT[brief.archetype]}\n  BUILD to this archetype; do NOT regress to a generic centered stacked-section template.`)
  if (brief.navStyle) parts.push(`- **Nav style: ${brief.navStyle}** — ${NAV_CONTRACT[brief.navStyle]} (Always fully responsive with a working mobile menu.)`)
  if (brief.backgroundTreatment && brief.backgroundTreatment !== 'flat') parts.push(`- **Background: ${brief.backgroundTreatment}** — ${BG_CONTRACT[brief.backgroundTreatment]}`)
  return parts.length ? `\n### Design Language (committed — this is what makes it look distinct)\n${parts.join('\n')}\n` : ''
}

function routingBlock(brief: ProjectBrief): string {
  if (brief.skill !== 'website' || !brief.pageMap || brief.pageMap.length === 0) return ''
  if (brief.pageMap.length === 1) {
    return `\n### Routing — SINGLE PAGE\nEverything on one scrolling page at "/". Nav items are in-page ANCHORS (href="#section-id") that scroll to the matching section — NEVER routes.\n`
  }
  const rows = brief.pageMap
    .map((p) => `- **${p.page}** → \`src/pages/${p.page.replace(/[^A-Za-z0-9]/g, '')}.tsx\` (route \`${p.route}\`): ${p.sections.join(', ')}`)
    .join('\n')
  return `\n### Routing — MULTI-PAGE (${brief.pageMap.length} pages)\nBuild one \`src/pages/*.tsx\` per page (filename → route, auto-routed). Nav links to OTHER pages use \`<Link to="/route">\`; links to a section on the CURRENT page use \`href="#id"\`. Every nav target must be a real page or a real on-page anchor — never a route you didn't build.\n${rows}\n`
}

export function formatBrief(brief: ProjectBrief): string {
  const sectionList = brief.sections.length ? brief.sections.join(' → ') : '(see features)'
  const featureList = brief.features.length ? brief.features.join(', ') : '(standard)'
  const t = brief.colorTokens
  const moves = brief.signatureMoves.length
    ? brief.signatureMoves.map((m, i) => `${i + 1}. ${m}`).join('\n')
    : '1. A distinctive hero treatment\n2. A scroll-linked reveal\n3. A cohesive accent system'

  const gameBlock = brief.skill === 'game' && brief.gameDesign
    ? `\n### Game Design Contract (non-negotiable)\n${brief.gameDesign}\n`
    : ''

  return `## PROJECT BRIEF — ${brief.brandName.toUpperCase()}
**"${brief.tagline}"**

### Creative Direction
${brief.visualNarrative}

### LOCKED DESIGN TOKENS — write these into src/index.css FIRST, before any component
These are the ONLY colours in this project. Define them as CSS variables in \`:root\` and
reference them through Tailwind token classes (\`bg-background\`, \`bg-card\`, \`text-foreground\`,
\`text-muted-foreground\`, \`bg-primary\`, \`text-accent\`, etc.). NEVER write a raw hex value,
\`text-white\`, \`bg-black\`, or a one-off \`bg-[#…]\` in a component — every colour comes from a token.
- **background** (page): ${t.background}
- **surface / card**: ${t.surface}
- **foreground** (text): ${t.foreground}
- **muted-foreground** (secondary text): ${t.mutedForeground}
- **primary** (brand / CTA): ${t.primary}
- **accent** (highlight): ${t.accent}
Map these to the shadcn variables already wired in the Tailwind theme (\`--background\`, \`--card\`,
\`--foreground\`, \`--muted-foreground\`, \`--primary\`, \`--accent\`), deriving sensible foreground/
border values for contrast. Define one component variant each for buttons, cards, and inputs so
every page inherits the same craft.

### Typography
- **Pairing:** ${brief.fontPairing} — load via Google Fonts \`@import\` at the very top of src/index.css.
  Display font for headings at large scale with tight tracking; body font for copy at 16–18px.
- **Fluid scale (mandatory):** size the hero + headings with \`clamp()\` (e.g. \`text-[clamp(2.5rem,8vw,7rem)]\`) so type is huge on desktop but never overflows a 375px phone. A clear scale: display → h2 → h3 → body → caption, distinct in size AND weight.
- **Animate the headline:** the hero headline and 1–2 key titles get ONE text-motion idiom (word/line reveal, character stagger, gradient sweep, or scroll-linked emphasis) scaled to the motion dial. Respect reduced-motion.
- BANNED defaults: Inter, Poppins, Roboto, Arial, system-ui as the *display* face. Use the pairing above.

### Signature Moves (must appear in the build — this is what makes it look art-directed)
${moves}

### Layout & Motion
- **Layout archetype:** ${brief.layoutStyle} — commit to it; do not fall back to a generic stacked-section template.
- **Brand personality:** ${brief.brandPersonality} · Tone: ${brief.tone}
- **Motion:** ${motionContract(brief.motionIntensity)}
${designLanguageBlock(brief)}${routingBlock(brief)}${gameBlock}
### Build Spec
- **Structure:** ${sectionList}
- **Features:** ${featureList}
- **Tech:** ${brief.techStack}

### SECTION QUALITY BAR (non-negotiable — every section must be "aww", never a placeholder)
Each section is a distinctly-composed, fully-realized block — NOT the same centered headline+paragraph repeated. Vary the composition section to section (split 60/40, offset, overlap, full-bleed, grid, marquee) so no two sections look alike. Every section: real contextual copy, real imagery, a scroll-reveal or scroll-linked motion, and craft in spacing/type/colour from the tokens. Fill it beautifully — empty, thin, or lorem sections are a failure.`
}
