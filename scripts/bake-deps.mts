// One-time: bake the scaffold's node_modules into the public assets bucket.
// Run: npx tsx --env-file=.env.local scripts/bake-deps.mts
// Re-run whenever the scaffold's dependencies change.
import { bakeDeps } from '../lib/baked-deps'

const url = await bakeDeps()
console.log('\n✅ Baked node_modules published at:\n' + url)
