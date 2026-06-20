import { Sandbox } from '@vercel/sandbox'
import { tool } from 'ai'
import z from 'zod/v3'

// Phase 2 — locate code by searching, instead of guessing a file and reading it
// (often the wrong one) before finding the right place. Returns matches WITH a
// few surrounding context lines, so for a trivial change the model can patch
// directly from the grep output without a separate readFile round-trip at all.
export const grepCode = () =>
  tool({
    description:
      'Search the project source for a string or regex (a component/function name, className, import path, or visible text). ' +
      'Returns matching files with line numbers and surrounding context. ALWAYS use this FIRST to locate where something lives — ' +
      'it is faster and more accurate than guessing a file and reading it. For a small change you can often patch straight from the result.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      pattern: z.string().describe('Text or regex to find, e.g. "function Counter", "bg-primary", or "import .* Nav"'),
      glob: z.string().optional().describe('Optional file-type filter, e.g. "*.tsx" or "*.css". Defaults to all source files.'),
    }),
    execute: async ({ sandboxId, pattern, glob }) => {
      try {
        const sandbox = await Sandbox.get({ sandboxId })
        const include = glob ?? '*.{tsx,ts,jsx,js,css,html}'
        const cmd = await sandbox.runCommand({
          cmd: 'grep',
          // -r recursive, -n line numbers, -C 2 two context lines, -E extended regex
          args: ['-rnE', '-C', '2', '--include', include, pattern, 'src'],
          detached: true,
        })
        const done = await cmd.wait()
        const out = await done.stdout()
        if (!out.trim()) {
          return { matches: '', note: `No matches for "${pattern}". Try a shorter or different term, or a broader glob.` }
        }
        // Cap output so a broad match can't flood the context window.
        return { matches: out.length > 6000 ? out.slice(0, 6000) + '\n…(truncated — narrow your search)' : out }
      } catch (err) {
        return { error: `Search failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
  })
