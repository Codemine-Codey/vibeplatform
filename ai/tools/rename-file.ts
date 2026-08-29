import { Sandbox } from '@vercel/sandbox'
import { getSandboxCredentials } from '@/lib/sandbox-credentials'
import { tool } from 'ai'
import z from 'zod/v3'

const PROTECTED = new Set([
  'src/main.tsx', 'src/App.tsx', 'vite.config.ts', 'tsconfig.json',
  'package.json', 'index.html', 'postcss.config.js', 'tailwind.config.js',
])

export const renameFile = () =>
  tool({
    description:
      'Move or rename a file in the workspace. Use instead of creating a new file and deleting the old one — this avoids broken import paths. ' +
      'After renaming, update all files that import the old path using grepCode + patchFile. ' +
      'NEVER rename scaffold-owned files.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      oldPath: z.string().describe('Current file path, e.g. "src/components/Widget.tsx"'),
      newPath: z.string().describe('New file path, e.g. "src/components/FeatureCard.tsx"'),
    }),
    execute: async ({ sandboxId, oldPath, newPath }) => {
      if (PROTECTED.has(oldPath.replace(/^\.\//, ''))) {
        return { success: false, error: `"${oldPath}" is scaffold-owned and cannot be renamed.` }
      }

      try {
        const sandbox = await Sandbox.get({ ...getSandboxCredentials(), sandboxId })

        // Ensure target directory exists
        const dir = newPath.includes('/') ? newPath.substring(0, newPath.lastIndexOf('/')) : '.'
        const mkdirCmd = await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', dir], detached: true })
        await mkdirCmd.wait()

        const cmd = await sandbox.runCommand({
          cmd: 'mv',
          args: [oldPath, newPath],
          detached: true,
        })
        const done = await cmd.wait()

        if (done.exitCode !== 0) {
          const stderr = await done.stderr()
          return { success: false, error: `Could not rename "${oldPath}" → "${newPath}": ${stderr}` }
        }

        return {
          success: true,
          oldPath,
          newPath,
          message: `Renamed ${oldPath} → ${newPath}. Update all imports that reference the old path.`,
        }
      } catch (err) {
        return { success: false, error: `Rename failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
  })
