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
// Belt-and-suspenders: the pre-write server-side patch handles most cases, this
// catches any config variant the regex missed (e.g. exotic formatting, .mjs, etc.)
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
      const iterator = getContents({ messages, modelId, paths })
      const uploaded: File[] = []

      try {
        for await (const chunk of iterator) {
          if (chunk.files.length > 0) {
            // Pass accumulated uploaded paths so the UI shows a growing list
            // (file1 ✓, file2 ✓, file3 ⟳) instead of resetting to 1 each time
            const error = await writeFiles({
              ...chunk,
              written: uploaded.map((f) => f.path),
            })
            if (error) {
              return error
            } else {
              uploaded.push(...chunk.files)
            }
          } else {
            writer.write({
              id: toolCallId,
              type: 'data-generating-files',
              data: {
                status: 'generating',
                paths: chunk.paths,
              },
            })
          }
        }
      } catch (error) {
        const richError = getRichError({
          action: 'generate file contents',
          args: { modelId, paths },
          error,
        })

        writer.write({
          id: toolCallId,
          type: 'data-generating-files',
          data: {
            error: richError.error,
            status: 'error',
            paths,
          },
        })

        return richError.message
      }

      // Plan C: in-sandbox Vite patch — belt-and-suspenders after the server-side patch.
      // Catches any vite.config variant the regex missed (.mjs, unusual formatting, etc.)
      try {
        await sandbox.writeFiles([
          { path: '.cm-patch.cjs', content: Buffer.from(VITE_PATCH_SCRIPT, 'utf8') },
        ])
        const patchCmd = await sandbox.runCommand({
          detached: true,
          cmd: 'node',
          args: ['.cm-patch.cjs'],
        })
        await patchCmd.wait()
        // Clean up patch script so it doesn't appear in generated file list
        const rmCmd = await sandbox.runCommand({
          detached: true,
          cmd: 'rm',
          args: ['-f', '.cm-patch.cjs'],
        })
        await rmCmd.wait()
      } catch {
        // Non-fatal — server-side patch already covers the common cases
      }

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: { paths: uploaded.map((file) => file.path), status: 'done' },
      })

      // Return only file paths — NOT content. Returning content here would add
      // 30–80k tokens to every step's tool result, with zero benefit (the model
      // already knows what it generated and uses readFile for subsequent edits).
      return `Successfully generated and uploaded ${uploaded.length} files:\n${uploaded.map((f) => f.path).join('\n')}`
    },
  })
