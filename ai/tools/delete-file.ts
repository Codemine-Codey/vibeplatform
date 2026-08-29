import { Sandbox } from '@vercel/sandbox'
import { getSandboxCredentials } from '@/lib/sandbox-credentials'
import { tool } from 'ai'
import z from 'zod/v3'

// Scaffold-owned files that must never be deleted — they are read-only system files.
const PROTECTED = new Set([
  'src/main.tsx', 'src/App.tsx', 'vite.config.ts', 'vite.config.js',
  'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
  'package.json', 'postcss.config.js', 'tailwind.config.js', 'tailwind.config.ts',
  'index.html', '.npmrc',
])

export const deleteFile = () =>
  tool({
    description:
      'Delete a file from the workspace. Use when a file is no longer needed (dead code, renamed component, refactored module). ' +
      'NEVER delete scaffold-owned files: src/main.tsx, src/App.tsx, vite.config.ts, tsconfig.json, package.json, index.html. ' +
      'Before deleting, verify with grepCode that nothing imports from this file.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      path: z.string().describe('Path to the file to delete, e.g. "src/components/OldWidget.tsx"'),
    }),
    execute: async ({ sandboxId, path }) => {
      const normalized = path.replace(/^\.\//, '')
      if (PROTECTED.has(normalized)) {
        return {
          success: false,
          error: `"${path}" is a scaffold-owned file and cannot be deleted. It is read-only system infrastructure.`,
        }
      }

      try {
        const sandbox = await Sandbox.get({ ...getSandboxCredentials(), sandboxId })
        const cmd = await sandbox.runCommand({
          cmd: 'rm',
          args: ['-f', path],
          detached: true,
        })
        const done = await cmd.wait()

        if (done.exitCode !== 0) {
          const stderr = await done.stderr()
          return { success: false, error: `Could not delete "${path}": ${stderr}` }
        }

        return { success: true, path, message: `Deleted ${path}.` }
      } catch (err) {
        return { success: false, error: `Delete failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
  })
