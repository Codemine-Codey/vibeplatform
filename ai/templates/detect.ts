import type { Skill } from '../types/project-brief'

/**
 * Pure regex matching — no LLM call, sub-millisecond.
 * Returns a template ID when the user prompt clearly maps to a known game/site/app.
 * Returns null for custom projects (AI generates from scratch).
 */
export function detectTemplate(prompt: string, skill: Skill): string | null {
  const p = prompt.toLowerCase()

  if (skill === 'game') {
    if (/\bsnake\b/.test(p)) return 'game-snake'
    if (/\btetris\b|\bfalling.?block|\bblock.?fall/.test(p)) return 'game-tetris'
    if (/\bflappy\b|flap.*bird|bird.*flap/.test(p)) return 'game-flappy'
    if (/\bpac.?man\b|\bpacman\b/.test(p)) return 'game-pacman'
    if (/\bpong\b|ping.?pong|bouncing.ball/.test(p)) return 'game-pong'
    if (/space.shoot|shoot.*space|space.invader|asteroid/.test(p)) return 'game-space-shooter'
    if (/\bmemory\b.*card|card.*match|\bmemory\b.*game|match.*card/.test(p)) return 'game-memory'
    if (/\bwordle\b|word.guess|guess.*word/.test(p)) return 'game-wordle'
    if (/\bminesweep|\bmine\b.*sweep/.test(p)) return 'game-minesweeper'
  }

  if (skill === 'website') {
    if (/\bsaas\b|software.startup|tech.product|app.landing|startup.landing/.test(p)) return 'website-saas'
    if (/restaurant|cafe|caf[eé]|diner|bistro|eatery|food.*place|dining|pizzeria/.test(p)) return 'website-restaurant'
    if (/\bagency\b|creative.studio|design.studio|digital.agency/.test(p)) return 'website-agency'
    if (/\bportfolio\b|my.work|showcase.*work|personal.site|freelance.site/.test(p)) return 'website-portfolio'
    if (/\bfitness\b|\bgym\b|workout|health.club|personal.trainer/.test(p)) return 'website-fitness'
  }

  if (skill === 'webapp') {
    if (/\btodo\b|task.manager|to.do\b/.test(p)) return 'webapp-todo'
    if (/\bnotes?\b|note.tak/.test(p)) return 'webapp-notes'
    if (/\bkanban\b|project.board|task.board/.test(p)) return 'webapp-kanban'
    if (/ecommerce|e.commerce|\bshop\b|\bstore\b.*product|product.*store/.test(p)) return 'webapp-ecommerce'
    if (/\bchat\b|messaging|messenger|chat.app/.test(p)) return 'webapp-chat'
  }

  return null
}
