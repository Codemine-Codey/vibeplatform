import { streamText, tool, stepCountIs } from 'ai'
import z from 'zod/v3'
import type { ModelMessage } from 'ai'
import { getModelOptions } from '../../gateway'
import { getMaxOutputTokens } from '../../constants'

export type File = {
  path: string
  content: string
}

interface Params {
  messages: ModelMessage[]
  modelId: string
  paths: string[]
  // The design contract (brief color tokens + fonts + taste rules). Without this,
  // the file-writer has no idea what colors/fonts/layout to use → generic, low-
  // contrast output. Injected into the system prompt so design reaches the code.
  designContext?: string
}

interface FileContentChunk {
  files: File[]
  paths: string[]
  written: string[]
}

function fixCss(path: string, content: string): string {
  if (path !== 'src/index.css') return content
  return content
    .replace(/@import\s+['"]tailwindcss\/base['"]\s*;?/g, '@tailwind base;')
    .replace(/@import\s+['"]tailwindcss\/components['"]\s*;?/g, '@tailwind components;')
    .replace(/@import\s+['"]tailwindcss\/utilities['"]\s*;?/g, '@tailwind utilities;')
}

// The model sometimes concatenates TWO requested files into ONE writeFile call,
// separated by a comment header like `// src/pages/Contact.tsx`. The second file
// then never exists → broken import → broken preview. Detect those boundary
// markers and split the content back into the intended files deterministically.
function splitConcatenated(path: string, content: string, requested: string[]): File[] {
  const markers: Array<{ idx: number; path: string }> = []
  for (const other of requested) {
    if (other === path) continue
    const escaped = other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Match a comment line naming the other file: `// src/x.tsx` or `/* src/x.tsx */`
    const re = new RegExp(`^\\s*(?:\\/\\/|\\/\\*)\\s*${escaped}\\b`, 'm')
    const m = re.exec(content)
    // idx > 50 — ignore a header at the very top (that's just a label, not a boundary)
    if (m && m.index > 50) markers.push({ idx: m.index, path: other })
  }
  if (markers.length === 0) return [{ path, content }]
  markers.sort((a, b) => a.idx - b.idx)
  console.warn(`[getContents] split concatenated file ${path} → ${markers.map(m => m.path).join(', ')}`)
  const out: File[] = [{ path, content: content.slice(0, markers[0].idx).trimEnd() + '\n' }]
  for (let i = 0; i < markers.length; i++) {
    const end = i + 1 < markers.length ? markers[i + 1].idx : content.length
    out.push({ path: markers[i].path, content: content.slice(markers[i].idx, end).trimEnd() + '\n' })
  }
  return out
}

const GEN_SYSTEM =
  'You are a senior product designer + engineer writing real, production files via the writeFile tool.\n' +
  'One writeFile call per file — NEVER combine two files into one call. Write COMPLETE production-quality code — never truncate or abbreviate.\n' +
  'File order: write shared utilities and types first, then components, then pages.\n' +
  'CSS rule: in src/index.css always use @tailwind base/components/utilities — NEVER @import.\n' +
  'No <svg> tags. No placeholder content. Real code only.\n' +
  '\nDESIGN IS NON-NEGOTIABLE — follow the DESIGN CONTRACT below exactly:\n' +
  '- Use ONLY the contract\'s color tokens. Headlines and body text MUST use a high-contrast token against their background — NEVER let text color approach the background color (no invisible/low-contrast text).\n' +
  '- Load and use the contract\'s exact font pairing (Google Fonts @import in src/index.css); display font for headings at a real scale, body font for copy.\n' +
  '- Honor the layout archetype and signature moves. No generic three-equal-cards, no centered-mesh hero, no default Inter/Roboto.\n' +
  '- Establish a clear type scale (one large display size, one heading size, one body size) and consistent spacing.'

function buildGenSystem(designContext?: string): string {
  if (!designContext) return GEN_SYSTEM
  return GEN_SYSTEM + '\n\n## DESIGN CONTRACT (authoritative — every file must honor this)\n' + designContext
}

// Generates files using streaming tool calls — each file is yielded individually
// as soon as the model finishes writing it, so the UI shows files appearing one
// by one. (Parallel fan-out was tried for speed but crashed the dev server under
// the token-accounting async context — reverted; the real win is Part B sandbox
// cold-start, not model concurrency.)
export async function* getContents(
  params: Params
): AsyncGenerator<FileContentChunk> {
  const { messages, modelId, paths, designContext } = params

  const queue: File[] = []
  let finished = false
  let notify!: () => void
  let signal = new Promise<void>(r => { notify = r })
  function enqueue(file: File) {
    queue.push(file)
    const prev = notify
    signal = new Promise<void>(r => { notify = r })
    prev()
  }

  const result = streamText({
    ...getModelOptions(modelId),
    maxOutputTokens: getMaxOutputTokens(modelId),
    system: buildGenSystem(designContext),
    messages: [
      ...messages,
      {
        role: 'user' as const,
        content:
          'Write ALL of the following files completely using writeFile. One call per file:\n' +
          paths.map(p => `- ${p}`).join('\n'),
      },
    ],
    tools: {
      writeFile: tool({
        description: 'Write one complete source file with its full content',
        inputSchema: z.object({
          path: z.string().describe('File path relative to project root'),
          content: z.string().describe('Complete file content — never truncate'),
        }),
        execute: async ({ path, content }) => {
          if (!paths.includes(path)) return 'skipped: not in requested list'
          if (content.trim().length < 5) return 'skipped: empty content'
          for (const file of splitConcatenated(path, content, paths)) {
            enqueue({ path: file.path, content: fixCss(file.path, file.content) })
          }
          return 'ok'
        },
      }),
    },
    stopWhen: stepCountIs(paths.length + 5),
    onFinish: () => {
      finished = true
      notify()
    },
    onError: err => console.error('[getContents] stream error:', err),
  })

  result.consumeStream()

  const written = new Set<string>()
  while (true) {
    while (queue.length > 0) {
      const file = queue.shift()!
      if (!written.has(file.path)) {
        written.add(file.path)
        yield { files: [file], paths: [file.path], written: [] }
      }
    }
    if (finished && queue.length === 0) break
    await signal
  }
}
