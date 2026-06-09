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

      // Heartbeat: Flash JSON Output mode generates the entire response before returning.
      // The stream is silent for 1-4 minutes while Flash works, which causes Vercel's edge
      // proxy to drop the HTTP/2 connection (ERR_HTTP2_PING_FAILED) even though the function
      // itself is still alive. Writing a small event every 8s keeps the connection open.
      let heartbeatId: ReturnType<typeof setInterval> | null = setInterval(() => {
        try {
          writer.write({
            id: toolCallId,
            type: 'data-generating-files',
            data: { paths: [], status: 'generating' },
          })
        } catch { /* writer may have closed — non-fatal */ }
      }, 8000)
      const stopHeartbeat = () => {
        if (heartbeatId !== null) { clearInterval(heartbeatId); heartbeatId = null }
      }

      // Single getContents call — Flash JSON Output mode supports 384k output tokens,
      // so all files for any project fit in one response. Batching is no longer needed.
      const iterator = getContents({ messages, modelId, paths })
      try {
        for await (const chunk of iterator) {
          stopHeartbeat() // first data arrived — no longer needed
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
      } finally {
        stopHeartbeat()
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

      return `Successfully generated and uploaded ${uploaded.length} files:\n${uploaded.map((f) => f.path).join('\n')}`
    },
  })
