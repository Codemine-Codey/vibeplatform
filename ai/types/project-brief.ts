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
- BANNED defaults: Inter, Poppins, Roboto, Arial, system-ui as the *display* face. Use the pairing above.

### Signature Moves (must appear in the build — this is what makes it look art-directed)
${moves}

### Layout & Motion
- **Layout archetype:** ${brief.layoutStyle} — commit to it; do not fall back to a generic stacked-section template.
- **Brand personality:** ${brief.brandPersonality} · Tone: ${brief.tone}
- **Motion:** ${motionContract(brief.motionIntensity)}
${gameBlock}
### Build Spec
- **Structure:** ${sectionList}
- **Features:** ${featureList}
- **Tech:** ${brief.techStack}`
}
