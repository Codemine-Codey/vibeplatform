import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { Sandbox } from '@vercel/sandbox'
import { getScaffoldFiles } from './scaffold'
import { getRichError } from './get-rich-error'
import { tool } from 'ai'
import description from './create-sandbox.md'
import z from 'zod/v3'

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export const createSandbox = ({ writer }: Params) => {
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
        // 30-min default (was 10 min) — a build + a few edits must fit comfortably inside the
        // sandbox lifetime, or it dies mid-work and forces a full rebuild (Fable step 7).
        const sandbox = await Sandbox.create({ timeout: timeout ?? 1_800_000, ports })
        const sandboxId = sandbox.sandboxId

        // Write base scaffold files — getScaffoldFiles INCLUDES src/main.tsx (the Vite entry).
        // SCAFFOLD_FILES alone omitted it, so this path could 404 the entry and blank the app.
        let scaffoldOk = false
        try {
          const allFiles = getScaffoldFiles('website').map((f) => ({
            path: f.path,
            content: Buffer.from(f.content, 'utf8'),
          }))

          await sandbox.writeFiles(allFiles)
          scaffoldOk = true

          // Start install in background (bun if available, pnpm fallback)
          sandbox
            .runCommand({ detached: true, cmd: 'bash', args: ['-c', 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'] })
            .then((cmd) => cmd.wait())
            .catch(() => {})
        } catch {
          // Non-fatal — AI must generate all files itself
        }

        writer.write({
          id: toolCallId,
          type: 'data-create-sandbox',
          data: { sandboxId, status: 'done' },
        })

        // Build the return message
        const skippedScaffold = scaffoldOk
          ? `Base scaffold pre-written (package.json, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig.json, tsconfig.app.json, tsconfig.node.json, .npmrc). Dependencies installing in background. `
          : ''

        if (!scaffoldOk) {
          return (
            `Sandbox created with ID: ${sandboxId}.\n` +
            `WARNING: Base scaffold could not be written. You MUST generate ALL files including: ` +
            `package.json, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig.json, tsconfig.app.json, tsconfig.node.json, .npmrc, ` +
            `index.html, src/main.tsx, src/index.css, and all app-specific files.`
          )
        }

        return (
          `Sandbox created with ID: ${sandboxId}.\n` +
          `${skippedScaffold}` +
          `pnpm install is running in the background.\n` +
          `Skip these 8 scaffold files in your generateFiles paths list — only generate app-specific files.`
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
