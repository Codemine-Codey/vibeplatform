// One-time: bake node_modules for each project type into the public assets bucket.
// Run: npx tsx --env-file=.env.local scripts/bake-deps.mts
// Re-run whenever a scaffold's dependencies change.
import { bakeDeps } from '../lib/baked-deps'

console.log('=== Baking WEB (websites/apps) ===')
const webUrl = await bakeDeps()
console.log('✅ web:', webUrl, '\n')

console.log('=== Baking GAME ===')
const gameUrl = await bakeDeps('game')
console.log('✅ game:', gameUrl)
