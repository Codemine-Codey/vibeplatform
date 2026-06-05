export type Skill = 'website' | 'webapp' | 'game'

export interface ProjectBrief {
  brandName: string
  tagline: string
  skill: Skill
  colorPalette: string    // e.g. "warm amber, espresso brown, cream white"
  fontPairing: string     // e.g. "Playfair Display + DM Sans"
  tone: string            // e.g. "warm, artisanal, sophisticated"
  brandPersonality: string // e.g. "premium, cozy, authentic"
  sections: string[]      // website: ordered sections | game: screens | app: views
  features: string[]      // specific features/mechanics to implement
  techStack: string       // e.g. "React + Vite, localStorage, React Router"
}

export function formatBrief(brief: ProjectBrief): string {
  const lines = [
    `Brand: ${brief.brandName}`,
    `Tagline: ${brief.tagline}`,
    `Type: ${brief.skill}`,
    `Colors: ${brief.colorPalette}`,
    `Fonts: ${brief.fontPairing}`,
    `Tone: ${brief.tone}`,
    `Personality: ${brief.brandPersonality}`,
    `Tech: ${brief.techStack}`,
  ]
  if (brief.sections.length) {
    lines.push(`Structure: ${brief.sections.join(' → ')}`)
  }
  if (brief.features.length) {
    lines.push(`Features: ${brief.features.join(', ')}`)
  }
  return lines.join('\n')
}
