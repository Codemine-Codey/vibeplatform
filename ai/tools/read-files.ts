import { Sandbox } from '@vercel/sandbox'
import { tool } from 'ai'
import z from 'zod/v3'
import { logRead } from '@/lib/telemetry'
import { recordRead, READ_CAP } from '../read-budget'
import { markFileRead } from '../edit-tracker'

// Batch read: fetches MANY files in ONE tool call instead of one round-trip per
// file. Each serial readFile is a full model step (call -> cat -> resume); doing
// them together collapses N round-trips into 1, which is the dominant edit-latency
// cost. The model is steered (in prompt.md) to prefer this for any multi-file edit.
export const readFiles = () =>
  tool({
    description:
      'Read MULTIPLE files in ONE call. ALWAYS prefer this over reading files one at a time: ' +
      'pass every file you need to inspect for this change in a single call. Returns each file\'s content (or an error per file).',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      paths: z
        .array(z.string())
        .min(1)
        .describe('All file paths to read together, e.g. ["src/App.tsx", "src/components/Nav.tsx", "src/index.css"]'),
    }),
    execute: async ({ sandboxId, paths }) => {
      logRead({ kind: 'readFiles', count: paths.length, sandboxId })
      // One batched call counts as ONE round-trip regardless of file count — the
      // pattern we want. Only blocks once the model has thrashed past the cap.
      const budget = recordRead(sandboxId)
      if (!budget.allowed) {
        return {
          error:
            `Read limit reached (${READ_CAP} reads this edit). You already have enough context — ` +
            `make your change now with patchFile. If you cannot find the right code, use grepCode to ` +
            `locate the exact symbol instead of reading more files.`,
        }
      }
      try {
        const sandbox = await Sandbox.get({ sandboxId })
        const files = await Promise.all(
          paths.map(async (path) => {
            try {
              const cmd = await sandbox.runCommand({ cmd: 'cat', args: [path], detached: true })
              const done = await cmd.wait()
              if (done.exitCode !== 0) {
                const stderr = await done.stderr()
                return { path, error: `Not found or unreadable: ${stderr || 'unknown error'}` }
              }
              // Read-first invariant: mark each file the model has now seen.
              markFileRead(sandboxId, path)
              return { path, content: await done.stdout() }
            } catch (e) {
              return { path, error: e instanceof Error ? e.message : String(e) }
            }
          })
        )
        return { files }
      } catch (err) {
        return { error: `Could not read files: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
  })
