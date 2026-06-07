export interface TemplateFile {
  path: string
  content: string
}

export interface Template {
  id: string
  name: string
  skill: 'website' | 'webapp' | 'game'
  /** Files AI must NOT regenerate — they're pre-written to sandbox */
  scaffoldFiles: TemplateFile[]
  /** File(s) AI writes to personalize the template (theme.ts, brand.ts, content.ts) */
  personalityFiles: string[]
  /** Instruction injected into system prompt so AI knows what to generate */
  instruction: string
}
