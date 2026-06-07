import type { Template, TemplateFile } from './types'
import { snakeTemplate, defaultSnakeTheme }       from './game-snake'
import { tetrisTemplate, defaultTetrisTheme }     from './game-tetris'
import { flappyTemplate, defaultFlappyTheme }     from './game-flappy'
import { pongTemplate, defaultPongTheme }         from './game-pong'
import { saasTemplate }                           from './website-saas'
import { restaurantTemplate }                     from './website-restaurant'

const registry: Record<string, Template> = {
  'game-snake':         snakeTemplate,
  'game-tetris':        tetrisTemplate,
  'game-flappy':        flappyTemplate,
  'game-pong':          pongTemplate,
  'website-saas':       saasTemplate,
  'website-restaurant': restaurantTemplate,
}

export function getTemplate(id: string): Template | null {
  return registry[id] ?? null
}

/**
 * Returns the scaffold files for a template (written to sandbox before AI generates).
 * Also includes the default personality file so the sandbox can start a dev server
 * immediately — the AI then patchFile the personality with brand-specific values.
 */
export function getTemplateFiles(id: string): TemplateFile[] {
  const t = registry[id]
  if (!t) return []

  const files = [...t.scaffoldFiles]

  // Include a starter personality file (AI will overwrite via generateFiles)
  const defaults: Record<string, TemplateFile[]> = {
    'game-snake':  [{ path: 'src/theme.ts', content: defaultSnakeTheme }],
    'game-tetris': [{ path: 'src/theme.ts', content: defaultTetrisTheme }],
    'game-flappy': [{ path: 'src/theme.ts', content: defaultFlappyTheme }],
    'game-pong':   [{ path: 'src/theme.ts', content: defaultPongTheme }],
  }
  if (defaults[id]) files.push(...defaults[id])

  return files
}

export { registry }
export type { Template, TemplateFile }
