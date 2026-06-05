import { Sandbox } from '@vercel/sandbox'
import { tool } from 'ai'
import z from 'zod/v3'

export const readFile = () =>
  tool({
    description: 'Read the current content of a file in the workspace. Always use this before editing a file to avoid overwriting unrelated code.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      path: z.string().describe('Path to the file, e.g. "src/App.tsx" or "/app/src/components/Header.tsx"'),
    }),
    execute: async ({ sandboxId, path }) => {
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
