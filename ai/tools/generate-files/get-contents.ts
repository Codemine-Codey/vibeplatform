import { generateText, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

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

// Specialized provider for file generation — injects response_format: json_object and
// include_reasoning: false into every request body via fetch wrapper.
// Kept local to this file so gateway.ts callers are unaffected.
function makeFileGenProvider(modelId: string) {
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
          body.response_format = { type: 'json_object' }
          if (isOpenRouter) body.include_reasoning = false
          init = { ...init, body: JSON.stringify(body) }
        } catch { /* non-fatal */ }
      }
      return fetch(url, init)
    },
  })
}

// Generates file contents using DeepSeek JSON Output mode.
// Returns a single chunk containing all files after parsing and validating the JSON response.
// The async generator interface is preserved so generate-files.ts requires no structural change.
export async function* getContents(
  params: Params
): AsyncGenerator<FileContentChunk> {
  const provider = makeFileGenProvider(params.modelId)

  let result: Awaited<ReturnType<typeof generateText>>
  try {
    result = await generateText({
      model: provider.chat(params.modelId),
      maxOutputTokens: 384000,
      system:
        'You are a file content generator. Output a JSON object with a "files" array containing every requested file.\n' +
        'Format: {"files": [{"path": "relative/path/to/file.tsx", "content": "complete utf8 file content here"}]}\n' +
        'Rules:\n' +
        '- Generate COMPLETE content for every file. Never truncate or abbreviate.\n' +
        '- NEVER include lock files (pnpm-lock.yaml, package-lock.json, yarn.lock, bun.lockb).\n' +
        '- CRITICAL CSS: In src/index.css always use @tailwind base; @tailwind components; @tailwind utilities; — NEVER write @import \'tailwindcss/base\' or similar (resolves to JS and crashes PostCSS).\n' +
        '- Output ONLY the raw JSON object. No markdown fences, no explanation text, no preamble.',
      messages: [
        ...params.messages,
        {
          role: 'user',
          content:
            `Generate ALL of the following files. Output ONLY the JSON object {"files": [...]}:\n` +
            params.paths.map((p) => ` - ${p}`).join('\n'),
        },
      ],
    })
  } catch (err) {
    console.error('[getContents] generateText failed:', err)
    return
  }

  const files: File[] = []
  try {
    // Strip markdown fences if model wrapped output despite instructions
    const raw = result.text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')

    const parsed = JSON.parse(raw) as {
      files?: Array<{ path?: string; content?: string }>
    }

    for (const f of parsed.files ?? []) {
      if (!f.path || typeof f.content !== 'string') continue
      if (!params.paths.includes(f.path)) continue // only requested paths
      if (/lock\.(yaml|json|b)$/.test(f.path)) continue // no lock files
      if (f.content.trim().length < 5) {
        console.warn(`[getContents] Skipping empty file: ${f.path}`)
        continue
      }

      let content = f.content

      // Apply CSS sanity fix in-memory — catches wrong tailwind import before disk write
      if (f.path === 'src/index.css') {
        content = content
          .replace(/@import\s+['"]tailwindcss\/base['"]\s*;?/g, '@tailwind base;')
          .replace(/@import\s+['"]tailwindcss\/components['"]\s*;?/g, '@tailwind components;')
          .replace(/@import\s+['"]tailwindcss\/utilities['"]\s*;?/g, '@tailwind utilities;')
      }

      files.push({ path: f.path, content })
    }

    console.log(`[getContents] Parsed ${files.length}/${params.paths.length} files from JSON response`)
  } catch (err) {
    console.error('[getContents] JSON parse failed:', err)
    console.error('[getContents] Raw response (first 500 chars):', result.text.slice(0, 500))
    return
  }

  if (files.length > 0) {
    yield { files, paths: files.map((f) => f.path), written: [] }
  }
}
