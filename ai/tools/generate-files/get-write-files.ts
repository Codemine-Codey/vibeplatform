import type { DataPart } from '../../messages/data-parts'
import type { File } from './get-contents'
import type { Sandbox } from '@vercel/sandbox'
import type { UIMessageStreamWriter, UIMessage } from 'ai'
import { getRichError } from '../get-rich-error'

interface Params {
  sandbox: Sandbox
  toolCallId: string
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

const VITE_CONFIG_NAMES = new Set([
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mts',
  'vite.config.mjs',
])

/**
 * Ensures every vite.config file allows all hosts.
 * Each sandbox gets a unique dynamic subdomain (sb-xxxx.vercel.run) — Vite's
 * host security would block the preview iframe without this patch, regardless
 * of what the AI generates.
 */
function ensureViteAllowedHosts(content: string): string {
  // Already correct — nothing to do
  if (content.includes('allowedHosts')) return content

  const serverPatch = `server: { host: '0.0.0.0', allowedHosts: true, port: 3000 },`

  // Case 1: file has a `server:` block — inject into it
  if (/server\s*:/.test(content)) {
    return content.replace(
      /(server\s*:\s*\{)/,
      `server: { host: '0.0.0.0', allowedHosts: true, port: 3000,`
    )
  }

  // Case 2: uses defineConfig({ ... }) — inject after opening brace
  if (/defineConfig/.test(content)) {
    return content.replace(
      /(defineConfig\s*(?:<[^>]*>)?\s*\(\s*\{)/,
      `$1\n  ${serverPatch}`
    )
  }

  // Case 3: bare export default { ... }
  return content.replace(
    /export\s+default\s+\{/,
    `export default {\n  ${serverPatch}`
  )
}

export function getWriteFiles({ sandbox, toolCallId, writer }: Params) {
  return async function writeFiles(params: {
    written: string[]
    files: File[]
    paths: string[]
  }) {
    const paths = params.written.concat(params.files.map((file) => file.path))
    writer.write({
      id: toolCallId,
      type: 'data-generating-files',
      data: { paths, status: 'uploading' },
    })

    // Patch vite configs before writing — sandbox subdomains are dynamic and
    // would be blocked by Vite's host security without allowedHosts: true
    const patchedFiles = params.files.map((file) => {
      const basename = file.path.split('/').pop() ?? ''
      if (VITE_CONFIG_NAMES.has(basename)) {
        return { ...file, content: ensureViteAllowedHosts(file.content) }
      }
      return file
    })

    try {
      await sandbox.writeFiles(
        patchedFiles.map((file) => ({
          content: Buffer.from(file.content, 'utf8'),
          path: file.path,
        }))
      )
    } catch (error) {
      const richError = getRichError({
        action: 'write files to sandbox',
        args: params,
        error,
      })

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: {
          error: richError.error,
          status: 'error',
          paths: params.paths,
        },
      })

      return richError.message
    }

    writer.write({
      id: toolCallId,
      type: 'data-generating-files',
      data: { paths, status: 'uploaded' },
    })
  }
}
