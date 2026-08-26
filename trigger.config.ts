import { defineConfig } from '@trigger.dev/sdk/v3'

export default defineConfig({
  project: 'proj_nlmodrfbyggqvsxglojv',
  dirs: ['./src/trigger'],
  maxDuration: 3600, // 1 hour — no 12-min cap
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1, // NEVER retry automatically — re-entry storm prevention (learned from Vercel retry-storm)
    },
  },
})
