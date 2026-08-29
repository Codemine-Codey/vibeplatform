import { Sandbox } from '@vercel/sandbox'
import { getSandboxCredentials } from '@/lib/sandbox-credentials'
import { tool } from 'ai'
import z from 'zod/v3'

// Read recent dev server stderr/stdout logs from the workspace.
// Call this BEFORE getSandboxURL when a build may have errored — catches TypeScript
// errors, missing modules, and runtime crashes that would show as a blank preview.
export const readConsoleLogs = () =>
  tool({
    description:
      'Read the dev server\'s recent console output (stderr + stdout) from the workspace. ' +
      'Call this BEFORE getSandboxURL when you suspect a build error — it catches missing modules, TypeScript errors, and crashes. ' +
      'Also useful for debugging when the user reports the preview is broken. ' +
      'Returns the last N lines of the dev server log. Do NOT call this more than twice in a row (logs don\'t change while you\'re reading them).',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      lines: z.number().int().min(10).max(200).optional().default(60)
        .describe('Number of recent log lines to return (default 60)'),
      filter: z.string().optional()
        .describe('Optional text to filter for, e.g. "error" or "Cannot find module"'),
    }),
    execute: async ({ sandboxId, lines = 60, filter }) => {
      try {
        const sandbox = await Sandbox.get({ ...getSandboxCredentials(), sandboxId })

        // Try common log locations for Vite dev servers
        const logPaths = [
          '/tmp/vite-dev.log',
          '/tmp/dev-server.log',
          `${process.env.HOME ?? '/root'}/.pm2/logs/dev-out.log`,
          `${process.env.HOME ?? '/root'}/.pm2/logs/dev-error.log`,
        ]

        // First try the vite log approach — check if vite was started with 2>&1 redirection
        const findCmd = await sandbox.runCommand({
          cmd: 'bash',
          args: ['-c', `find /tmp -name "*.log" -newer /tmp 2>/dev/null | head -3; ls /tmp/*.log 2>/dev/null | head -3`],
          detached: true,
        })
        const findDone = await findCmd.wait()
        const foundLogs = (await findDone.stdout()).trim().split('\n').filter(Boolean)

        const allPaths = [...new Set([...foundLogs, ...logPaths])]

        for (const logPath of allPaths) {
          const tailCmd = await sandbox.runCommand({
            cmd: 'bash',
            args: ['-c', `test -f "${logPath}" && tail -n ${lines} "${logPath}" 2>/dev/null`],
            detached: true,
          })
          const tailDone = await tailCmd.wait()
          const output = (await tailDone.stdout()).trim()

          if (output && output.length > 10) {
            const filtered = filter
              ? output.split('\n').filter(l => l.toLowerCase().includes(filter.toLowerCase())).join('\n')
              : output

            return {
              logPath,
              lines: filtered || '(no lines matched filter)',
              hasErrors: /error|failed|cannot find|module not found/i.test(output),
            }
          }
        }

        // Fallback: try journalctl or dmesg for process output
        const journalCmd = await sandbox.runCommand({
          cmd: 'bash',
          args: ['-c', `journalctl -n ${lines} --no-pager 2>/dev/null || echo "no journal"`],
          detached: true,
        })
        const journalDone = await journalCmd.wait()
        const journalOut = (await journalDone.stdout()).trim()

        if (journalOut && journalOut !== 'no journal') {
          return { logPath: 'journalctl', lines: journalOut.slice(0, 3000), hasErrors: false }
        }

        return {
          logPath: null,
          lines: 'No dev server log file found. The dev server may still be starting, or logs are written to stdout only.',
          hasErrors: false,
          note: 'If you need to check for errors, use runCommand to run `pnpm run build` (wait: true) and check the output.',
        }
      } catch (err) {
        return {
          error: `Could not read logs: ${err instanceof Error ? err.message : String(err)}`,
          hasErrors: false,
        }
      }
    },
  })
