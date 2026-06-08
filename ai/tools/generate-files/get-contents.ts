import { generateText, tool, stepCountIs, type ModelMessage } from 'ai'
import { getModelOptions } from '@/ai/gateway'
import z from 'zod/v3'

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

// Async channel — yields each file immediately as the tool call resolves,
// preserving the progressive UI (file list grows in real time).
export async function* getContents(
  params: Params
): AsyncGenerator<FileContentChunk> {
  const queue: Array<FileContentChunk | null> = []
  let notify: (() => void) | null = null

  function push(item: FileContentChunk | null) {
    queue.push(item)
    notify?.()
    notify = null
  }

  function waitForItem(): Promise<void> {
    return new Promise((resolve) => {
      notify = resolve
    })
  }

  // Single write_all_files tool call — all files in one Gemini response.
  // This collapses N sequential round-trips (old write_file per file) into 1,
  // matching how competitors generate full projects in a single structured call.
  const genPromise = generateText({
    ...getModelOptions(params.modelId),
    maxOutputTokens: 64000,
    system:
      'You are a file content generator. Call write_all_files EXACTLY ONCE with every requested file in the array. Generate complete, correct file content for each. NEVER generate lock files (pnpm-lock.yaml, package-lock.json, yarn.lock). CRITICAL CSS RULE: In src/index.css ALWAYS use @tailwind base; @tailwind components; @tailwind utilities; — NEVER use @import \'tailwindcss/base\' or @import \'tailwindcss/components\' or @import \'tailwindcss/utilities\' (those are JS files and will crash PostCSS).',
    messages: [
      ...params.messages,
      {
        role: 'user',
        content: `Generate ALL of the following files in a single write_all_files call:\n${params.paths.map((p) => ` - ${p}`).join('\n')}`,
      },
    ],
    tools: {
      write_all_files: tool({
        description:
          'Write ALL project files at once. Call this EXACTLY ONCE with the complete array — never call it multiple times.',
        inputSchema: z.object({
          files: z
            .array(
              z.object({
                path: z.string().describe('File path relative to sandbox root'),
                content: z
                  .string()
                  .describe('Complete file contents as a utf8 string'),
              })
            )
            .describe('Array containing every file to write'),
        }),
        execute: async ({ files }) => {
          for (const { path, content } of files) {
            // Only write paths that were explicitly requested — ignore extras
            if (params.paths.includes(path)) {
              push({ files: [{ path, content }], paths: [path], written: [] })
            }
          }
          push(null)
          return `Wrote ${files.length} files`
        },
      }),
    },
    stopWhen: stepCountIs(2), // 1 tool call + optional closing text step
  }).then(
    () => push(null),
    (err) => {
      // Always unblock consumer on failure — prevents infinite hang
      push(null)
      return Promise.reject(err)
    }
  )

  while (true) {
    if (queue.length === 0) {
      await waitForItem()
    }
    const item = queue.shift()!
    if (item === null) break
    yield item
  }

  await genPromise
}
