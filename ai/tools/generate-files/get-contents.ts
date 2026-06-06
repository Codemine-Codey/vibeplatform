import { generateText, tool, stepCountIs, type ModelMessage } from 'ai'
import { getModelOptions } from '@/ai/gateway'
import { FILE_GENERATION_MODEL } from '@/ai/constants'
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

// Async channel — lets us yield each file immediately as the LLM tool-calls it,
// rather than waiting for all files to batch at the end.
// The rAF batching in chat.tsx makes rapid-fire yields safe (no render storm).
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

  const genPromise = generateText({
    ...getModelOptions(FILE_GENERATION_MODEL),
    maxOutputTokens: 64000,
    system:
      'You are a file content generator. Generate each file by calling the write_file tool once per file. Generate ALL requested files. NEVER generate lock files (pnpm-lock.yaml, package-lock.json, yarn.lock).',
    messages: [
      ...params.messages,
      {
        role: 'user',
        content: `Generate the content of the following files according to the conversation. Call write_file once for each file:\n${params.paths.map((p) => ` - ${p}`).join('\n')}`,
      },
    ],
    tools: {
      write_file: tool({
        description: 'Write a single file with its complete content',
        inputSchema: z.object({
          path: z.string().describe('File path relative to sandbox root'),
          content: z.string().describe('Complete file contents as a utf8 string'),
        }),
        execute: async ({ path, content }) => {
          push({ files: [{ path, content }], paths: [path], written: [] })
          return `Wrote ${path}`
        },
      }),
    },
    stopWhen: stepCountIs(params.paths.length + 2),
  }).then(
    () => push(null),
    (err) => {
      // Always unblock the consumer even on failure — prevents infinite hang
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
