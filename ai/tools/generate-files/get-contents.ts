import { streamText, tool, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import z from 'zod/v3'
import type { ModelMessage } from 'ai'

export type File = {
  path: string
  content: string
}

interface Params {
  messages: ModelMessage[]
  modelId: string
  paths: string[]
}

interface FileContentChunk {
  files: File[]
  paths: string[]
  written: string[]
}

// Provider with thinking disabled — prevents silent 5-min reasoning before first token.
// Both flags needed: include_reasoning hides tokens, thinking:{type:'disabled'} stops it.
function makeProvider(modelId: string) {
  const isOpenRouter = modelId.includes('/')
  return createOpenAI({
    baseURL: isOpenRouter
      ? 'https://openrouter.ai/api/v1'
      : (process.env.AI_GATEWAY_BASE_URL ?? 'https://api.deepseek.com/v1'),
    apiKey: isOpenRouter
      ? (process.env.OPENROUTER_API_KEY ?? '')
      : (process.env.DEEPSEEK_API_KEY ?? ''),
    fetch: async (url, init) => {
      if (init?.body) {
        try {
          const body = JSON.parse(init.body as string)
          if (isOpenRouter) {
            body.include_reasoning = false
            body.thinking = { type: 'disabled' }
          }
          init = { ...init, body: JSON.stringify(body) }
        } catch { /* non-fatal */ }
      }
      return fetch(url, init)
    },
  })
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

// Generates files using streaming tool calls — each file is yielded individually
// as soon as Flash finishes writing it. The UI shows files appearing one by one
// instead of waiting for a full JSON blob to complete.
export async function* getContents(
  params: Params
): AsyncGenerator<FileContentChunk> {
  const { messages, modelId, paths } = params
  const provider = makeProvider(modelId)

  // Queue-based channel between tool execute() and the async generator.
  // execute() pushes files and resolves the current signal promise.
  // The generator drains the queue and waits on the signal when empty.
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
    model: provider.chat(modelId),
    maxOutputTokens: 384000,
    system:
      'You are a code file generator. Write each file completely using the writeFile tool.\n' +
      'One writeFile call per file — NEVER combine two files into one call. Write COMPLETE production-quality code — never truncate or abbreviate.\n' +
      'File order: write shared utilities and types first, then components, then pages.\n' +
      'CSS rule: in src/index.css always use @tailwind base/components/utilities — NEVER @import.\n' +
      'No <svg> tags. No placeholder content. Real code only.',
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
          // One writeFile may contain several concatenated files — split them.
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

  // Start consuming the stream (non-blocking — generator runs concurrently)
  result.consumeStream()

  const written = new Set<string>()

  while (true) {
    // Drain all queued files before waiting
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
