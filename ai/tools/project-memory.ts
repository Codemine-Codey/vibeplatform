import { Sandbox } from '@vercel/sandbox'
import { tool } from 'ai'
import z from 'zod/v3'

const MEMORY_PATH = '.codey/memory.md'

// Project memory — persists across edit sessions.
// Codey writes to this file after every initial build and reads it at the start
// of every edit session so it knows the project structure without re-reading files.
export const getProjectMemory = () =>
  tool({
    description:
      'Read the project memory file (.codey/memory.md) at the start of an edit session. ' +
      'The memory contains: all generated files and their purpose, design decisions (colors/fonts/tone), ' +
      'user preferences from past edits, and recent fix history. ' +
      'Always call this FIRST in an edit session before touching any files — it tells you what exists and what has been done.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
    }),
    execute: async ({ sandboxId }) => {
      try {
        const sandbox = await Sandbox.get({ sandboxId })
        const cmd = await sandbox.runCommand({
          cmd: 'cat',
          args: [MEMORY_PATH],
          detached: true,
        })
        const done = await cmd.wait()

        if (done.exitCode !== 0) {
          return {
            exists: false,
            memory: null,
            note: 'No project memory found — this is a fresh project or memory was not yet written. Proceed by reading the relevant files.',
          }
        }

        const memory = await done.stdout()
        return {
          exists: true,
          memory: memory.slice(0, 8000),
          note: 'Use this context to understand the project before making changes. Do not re-read files already described here.',
        }
      } catch (err) {
        return {
          exists: false,
          memory: null,
          error: `Could not read memory: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },
  })

export const updateProjectMemory = () =>
  tool({
    description:
      'Write or update the project memory file (.codey/memory.md). ' +
      'Call this after every initial build (to record the full file manifest, design, and stack) ' +
      'and after every significant edit (to record what changed and why). ' +
      'The memory file is how Codey knows the project state when a user returns for edits.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      content: z.string().describe(
        'Full markdown content for the memory file. Include:\n' +
        '# Project Memory\n' +
        'Type: game|webapp|website\n' +
        'Built: YYYY-MM-DD\n' +
        'Stack: [key packages]\n\n' +
        '## File Manifest\n' +
        '- path — purpose (one line)\n\n' +
        '## Design\n' +
        'Colors, fonts, tone\n\n' +
        '## User Preferences\n' +
        '(things the user corrected or asked for)\n\n' +
        '## Recent Edits\n' +
        '- what changed and why'
      ),
    }),
    execute: async ({ sandboxId, content }) => {
      try {
        const sandbox = await Sandbox.get({ sandboxId })

        // Ensure directory exists
        const mkdir = await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', '.codey'], detached: true })
        await mkdir.wait()

        await sandbox.writeFiles([{ path: MEMORY_PATH, content: Buffer.from(content, 'utf8') }])

        return {
          success: true,
          path: MEMORY_PATH,
          message: 'Project memory updated.',
        }
      } catch (err) {
        return {
          success: false,
          error: `Could not write memory: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },
  })
