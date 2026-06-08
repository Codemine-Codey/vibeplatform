export type Skill = 'website' | 'webapp' | 'game'

export interface ProjectBrief {
  brandName: string
  tagline: string
  skill: Skill
  colorPalette: string       // e.g. "warm amber, espresso brown, cream white"
  fontPairing: string        // e.g. "Playfair Display + Source Sans 3"
  tone: string               // e.g. "warm, artisanal, sophisticated"
  brandPersonality: string   // e.g. "premium, cozy, authentic"
  sections: string[]         // website: ordered sections | game: screens | app: views
  features: string[]         // specific features/mechanics to implement
  techStack: string          // e.g. "React + Vite, localStorage, React Router"
  visualNarrative: string    // 2-3 sentence sensory/emotional description of the experience
  layoutStyle: string        // e.g. "editorial dark", "clean minimal", "bold geometric"
  motionIntensity: 'subtle' | 'moderate' | 'dramatic'
}

export function formatBrief(brief: ProjectBrief): string {
  const sectionList = brief.sections.length ? brief.sections.join(' → ') : '(see features)'
  const featureList = brief.features.length ? brief.features.join(', ') : '(standard)'

  return `## PROJECT BRIEF — ${brief.brandName.toUpperCase()}

${brief.visualNarrative}

**Visual Identity:** ${brief.colorPalette} palette. Typography: ${brief.fontPairing}. Personality: ${brief.brandPersonality}. Tone: ${brief.tone}.
**Layout:** ${brief.layoutStyle}
**Motion:** ${brief.motionIntensity === 'subtle' ? 'Restrained — soft fade-ins on scroll, no jarring movement' : brief.motionIntensity === 'moderate' ? 'Purposeful — entrance animations, hover lifts, smooth transitions' : 'Dramatic — bold hero animations, parallax, stagger reveals, kinetic energy'}
**Tagline:** "${brief.tagline}"
**Structure:** ${sectionList}
**Features:** ${featureList}
**Tech:** ${brief.techStack}`
}
