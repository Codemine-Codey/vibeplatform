import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { Sandbox } from '@vercel/sandbox'
import { getContents, type File } from './generate-files/get-contents'
import { getRichError } from './get-rich-error'
import { getWriteFiles } from './generate-files/get-write-files'
import { tool } from 'ai'
import description from './generate-files.md'
import z from 'zod/v3'

// Runs inside the sandbox after file generation to guarantee Vite allowedHosts.
const VITE_PATCH_SCRIPT = `
const fs = require('fs');
const configs = ['vite.config.ts','vite.config.js','vite.config.mjs','vite.config.mts'];
let done = false;
for (const f of configs) {
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('allowedHosts')) { done = true; break; }
  if (/server\\s*:/.test(s)) {
    s = s.replace(/(server\\s*:\\s*\\{)/, "$1 host:'0.0.0.0', allowedHosts:true,");
  } else if (/defineConfig/.test(s)) {
    s = s.replace(/(defineConfig\\s*(?:<[^>]*>)?\\s*\\(\\s*\\{)/, "$1\\n  server:{host:'0.0.0.0',allowedHosts:true,port:3000},");
  } else {
    s = s.replace(/export\\s+default\\s*\\{/, "export default {\\n  server:{host:'0.0.0.0',allowedHosts:true,port:3000},");
  }
  fs.writeFileSync(f, s);
  console.log('cm-patch: patched ' + f);
  done = true;
  break;
}
if (!done) {
  const fallback = "import{defineConfig}from 'vite';import react from '@vitejs/plugin-react';export default defineConfig({plugins:[react()],server:{host:'0.0.0.0',allowedHosts:true,port:3000}});";
  fs.writeFileSync('vite.config.js', fallback);
  console.log('cm-patch: created vite.config.js');
}
`.trim()

interface Params {
  modelId: string
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export const generateFiles = ({ writer, modelId }: Params) =>
  tool({
    description,
    inputSchema: z.object({
      sandboxId: z.string(),
      paths: z.array(z.string()),
    }),
    execute: async ({ sandboxId, paths }, { toolCallId, messages }) => {
      if (paths.length === 0) {
        return 'ERROR: paths list is empty. You must provide at least one file path to generate.'
      }

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: { paths: [], status: 'generating' },
      })

      let sandbox: Sandbox | null = null

      try {
        sandbox = await Sandbox.get({ sandboxId })
      } catch (error) {
        const richError = getRichError({
          action: 'get sandbox by id',
          args: { sandboxId },
          error,
        })
        writer.write({
          id: toolCallId,
          type: 'data-generating-files',
          data: { error: richError.error, paths: [], status: 'error' },
        })
        return richError.message
      }

      const writeFiles = getWriteFiles({ sandbox, toolCallId, writer })
      const uploaded: File[] = []

      // Streaming writeFile tool calls — each file is yielded as soon as Flash
      // finishes writing it. No heartbeat needed; tokens flow continuously.
      const iterator = getContents({ messages, modelId, paths })
      try {
        for await (const chunk of iterator) {
          if (chunk.files.length > 0) {
            const error = await writeFiles({
              ...chunk,
              written: uploaded.map((f) => f.path),
            })
            if (!error) uploaded.push(...chunk.files)
          }
        }
      } catch (error) {
        const richError = getRichError({
          action: 'generate file contents',
          args: { modelId, paths },
          error,
        })
        console.error('[generateFiles] getContents error:', richError.message)
      }

      // Retry any files that were missed (JSON parse failure, empty content, etc.)
      const writtenPaths = new Set(uploaded.map(f => f.path))
      const missing = paths.filter(p => !writtenPaths.has(p))
      if (missing.length > 0) {
        console.warn(`[generateFiles] Retrying ${missing.length} missing file(s): ${missing.join(', ')}`)
        const retryIterator = getContents({ messages, modelId, paths: missing })
        try {
          for await (const chunk of retryIterator) {
            if (chunk.files.length > 0) {
              const error = await writeFiles({ ...chunk, written: uploaded.map(f => f.path) })
              if (!error) uploaded.push(...chunk.files)
            }
          }
        } catch {
          // retry failure is non-fatal
        }
      }

      // In-sandbox Vite patch — belt-and-suspenders after server-side patch
      try {
        await sandbox.writeFiles([
          { path: '.cm-patch.cjs', content: Buffer.from(VITE_PATCH_SCRIPT, 'utf8') },
        ])
        const patchCmd = await sandbox.runCommand({ detached: true, cmd: 'node', args: ['.cm-patch.cjs'] })
        await patchCmd.wait()
        const rmCmd = await sandbox.runCommand({ detached: true, cmd: 'rm', args: ['-f', '.cm-patch.cjs'] })
        await rmCmd.wait()
      } catch {
        // Non-fatal
      }

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: { paths: uploaded.map((file) => file.path), status: 'done' },
      })

      // Server-side SVG enforcement — catch violations the AI missed.
      // Scan TSX/TS/CSS files for raw <svg> tags. Return as a mandatory fix item
      // in the tool result so the AI must address it before calling getSandboxURL.
      const svgOffenders = uploaded
        .filter(f =>
          /\.(tsx|ts|jsx|js|css|html)$/.test(f.path) &&
          /<svg[\s>]/.test(f.content)
        )
        .map(f => f.path)

      const svgWarning = svgOffenders.length > 0
        ? `\n\nSVG VIOLATION DETECTED — fix required before calling getSandboxURL:\nFiles with <svg> tags: ${svgOffenders.join(', ')}\nReplace every <svg> with a Lucide React icon or CSS-only shape (border-radius, clip-path). No SVG allowed anywhere.`
        : ''

      return `Successfully generated and uploaded ${uploaded.length} files:\n${uploaded.map((f) => f.path).join('\n')}${svgWarning}`
    },
  })
