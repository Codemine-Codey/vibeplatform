import { Sandbox } from '@vercel/sandbox'
import { tool } from 'ai'
import z from 'zod/v3'
import { mergePackageJson } from './scaffold'
import { ensureValidCss } from '@/lib/css-guard'
import { resetReadBudget } from '../read-budget'
import { hasReadFile, markFileWritten } from '../edit-tracker'
import { logPatch } from '@/lib/telemetry'

const VITE_CONFIG_NAMES = new Set(['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'])

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
        // Read-first invariant (Lovable's #1 fix): refuse to patch a file the model
        // has not read this session. Forces the edit to be grounded in the CURRENT
        // content — this is what stops whole-file regeneration and dropped content.
        if (!hasReadFile(sandboxId, path)) {
          return {
            success: false,
            error:
              `You must read ${path} before patching it. Call readFile("${path}") ` +
              `(or readFiles for several files), then patchFile with an oldString copied ` +
              `exactly from what you read. Never edit a file from memory.`,
          }
        }

        const sandbox = await Sandbox.get({ sandboxId })
        // A write begins a fresh edit cycle — reset the read budget so the next
        // change gets a clean allowance of reads.
        resetReadBudget(sandboxId)

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

        // Phase 3 diff-ratio guard: how much of the file is this single patch
        // replacing? Near-total means the model fell back to a rewrite disguised
        // as a patch. We still apply it (don't break a legitimate large edit) but
        // log it and nudge toward smaller patches.
        const patchRatio = current.length > 0 ? Math.min(1, oldString.length / current.length) : 0
        const rewrite = patchRatio > 0.6
        logPatch({ path, patchRatio, rewrite })

        const basename = path.split('/').pop() ?? ''
        let updated = current.replace(oldString, newString)
        if (VITE_CONFIG_NAMES.has(basename)) {
          updated = ensureViteAllowedHosts(updated)
        }
        if (basename === 'package.json') {
          // A patch must never remove scaffold deps — missing modules crash the preview.
          updated = mergePackageJson(updated)
        }
        if (path.endsWith('.css')) {
          // Validate with the REAL PostCSS parser and auto-repair (drop broken
          // lines) — a syntax error here would 500 every request and blank the
          // preview. Deterministic repair beats bouncing the patch back to the AI.
          const before = updated
          updated = ensureValidCss(updated)
          if (updated !== before) {
            await sandbox.writeFiles([{ path, content: Buffer.from(updated, 'utf8') }])
            markFileWritten(sandboxId, path)
            return {
              success: true,
              path,
              message:
                `Patched ${path}. NOTE: some lines in your CSS were syntactically invalid (unclosed parenthesis, missing colon, or @apply) and were removed automatically to keep the stylesheet valid. ` +
                `If a style you intended is missing, re-apply it with valid plain CSS.`,
            }
          }
        } else {
          updated = stripSvgs(updated, path)
        }
        await sandbox.writeFiles([{ path, content: Buffer.from(updated, 'utf8') }])
        markFileWritten(sandboxId, path)
        return {
          success: true,
          path,
          message:
            `Patched ${path}.` +
            (rewrite
              ? ' NOTE: this patch replaced most of the file. Prefer small, targeted patches — if you genuinely need to rewrite the whole file, that is fine, but a tiny diff is faster and safer.'
              : ''),
        }
      } catch (err) {
        return { success: false, error: `Patch failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
  })
