import { Sandbox } from '@vercel/sandbox'
import { tool } from 'ai'
import z from 'zod/v3'

const VITE_CONFIG_NAMES = new Set(['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'])

function sanitizeCss(css: string): string {
  let out = css.replace(/@apply\s+[^;{}\n]*;?/gi, '')
  return out.split('\n').filter(line => {
    const t = line.trim()
    if (!t) return true
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('@')) return true
    if (t.includes('{') || t.includes('}')) return true
    if (t.endsWith(';') && !t.includes(':')) return false
    return true
  }).join('\n')
}

function stripSvgs(content: string, path: string): string {
  if (!/\.(tsx|jsx|ts|js|html)$/.test(path)) return content
  const isHtml = path.endsWith('.html')
  return content.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, () =>
    isHtml
      ? '<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100"></span>'
      : '<span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-foreground/10" />'
  )
}

// Re-applies allowedHosts after any patchFile call on a vite config.
// Prevents the AI from accidentally removing our host security bypass.
function ensureViteAllowedHosts(content: string): string {
  if (content.includes('allowedHosts')) return content
  const patch = `server: { host: '0.0.0.0', allowedHosts: true, port: 3000 },`
  if (/server\s*:/.test(content)) {
    return content.replace(/(server\s*:\s*\{)/, `server: { host: '0.0.0.0', allowedHosts: true, port: 3000,`)
  }
  if (/defineConfig/.test(content)) {
    return content.replace(/(defineConfig\s*(?:<[^>]*>)?\s*\(\s*\{)/, `$1\n  ${patch}`)
  }
  return content.replace(/export\s+default\s+\{/, `export default {\n  ${patch}`)
}

export const patchFile = () =>
  tool({
    description: 'Apply a targeted string replacement to a file. This is the ONLY tool for editing existing files — never use generateFiles on a file that already exists. Always call readFile first to get the exact string to match.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      path: z.string().describe('Path to the file to patch'),
      oldString: z.string()
        .describe('The exact string to replace, including surrounding whitespace/newlines. Must match exactly.'),
      newString: z.string()
        .describe('The replacement string'),
    }),
    execute: async ({ sandboxId, path, oldString, newString }) => {
      try {
        const sandbox = await Sandbox.get({ sandboxId })

        // Read current content
        const readCmd = await sandbox.runCommand({ cmd: 'cat', args: [path], detached: true })
        const readDone = await readCmd.wait()
        if (readDone.exitCode !== 0) {
          return { success: false, error: `Could not read ${path} — use readFile first to verify the path` }
        }
        const current = await readDone.stdout()

        if (!current.includes(oldString)) {
          return {
            success: false,
            error: `Exact string not found in ${path}. Use readFile to get the current content, then match exactly.`,
          }
        }

        const basename = path.split('/').pop() ?? ''
        let updated = current.replace(oldString, newString)
        if (VITE_CONFIG_NAMES.has(basename)) {
          updated = ensureViteAllowedHosts(updated)
        }
        if (path.endsWith('.css')) {
          updated = sanitizeCss(updated)
          // Reject a patch that would leave the stylesheet with unbalanced
          // parentheses or braces — that crashes PostCSS and blanks the preview.
          // Catching it here means the AI fixes it in the SAME turn instead of
          // a slow crash -> detect -> new-turn cycle. Valid CSS is always balanced.
          const parenO = (updated.match(/\(/g) || []).length
          const parenC = (updated.match(/\)/g) || []).length
          const braceO = (updated.match(/\{/g) || []).length
          const braceC = (updated.match(/\}/g) || []).length
          if (parenO !== parenC || braceO !== braceC) {
            const what = parenO !== parenC ? `parentheses (${parenO} "(" vs ${parenC} ")")` : `braces (${braceO} "{" vs ${braceC} "}")`
            return {
              success: false,
              error:
                `This edit was NOT applied because it would leave ${path} with unbalanced ${what}, which crashes the stylesheet and blanks the preview. ` +
                `Re-read the file with readFile and provide a corrected patch with fully balanced, valid CSS (every "(" closed, every gradient complete, each declaration ending in ";").`,
            }
          }
        } else {
          updated = stripSvgs(updated, path)
        }
        await sandbox.writeFiles([{ path, content: Buffer.from(updated, 'utf8') }])
        return { success: true, path, message: `Patched ${path}` }
      } catch (err) {
        return { success: false, error: `Patch failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
  })
