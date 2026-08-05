#!/usr/bin/env node
// Reads all .md files used by AI tools and generates companion .ts files.
// This eliminates static .md imports which break @workflow/builders esbuild.
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const files = [
  'ai/tools/generate-files.md',
  'ai/tools/create-sandbox.md',
  'ai/tools/run-command.md',
  'ai/tools/get-sandbox-url.md',
  'ai/tools/visual-check.md',
  'ai/skills/website-design.md',
  'ai/skills/taste-design.md',
  'ai/skills/webapp-patterns.md',
  'ai/skills/game-patterns.md',
  'ai/skills/motion-fx.md',
  'ai/skills/threejs.md',
  'ai/skills/components.md',
  'ai/packs/website.md',
  'ai/packs/webapp.md',
  'ai/packs/game.md',
]

for (const rel of files) {
  const src = join(root, rel)
  const dst = src.replace(/\.md$/, '.md.ts')
  const content = readFileSync(src, 'utf-8')
  // Escape for template literal: backslashes, backticks, ${
  const escaped = content
    .split('\\').join('\\\\')
    .split('`').join('\\`')
    .split('${').join('\\${')
  const name = basename(rel)
  writeFileSync(dst, `// AUTO-GENERATED from ${name} — edit the .md file, then re-run scripts/gen-md-strings.mjs\nconst content = \`${escaped}\`\nexport default content\n`, 'utf-8')
  console.log('Generated', rel.replace(/\.md$/, '.md.ts'))
}
console.log('Done.')
