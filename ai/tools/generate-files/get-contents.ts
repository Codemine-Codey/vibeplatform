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

// Uses tool calling to collect structured file output — works with DeepSeek's Chat Completions API.
// Each file is emitted as a tool call so files stream in one by one.
export async function* getContents(
  params: Params
): AsyncGenerator<FileContentChunk> {
  const generated: File[] = []

  const result = await generateText({
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
          const file: File = { path, content }
          generated.push(file)
          return `Wrote ${path}`
        },
      }),
    },
    stopWhen: stepCountIs(params.paths.length + 2),
  })

  void result

  if (generated.length === 0) {
    yield { files: [], paths: params.paths, written: [] }
    return
  }

  const written: string[] = []
  for (const file of generated) {
    written.push(file.path)
    yield {
      files: [file],
      paths: params.paths,
      written: [...written],
    }
  }
}
