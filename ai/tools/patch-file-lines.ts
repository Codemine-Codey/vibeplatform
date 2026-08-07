import { Sandbox } from '@vercel/sandbox'
import { tool } from 'ai'
import z from 'zod/v3'
import { hasReadFile, markFileWritten } from '../edit-tracker'
import { resetReadBudget } from '../read-budget'
import { mergePackageJson } from './scaffold'
import { ensureValidCss } from '@/lib/css-guard'

// Line-based surgical replacement — Lovable's primary edit tool.
// Preferred over patchFile for large files where a string match would be ambiguous.
// Always use ORIGINAL line numbers from when you last read the file.
export const patchFileLines = () =>
  tool({
    description:
      'Replace a specific range of lines in a file by line number. PREFERRED for edits to large files where finding an exact string is fragile. ' +
      'ALWAYS call readFile first to get current line numbers. Use the original line numbers — do NOT adjust for prior edits in the same session. ' +
      'For small targeted changes (a few lines), patchFile with exact string match is faster. Use patchFileLines when the target is a large block or the surrounding code has many similar strings.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      path: z.string().describe('Path to the file to edit'),
      startLine: z.number().int().min(1).describe('First line to replace (1-indexed, inclusive)'),
      endLine: z.number().int().min(1).describe('Last line to replace (1-indexed, inclusive)'),
      newContent: z.string().describe('Replacement content — replaces lines startLine through endLine. Include proper indentation.'),
    }),
    execute: async ({ sandboxId, path, startLine, endLine, newContent }) => {
      if (!hasReadFile(sandboxId, path)) {
        return {
          success: false,
          error: `You must readFile("${path}") before editing it. Never edit from memory — line numbers change.`,
        }
      }
      if (endLine < startLine) {
        return { success: false, error: `endLine (${endLine}) must be ≥ startLine (${startLine}).` }
      }

      try {
        const sandbox = await Sandbox.get({ sandboxId })
        resetReadBudget(sandboxId)

        const readCmd = await sandbox.runCommand({ cmd: 'cat', args: [path], detached: true })
        const readDone = await readCmd.wait()
        if (readDone.exitCode !== 0) {
          return { success: false, error: `Could not read ${path}` }
        }
        const current = (await readDone.stdout()).replace(/\r\n/g, '\n')
        const lines = current.split('\n')

        if (startLine > lines.length) {
          return { success: false, error: `startLine ${startLine} exceeds file length ${lines.length}` }
        }

        const before = lines.slice(0, startLine - 1)
        const after = lines.slice(endLine)
        const newLines = newContent.endsWith('\n')
          ? newContent.slice(0, -1).split('\n')
          : newContent.split('\n')

        let updated = [...before, ...newLines, ...after].join('\n')

        const basename = path.split('/').pop() ?? ''
        if (basename === 'package.json') updated = mergePackageJson(updated)
        if (path.endsWith('.css')) updated = ensureValidCss(updated)

        await sandbox.writeFiles([{ path, content: Buffer.from(updated, 'utf8') }])
        markFileWritten(sandboxId, path)

        return {
          success: true,
          path,
          linesReplaced: endLine - startLine + 1,
          linesInserted: newLines.length,
          message: `Replaced lines ${startLine}–${endLine} in ${path} (${endLine - startLine + 1} → ${newLines.length} lines).`,
        }
      } catch (err) {
        return { success: false, error: `patchFileLines failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
  })
