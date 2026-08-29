import { Sandbox } from '@vercel/sandbox'
import { getSandboxCredentials } from '@/lib/sandbox-credentials'
import { tool } from 'ai'
import z from 'zod/v3'

// Blocked packages — these would break the Vite SPA environment.
const BLOCKED = new Set([
  'express', 'koa', 'fastify', 'hapi', 'next', 'nuxt', 'remix',
  '@nestjs/core', 'motion', 'styled-components',
  '@mui/material', 'antd', 'chakra-ui', '@chakra-ui/react', 'mantine',
])

export const installPackage = () =>
  tool({
    description:
      'Install an npm package into the workspace using pnpm add. Use this when the user\'s request needs a library not already pre-installed (not in the pre-installed list). ' +
      'Do NOT use this for packages already in the scaffold: react, react-router-dom, framer-motion, lucide-react, zustand, three, @react-three/fiber, phaser, howler, recharts, etc. ' +
      'After installing, add the package to package.json\'s dependencies in the same generateFiles or patchFile call.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      packageName: z.string().describe('npm package to install, e.g. "d3" or "lottie-react" or "gsap@^3.12.0"'),
    }),
    execute: async ({ sandboxId, packageName }) => {
      const baseName = packageName.replace(/@[^@/].*$/, '').replace(/^@/, '')
      if (BLOCKED.has(packageName) || BLOCKED.has(baseName)) {
        return {
          success: false,
          error: `"${packageName}" is not compatible with the Codemine SPA stack. Use the pre-installed alternatives instead.`,
        }
      }

      try {
        const sandbox = await Sandbox.get({ ...getSandboxCredentials(), sandboxId })
        const cmd = await sandbox.runCommand({
          cmd: 'pnpm',
          args: ['add', packageName],
          detached: true,
        })
        const done = await cmd.wait()
        const stdout = await done.stdout()
        const stderr = await done.stderr()

        if (done.exitCode !== 0) {
          return {
            success: false,
            error: `pnpm add "${packageName}" failed (exit ${done.exitCode}): ${stderr.slice(0, 500)}`,
          }
        }

        return {
          success: true,
          package: packageName,
          message: `Installed "${packageName}". Now add it to package.json dependencies and import it in your code.`,
          output: stdout.slice(0, 300),
        }
      } catch (err) {
        return { success: false, error: `Install failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
  })
