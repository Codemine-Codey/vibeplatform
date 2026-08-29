import { defineConfig } from '@trigger.dev/sdk/v3'
import { puppeteer } from '@trigger.dev/build/extensions/puppeteer'
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
    // puppeteer(): installs google-chrome-stable into the deploy image + sets
    // PUPPETEER_EXECUTABLE_PATH, so the render-check (the "never reveal a blank" gate)
    // actually runs on Trigger instead of silently skipping.
    extensions: [pathAliasPlugin, puppeteer()],
  },
})
