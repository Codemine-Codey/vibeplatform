// Skill registry — progressive disclosure (index → trigger → injection).
//
// Layer 1 (index): getSkillCatalog() returns name+description for every skill —
//   a few tokens each, injected into the system prompt always.
// Layer 2 (trigger): the model calls the loadSkill tool with a name (or the
//   server deterministically picks one for the known project type).
// Layer 3 (injection): loadSkillBody(name) returns the full SKILL.md body for
//   that turn only — kept out of context until actually needed.
//
// Skill .md files are bundled as raw strings by the existing md→string loader
// (next.config.ts / turbopack), so there is no runtime filesystem read.
import tasteDesign from './taste-design.md'
import webappPatterns from './webapp-patterns.md'
import gamePatterns from './game-patterns.md'
import motionFx from './motion-fx.md'
import type { Skill } from '@/ai/types/project-brief'

const RAW: Record<string, string> = {
  'taste-design': tasteDesign,
  'webapp-patterns': webappPatterns,
  'game-patterns': gamePatterns,
  'motion-fx': motionFx,
}

export interface SkillMeta {
  name: string
  description: string
}

// Parse the YAML-ish frontmatter (name + description) and the body after it.
function parse(raw: string): { name: string; description: string; body: string } {
  const m = raw.match(/^---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/)
  if (!m) return { name: '', description: '', body: raw }
  const fm = m[1]
  const name = (fm.match(/name:\s*(.+)/)?.[1] ?? '').trim()
  const description = (fm.match(/description:\s*(.+)/)?.[1] ?? '').trim()
  return { name, description, body: m[2].trim() }
}

const PARSED = Object.fromEntries(
  Object.entries(RAW).map(([key, raw]) => [key, parse(raw)])
)

export const SKILL_NAMES = Object.keys(RAW)

// Layer 1 — the always-in-context catalog.
export function getSkillCatalog(): SkillMeta[] {
  return Object.entries(PARSED).map(([key, p]) => ({
    name: key,
    description: p.description || key,
  }))
}

// Layer 3 — the on-demand body. Returns null for an unknown name.
export function loadSkillBody(name: string): string | null {
  const p = PARSED[name]
  return p ? p.body : null
}

// Which design skill a known project type should generate against (deterministic
// injection for the new-project pipeline, so design depth always reaches file gen).
export function designSkillFor(skill: Skill): string {
  if (skill === 'game') return 'game-patterns'
  if (skill === 'webapp') return 'webapp-patterns'
  return 'taste-design'
}
