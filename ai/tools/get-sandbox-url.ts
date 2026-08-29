import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { Sandbox } from '@vercel/sandbox'
import { getSandboxCredentials } from '@/lib/sandbox-credentials'
import { tool } from 'ai'
import description from './get-sandbox-url.md.ts'
import z from 'zod/v3'

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export const getSandboxURL = ({ writer }: Params) =>
  tool({
    description,
    inputSchema: z.object({
      sandboxId: z
        .string()
        .describe(
          "The unique identifier of the Vercel Sandbox (e.g., 'sbx_abc123xyz'). This ID is returned when creating a Vercel Sandbox and is used to reference the specific sandbox instance."
        ),
      port: z
        .number()
        .describe(
          'The port number where a service is running inside the Vercel Sandbox (e.g., 3000 for Next.js dev server, 8000 for Python apps, 5000 for Flask). The port must have been exposed when the sandbox was created or when running commands.'
        ),
    }),
    execute: async ({ sandboxId, port }, { toolCallId }) => {
      writer.write({
        id: toolCallId,
        type: 'data-get-sandbox-url',
        data: { status: 'loading' },
      })

      try {
        const sandbox = await Sandbox.get({ ...getSandboxCredentials(), sandboxId })
        const url = sandbox.domain(port)

        // ── ensureListening (2026-08-25) ──────────────────────────────────────
        // NEVER reveal a URL that 502s. On the edit/nudge path a reopened sandbox
        // often has NO dev server running yet — returning the URL blind is exactly
        // the "said preview is live → 502 SANDBOX_NOT_LISTENING" the user hit. Probe
        // the port; if it's not listening, (re)start the dev server and poll briefly.
        const probe = (u: string) =>
          fetch(u, { signal: AbortSignal.timeout(5000) }).then(r => r.status).catch(() => 0)
        let status = await probe(url)
        const down = (s: number) => s === 0 || s === 502 || s === 503
        if (down(status)) {
          try {
            await sandbox.runCommand({
              detached: true,
              cmd: 'bash',
              args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'],
            })
          } catch { /* non-fatal — poll anyway in case it was already booting */ }
          const deadline = Date.now() + 35_000
          while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 2500))
            status = await probe(url)
            if (!down(status)) break
          }
        }

        if (down(status)) {
          // Still not listening — do NOT claim it's live. Keep the client on the
          // loading state (no url) and tell the AI plainly so it doesn't lie to the user.
          writer.write({ id: toolCallId, type: 'data-get-sandbox-url', data: { status: 'loading' } })
          return {
            url,
            notReady: true,
            note:
              'The preview server is still starting and is NOT responding yet. Do NOT tell the user the preview is live. ' +
              'Say you are getting the preview ready and it will appear in a moment, then finish your turn — it refreshes automatically.',
          }
        }

        writer.write({
          id: toolCallId,
          type: 'data-get-sandbox-url',
          data: { url, status: 'done' },
        })

        return { url }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        writer.write({
          id: toolCallId,
          type: 'data-get-sandbox-url',
          data: { status: 'done' },
        })
        return { error: `Could not retrieve sandbox URL: ${message}` }
      }
    },
  })
