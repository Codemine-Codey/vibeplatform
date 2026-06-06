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

// Injected into index.html of every generated app so runtime JS errors are
// captured and forwarded to the parent window via postMessage (Plan D).
const ERROR_BRIDGE_SCRIPT = `<script>
(function(){
  var _w=window,_p=_w.parent;
  function _send(m,s){try{_p.postMessage({type:'cm-error',message:m,source:s},'*');}catch(e){}}
  _w.onerror=function(m,s,l,c){_send(m+'\\n'+s+':'+l+':'+c,'onerror');return false;};
  _w.addEventListener('unhandledrejection',function(e){_send(String(e.reason),'unhandledrejection');});
  var _ce=_w.console.error.bind(_w.console);
  _w.console.error=function(){var m=Array.from(arguments).map(String).join(' ');_send(m,'console.error');_ce.apply(_w.console,arguments);};
})();
</script>`

function injectErrorBridge(html: string): string {
  if (html.includes('cm-error')) return html
  if (html.includes('</head>')) {
    return html.replace('</head>', `${ERROR_BRIDGE_SCRIPT}\n</head>`)
  }
  if (/<body[^>]*>/.test(html)) {
    return html.replace(/<body[^>]*>/, (m) => `${m}\n${ERROR_BRIDGE_SCRIPT}`)
  }
  return html + '\n' + ERROR_BRIDGE_SCRIPT
}

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
    // would be blocked by Vite's host security without allowedHosts: true.
    // Also inject error bridge into index.html (Plan D).
    const patchedFiles = params.files.map((file) => {
      const basename = file.path.split('/').pop() ?? ''
      if (VITE_CONFIG_NAMES.has(basename)) {
        return { ...file, content: ensureViteAllowedHosts(file.content) }
      }
      if (basename === 'index.html') {
        return { ...file, content: injectErrorBridge(file.content) }
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
