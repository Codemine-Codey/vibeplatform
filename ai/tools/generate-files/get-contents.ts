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

// Deterministic import GUARANTEE: no matter what the model writes, rewrite known
// wrong-but-equivalent imports to the package that is actually installed. This is
// the safety net behind the VERIFIED STACK CONTRACT — the #1 real-world break was
// `from 'motion/react'` (the framer-motion rebrand) when only `framer-motion` is
// installed. The two packages share an identical API, so the rewrite is lossless.
// Catches the bug before the preview ever loads — not a hope, a guarantee.
function fixImports(path: string, content: string): string {
  if (!/\.(tsx|ts|jsx|js)$/.test(path)) return content
  return content
    // framer-motion rebrand: 'motion/react' and bare 'motion' -> 'framer-motion'
    .replace(/(from\s*['"])motion\/react(['"])/g, '$1framer-motion$2')
    .replace(/(from\s*['"])motion(['"])/g, '$1framer-motion$2')
    .replace(/(import\s*\(\s*['"])motion\/react(['"]\s*\))/g, '$1framer-motion$2')
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
  '\n## VERIFIED STACK CONTRACT — use ONLY what is installed. NEVER guess an import or a package.\n' +
  'This is a React 18 + Vite SPA (NOT Next.js — NO "use client", NO server components, NO RSC).\n' +
  'EXACT imports (these packages ARE installed — use these exact specifiers):\n' +
  '- Animation: import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion"  ← NEVER "motion/react", NEVER "motion".\n' +
  '- Icons: import { IconName } from "lucide-react"  ← the ONLY icon source. NEVER @phosphor-icons, NEVER @radix-ui/react-icons, NEVER inline <svg>.\n' +
  '- Routing: import { Routes, Route, Link, useNavigate } from "react-router-dom" (v6).\n' +
  '- Class util: import { cn } from "@/lib/utils". Pre-made UI: import { Button, Card, ... } from "@/components/ui/<name>".\n' +
  'If you need a package NOT listed above, you MUST add it to package.json dependencies in this same generation (it will be installed). Never import a package you have not ensured exists.\n' +
  'SUBSTITUTION RULE: if the user (or your design instinct) wants something we do NOT have — a different icon set (Phosphor/Heroicons), a non-Google font (Geist/Satoshi), a specific library — DO NOT import it. Substitute the closest equivalent we DO have (Lucide for icons, a Google font in the same style, framer-motion for animation). Working with verified tools beats a broken import every time.\n' +
  '\n## CSS — write COMPLETE, VALID CSS only (a malformed rule breaks the build and triggers fix-loops).\n' +
  '- In src/index.css always use @tailwind base/components/utilities — NEVER @import for tailwind.\n' +
  '- Every property MUST have a complete value. NEVER write an empty/cut-off value like "background-image: repeating-linear-gradient();" or "background:;". If unsure, use a solid color or omit the rule.\n' +
  '- Close every (), {}, and string. No truncated gradients, no dangling declarations.\n' +
  '\n## DESIGN IS NON-NEGOTIABLE — follow the DESIGN CONTRACT below exactly:\n' +
  '- Use ONLY the contract\'s color tokens (CSS variables / token classes). NEVER hardcode ad-hoc hex for text or section backgrounds. Headlines and body text MUST use a high-contrast token against their background — NEVER let text color approach the background color (no invisible/low-contrast text).\n' +
  '- Use the contract\'s exact font pairing via Google Fonts @import in src/index.css. The fonts MUST be available on Google Fonts (the brief picks Google-available families). NEVER use Geist/Satoshi/Cabinet Grotesk (not on Google Fonts) — they will fail to load.\n' +
  '- Honor the layout archetype and signature moves. No generic three-equal-cards, no centered-mesh hero, no default Inter/Roboto as the display face.\n' +
  '- Establish a clear type scale (one large display size, one heading size, one body size) and consistent spacing.\n' +
  '\nBefore finishing each file, self-check: every import resolves to an installed package, every CSS value is complete, colors use tokens, text has contrast. No placeholder content. Real code only.'

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
            enqueue({ path: file.path, content: fixImports(file.path, fixCss(file.path, file.content)) })
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
