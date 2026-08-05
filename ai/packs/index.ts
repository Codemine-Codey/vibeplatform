import type { Skill } from '@/ai/types/project-brief'
import websitePack from './website.md.ts'
import webappPack from './webapp.md.ts'
import gamePack from './game.md.ts'

const PACKS: Record<Skill, string> = {
  website: websitePack,
  webapp: webappPack,
  game: gamePack,
}

export function getSkillPack(skill: Skill): string {
  return PACKS[skill]
}
