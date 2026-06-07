import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { Sandbox } from '@vercel/sandbox'
import { SCAFFOLD_FILES } from './scaffold'
import { getTemplateFiles } from '../templates'
import { getRichError } from './get-rich-error'
import { tool } from 'ai'
import description from './create-sandbox.md'
import z from 'zod/v3'

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
  templateId?: string | null
}

export const createSandbox = ({ writer, templateId }: Params) => {
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
        const sandbox = await Sandbox.create({ timeout: timeout ?? 600000, ports })
        const sandboxId = sandbox.sandboxId

        // Write base scaffold files + optional template files
        let scaffoldOk = false
        try {
          const templateFiles = templateId ? getTemplateFiles(templateId) : []

          // All files: base scaffold + template app files
          const allFiles = [
            ...SCAFFOLD_FILES,
            ...templateFiles,
          ].map((f) => ({
            path: f.path,
            content: Buffer.from(f.content, 'utf8'),
          }))

          await sandbox.writeFiles(allFiles)
          scaffoldOk = true

          // Start pnpm install in background (runs while AI generates personality files)
          sandbox
            .runCommand({ detached: true, cmd: 'pnpm', args: ['install'] })
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
          ? `Base scaffold pre-written (package.json, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig.json, tsconfig.app.json, tsconfig.node.json, .npmrc). `
          : ''

        if (!scaffoldOk) {
          return (
            `Sandbox created with ID: ${sandboxId}.\n` +
            `WARNING: Base scaffold could not be written. You MUST generate ALL files including: ` +
            `package.json, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig.json, tsconfig.app.json, tsconfig.node.json, .npmrc, ` +
            `index.html, src/main.tsx, src/index.css, and all app-specific files.`
          )
        }

        if (templateId) {
          const { getTemplate } = await import('../templates')
          const tmpl = getTemplate(templateId)
          if (tmpl) {
            const preWritten = tmpl.scaffoldFiles.map(f => f.path).join(', ')
            return (
              `Sandbox created with ID: ${sandboxId}.\n` +
              `${skippedScaffold}pnpm install is running in the background.\n\n` +
              `Pre-written files (DO NOT regenerate): ${preWritten}\n\n` +
              `TASK: ${tmpl.instruction}\n\n` +
              `PERSONALITY FILES TO WRITE: ${tmpl.personalityFiles.join(', ')}\n\n` +
              `MANDATORY RULES FOR PERSONALITY FILES:\n` +
              `1. Brand name / title — use the exact brandName from the PROJECT BRIEF, not any placeholder\n` +
              `2. Colors — derive entirely from the brief's colorPalette and tone. Dark vs light, warm vs cool, vibrant vs muted — YOU decide based on context. A steakhouse asking for "off-white" gets off-white. A cyberpunk game gets neon. NEVER keep default colors if the brief implies something different.\n` +
              `3. Fonts — match the brief's fontPairing and personality. Serif for elegant/editorial, sans-serif for modern/tech, display for games/bold brands.\n` +
              `4. All copy (taglines, nav links, headlines, feature names, menu items, pricing tiers) — write specifically for THIS brand from the brief. Zero generic text.\n` +
              `5. Every single field must reflect the actual project requested. The defaults in the file are examples only — treat them as hints, not values to keep.\n\n` +
              `After writing the personality file(s), run \`pnpm install\` then \`pnpm dev\`.`
            )
          }
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
