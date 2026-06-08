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
  const motionDesc = brief.motionIntensity === 'subtle'
    ? 'Restrained — durations 0.5s, translate Y:16px, no spring physics. Let content breathe.'
    : brief.motionIntensity === 'moderate'
    ? 'Purposeful — durations 0.7s, translate Y:32px, hover lifts, smooth stagger on lists.'
    : 'Dramatic — durations 1.0s, translate Y:64px, spring physics, bold stagger, kinetic hero entrance.'

  return `## PROJECT BRIEF — ${brief.brandName.toUpperCase()}
**"${brief.tagline}"**

### Creative Direction

${brief.visualNarrative}

### Design Spec
- **Colors:** ${brief.colorPalette}
- **Fonts:** ${brief.fontPairing}
- **Layout archetype:** ${brief.layoutStyle}
- **Brand personality:** ${brief.brandPersonality} · Tone: ${brief.tone}
- **Motion:** ${motionDesc}

### Build Spec
- **Structure:** ${sectionList}
- **Features:** ${featureList}
- **Tech:** ${brief.techStack}`
}
