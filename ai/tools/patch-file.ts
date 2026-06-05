import { Sandbox } from '@vercel/sandbox'
import { tool } from 'ai'
import z from 'zod/v3'

export const patchFile = () =>
  tool({
    description: 'Apply a targeted string replacement to a file. Use for small edits instead of regenerating the whole file. Always use readFile first to get the exact current content.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      path: z.string().describe('Path to the file to patch'),
      oldString: z.string()
        .describe('The exact string to replace, including surrounding whitespace/newlines. Must match exactly.'),
      newString: z.string()
        .describe('The replacement string'),
    }),
    execute: async ({ sandboxId, path, oldString, newString }) => {
      try {
        const sandbox = await Sandbox.get({ sandboxId })

        // Read current content
        const readCmd = await sandbox.runCommand({ cmd: 'cat', args: [path], detached: true })
        const readDone = await readCmd.wait()
        if (readDone.exitCode !== 0) {
          return { success: false, error: `Could not read ${path} — use readFile first to verify the path` }
        }
        const current = await readDone.stdout()

        if (!current.includes(oldString)) {
          return {
            success: false,
            error: `Exact string not found in ${path}. Use readFile to get the current content, then match exactly.`,
          }
        }

        const updated = current.replace(oldString, newString)
        await sandbox.writeFiles([{ path, content: Buffer.from(updated, 'utf8') }])
        return { success: true, path, message: `Patched ${path}` }
      } catch (err) {
        return { success: false, error: `Patch failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
  })
