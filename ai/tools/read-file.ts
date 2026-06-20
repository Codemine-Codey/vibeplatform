import { Sandbox } from '@vercel/sandbox'
import { tool } from 'ai'
import z from 'zod/v3'
import { logRead } from '@/lib/telemetry'
import { recordRead, READ_CAP } from '../read-budget'

export const readFile = () =>
  tool({
    description: 'Read ONE file in the workspace. To inspect several files for the same change, use readFiles (batch) instead — it is one round-trip rather than many.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      path: z.string().describe('Path to the file, e.g. "src/App.tsx" or "/app/src/components/Header.tsx"'),
    }),
    execute: async ({ sandboxId, path }) => {
      logRead({ kind: 'readFile', count: 1, sandboxId })
      const budget = recordRead(sandboxId)
      if (!budget.allowed) {
        return {
          error:
            `Read limit reached (${READ_CAP} reads this edit). You already have enough context — ` +
            `make your change now with patchFile. If you still cannot find the right code, use grepCode ` +
            `to locate the exact symbol instead of reading more files. Do NOT keep reading.`,
          path,
        }
      }
      try {
        const sandbox = await Sandbox.get({ sandboxId })
        const cmd = await sandbox.runCommand({ cmd: 'cat', args: [path], detached: true })
        const done = await cmd.wait()
        const [stdout, stderr] = await Promise.all([done.stdout(), done.stderr()])

        if (done.exitCode !== 0) {
          return { error: `File not found or unreadable: ${stderr || 'unknown error'}`, path }
        }
        return { content: stdout, path }
      } catch (err) {
        return { error: `Could not read file: ${err instanceof Error ? err.message : String(err)}`, path }
      }
    },
  })
