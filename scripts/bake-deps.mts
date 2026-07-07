// One-time: bake the unified node_modules tarball into the public assets bucket.
// Run: npx tsx --env-file=.env.local scripts/bake-deps.mts
// Re-run whenever scaffold dependencies change (scaffold.ts makePackageJson).
// ONE tarball covers all project types (website + webapp + game deps merged).
import { bakeDeps } from '../lib/baked-deps'

console.log('=== Baking unified node_modules (website + webapp + game) ===')
const url = await bakeDeps()
console.log('✅ Done:', url)
