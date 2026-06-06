import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { Sandbox } from '@vercel/sandbox'
import { SCAFFOLD_FILES } from './scaffold'
import { getRichError } from './get-rich-error'
import { tool } from 'ai'
import description from './create-sandbox.md'
import z from 'zod/v3'

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
  // Pre-warmed sandbox created in parallel with expandPrompt — null if not available.
  prewarmSandboxId?: string | null
}

export const createSandbox = ({ writer, prewarmSandboxId }: Params) => {
  // Hard guard: one sandbox per agent invocation (per HTTP request).
  // Prevents any model from calling this tool multiple times.
  let sandboxCreated = false

  return tool({
    description,
    inputSchema: z.object({
      timeout: z
        .number()
        .min(600000)
        .max(2700000)
        .optional()
        .describe(
          'Maximum time in milliseconds the Vercel Sandbox will remain active before automatically shutting down. Minimum 600000ms (10 minutes), maximum 2700000ms (45 minutes). Defaults to 600000ms (10 minutes). The sandbox will terminate all running processes when this timeout is reached.'
        ),
      ports: z
        .array(z.number())
        .max(2)
        .optional()
        .describe(
          'Array of network ports to expose and make accessible from outside the Vercel Sandbox. These ports allow web servers, APIs, or other services running inside the Vercel Sandbox to be reached externally. Common ports include 3000 (Next.js), 8000 (Python servers), 5000 (Flask), etc.'
        ),
    }),
    execute: async ({ timeout, ports }, { toolCallId }) => {
      if (sandboxCreated) {
        return (
          'DUPLICATE_CALL_BLOCKED: Workspace is already initialized for this session. ' +
          'Do NOT call createSandbox again. Proceed directly to getUnsplashBatch, planProject, and generateFiles.'
        )
      }
      sandboxCreated = true
      writer.write({
        id: toolCallId,
        type: 'data-create-sandbox',
        data: { status: 'loading' },
      })

      try {
        let sandbox: Sandbox
        let sandboxId: string

        if (prewarmSandboxId) {
          // Use the sandbox created in parallel with expandPrompt — saves ~8s
          try {
            sandbox = await Sandbox.get({ sandboxId: prewarmSandboxId })
            sandboxId = prewarmSandboxId
          } catch {
            // Prewarm sandbox died (rare) — fall back to fresh creation
            sandbox = await Sandbox.create({ timeout: timeout ?? 600000, ports })
            sandboxId = sandbox.sandboxId
          }
        } else {
          sandbox = await Sandbox.create({ timeout: timeout ?? 600000, ports })
          sandboxId = sandbox.sandboxId
        }

        // Write base scaffold files (package.json, vite.config.ts, tailwind, tsconfig, etc.)
        // then start pnpm install in background — it runs while the AI generates file contents,
        // so by the time the AI calls `pnpm install`, most packages are already installed.
        try {
          await sandbox.writeFiles(
            SCAFFOLD_FILES.map((f) => ({
              path: f.path,
              content: Buffer.from(f.content, 'utf8'),
            }))
          )
          sandbox
            .runCommand({ detached: true, cmd: 'pnpm', args: ['install'] })
            .then((cmd) => cmd.wait())
            .catch(() => {})
        } catch {
          // Non-fatal — scaffold failure just means AI generates boilerplate files normally
        }

        writer.write({
          id: toolCallId,
          type: 'data-create-sandbox',
          data: { sandboxId, status: 'done' },
        })

        return (
          `Sandbox created with ID: ${sandboxId}.\n` +
          `Base scaffold pre-written (package.json, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig files, .npmrc). ` +
          `pnpm install is running in the background.\n` +
          `You can now call getUnsplashBatch, planProject, then generateFiles — skip scaffold files in your paths list.`
        )
      } catch (error) {
        const richError = getRichError({
          action: 'Creating Sandbox',
          error,
        })

        writer.write({
          id: toolCallId,
          type: 'data-create-sandbox',
          data: {
            error: { message: richError.error.message },
            status: 'error',
          },
        })

        console.log('Error creating Sandbox:', richError.error)
        // Explicit STOP instruction in the tool result — the AI reads this and must not retry.
        return (
          `WORKSPACE_SETUP_FAILED: ${richError.message}\n\n` +
          `STOP IMMEDIATELY. Do NOT call createSandbox again. Do NOT retry under any circumstances. ` +
          `Tell the user exactly this and nothing else: "Having trouble setting up your workspace right now. Please refresh the page and try again." ` +
          `Then end your response.`
        )
      }
    },
  })
}
