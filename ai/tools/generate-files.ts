import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { Sandbox } from '@vercel/sandbox'
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
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export const generateFiles = ({ writer }: Params) =>
  tool({
    description,
    inputSchema: z.object({
      sandboxId: z.string().describe('The sandbox ID to write files into'),
      files: z
        .array(
          z.object({
            path: z.string().describe('File path relative to sandbox root, e.g. src/App.tsx'),
            content: z.string().describe('Complete file content as a UTF-8 string — no placeholders, no stubs'),
          })
        )
        .describe('Every file to write. Must include COMPLETE content. Call this tool exactly once.'),
    }),
    execute: async ({ sandboxId, files }, { toolCallId }) => {
      if (files.length === 0) {
        return 'ERROR: files array is empty. Provide every file with its complete content.'
      }

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: { paths: files.map(f => f.path), status: 'generating' },
      })

      let sandbox: Sandbox | null = null

      try {
        sandbox = await Sandbox.get({ sandboxId })
      } catch (error) {
        const richError = getRichError({ action: 'get sandbox by id', args: { sandboxId }, error })
        writer.write({
          id: toolCallId,
          type: 'data-generating-files',
          data: { error: richError.error, paths: [], status: 'error' },
        })
        return richError.message
      }

      const writeFiles = getWriteFiles({ sandbox, toolCallId, writer })

      const error = await writeFiles({
        files,
        paths: files.map(f => f.path),
        written: [],
      })

      if (error) return error

      // In-sandbox Vite patch — belt-and-suspenders after the server-side patch.
      try {
        await sandbox.writeFiles([
          { path: '.cm-patch.cjs', content: Buffer.from(VITE_PATCH_SCRIPT, 'utf8') },
        ])
        const patchCmd = await sandbox.runCommand({ detached: true, cmd: 'node', args: ['.cm-patch.cjs'] })
        await patchCmd.wait()
        const rmCmd = await sandbox.runCommand({ detached: true, cmd: 'rm', args: ['-f', '.cm-patch.cjs'] })
        await rmCmd.wait()
      } catch {
        // Non-fatal — server-side patch covers most cases
      }

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: { paths: files.map(f => f.path), status: 'done' },
      })

      // Return only paths — not content. Content in tool result = 30-80k wasted tokens.
      return `Successfully wrote ${files.length} files:\n${files.map(f => f.path).join('\n')}`
    },
  })
