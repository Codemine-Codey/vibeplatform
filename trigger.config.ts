import { defineConfig } from '@trigger.dev/sdk/v3'
import { resolve } from 'path'

// Resolve @/ path alias (tsconfig paths) for Trigger's esbuild bundler
const pathAliasPlugin = {
  name: 'path-alias',
  setup(build: any) {
    build.onResolve({ filter: /^@\// }, (args: any) => ({
      path: resolve(process.cwd(), args.path.replace(/^@\//, '')),
    }))
  },
}

export default defineConfig({
  project: 'proj_nlmodrfbyggqvsxglojv',
  dirs: ['./src/trigger'],
  maxDuration: 3600, // 1 hour — no 12-min cap
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1, // NEVER retry automatically — billing safety (retry-storm lesson)
    },
  },
  build: {
    extensions: [pathAliasPlugin],
  },
})
