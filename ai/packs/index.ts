import type { Skill } from '@/ai/types/project-brief'
import websitePack from './website.md'
import webappPack from './webapp.md'
import gamePack from './game.md'

const PACKS: Record<Skill, string> = {
  website: websitePack,
  webapp: webappPack,
  game: gamePack,
}

export function getSkillPack(skill: Skill): string {
  return PACKS[skill]
}
