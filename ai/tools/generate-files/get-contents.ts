import { streamText, tool, stepCountIs } from 'ai'
import z from 'zod/v3'
import type { ModelMessage } from 'ai'
import { getModelOptions } from '../../gateway'
import { getMaxOutputTokens } from '../../constants'
import { applySubstitutions } from './import-gate'

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
  // Centralized, API-compatible specifier rewrites (motion→framer-motion, deep
  // lucide icon paths→root). See import-gate.ts.
  return applySubstitutions(content)
}

// Deterministic FONT guard: the model sometimes picks a premium non-Google font
// (Geist, Satoshi, Cabinet Grotesk…). Those aren't on Google Fonts, so the @import
// silently fails and text falls back to a default — quietly ruining the type. We
// swap each known non-Google font for the nearest Google equivalent everywhere in
// src/index.css (font-family, CSS vars, AND the @import URL), then re-encode spaces
// in the Google Fonts `family=` params to '+' so the URL stays valid.
const FONT_SWAPS: Array<[RegExp, string]> = [
  [/Geist[\s+]Sans|Geist[\s+]Mono|Geist/gi, 'Space Grotesk'],
  [/Satoshi/gi, 'Plus Jakarta Sans'],
  [/Cabinet[\s+]Grotesk|Clash[\s+]Display|Clash[\s+]Grotesk/gi, 'Space Grotesk'],
  [/General[\s+]Sans|Switzer/gi, 'Outfit'],
  [/Neue[\s+]Montreal|Neue[\s+]Haas([\s+]Grotesk)?|Aeonik|TT[\s+]Norms|TT[\s+]Commons|S[öo]hne|Graphik|Basier([\s+]Circle)?/gi, 'Inter'],
]
function fixFonts(path: string, content: string): string {
  if (path !== 'src/index.css') return content
  let out = content
  for (const [re, good] of FONT_SWAPS) out = out.replace(re, good)
  // Re-encode spaces inside Google Fonts `family=...` params to '+' (valid URL).
  out = out.replace(/(family=)([^&'")]+)/g, (_m, p: string, fam: string) => p + fam.replace(/\s+/g, '+'))
  return out
}

// Router GUARANTEE (pairs with main.tsx wrapping <BrowserRouter>): main.tsx already
// mounts the router, so the AI must NEVER add BrowserRouter in App — doing so creates
// a double-router crash. Deterministically strip BrowserRouter/HashRouter (import +
// JSX wrapper) from generated files; <Routes> keeps the context from main.tsx. With
// this, the "Missing <BrowserRouter>" AND the double-router bugs are both impossible.
function fixRouter(path: string, content: string): string {
  if (!/\.(tsx|jsx)$/.test(path)) return content
  // main.tsx is the ONE place <BrowserRouter> MUST live (the scaffold mounts it there).
  // NEVER strip it here — doing so removed the router context and crashed useLocation()/
  // <Routes> (the recurring "Missing <BrowserRouter>" bug + the self-heal loop). Only
  // strip from other files (App/pages) to prevent a double-router.
  if (/(^|\/)main\.(tsx|jsx)$/.test(path)) return content
  let out = content
  // Drop BrowserRouter/HashRouter from react-router-dom imports (keep Routes/Route/Link/etc.)
  out = out.replace(/import\s*\{([^}]*)\}\s*from\s*['"]react-router-dom['"]\s*;?/g, (m, names: string) => {
    const kept = names.split(',').map(s => s.trim())
      .filter(n => n && !/^(BrowserRouter|HashRouter)(\s+as\s+\w+)?$/.test(n))
    return kept.length ? `import { ${kept.join(', ')} } from 'react-router-dom'` : ''
  })
  // Unwrap any <BrowserRouter ...> / </BrowserRouter> (and HashRouter) — keep children.
  out = out.replace(/<\/?(BrowserRouter|HashRouter)(\s[^>]*)?>/g, '')
  return out
}

// The model sometimes concatenates TWO requested files into ONE writeFile call,
// separated by a comment header like `// src/pages/Contact.tsx`. The second file
// then never exists → broken import → broken preview. Detect those boundary
// markers and split the content back into the intended files deterministically.
// ── Content-corruption guard (the root fix for the "true]}" bug) ──────────────
// DeepSeek intermittently emits MALFORMED tool-call JSON for a large file body: a JSON fragment
// (e.g. `true]}`) leaks into the START of the content, and sometimes the whole import block is
// dropped. Writing that garbage to disk is what caused broken previews + multi-minute self-heals.
// So before ANY file is written: (1) strip a leading JSON-artifact prefix, (2) if a code file is
// STILL clearly corrupted (no import/export/declaration/comment near the top — i.e. it lost its
// real head), REJECT it (return null) so the missing-file retry regenerates it cleanly. Garbage
// never reaches the preview.
function sanitizeContent(path: string, raw: string): string | null {
  let content = raw
  // Strip a leading JSON fragment: an optional bare literal (true/false/null) followed by closing
  // brackets/braces and any stray '>' or whitespace the broken parse left behind. Only fires when
  // the prefix actually contains a ] or } — real source never starts with those.
  const junk = content.match(/^\s*(?:true|false|null)?\s*[\]}][\]}>\s]*/)
  if (junk && /[\]}]/.test(junk[0])) content = content.slice(junk[0].length)
  content = content.replace(/^[\s>]+/, '')
  if (content.trim().length < 5) return null
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(path)) {
    const head = content.slice(0, 260)
    const looksLikeCode =
      /(^|\n)\s*(import|export|const|let|var|function|class|type|interface|enum|async|declare)\b/.test(head) ||
      /(^|\n)\s*(\/\/|\/\*)/.test(head) ||
      /^['"]use (client|strict)['"]/.test(content.trimStart())
    if (!looksLikeCode) return null // corrupted beyond a prefix (e.g. lost its imports) → regenerate
  }
  return content
}

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
  'Be CONCISE to stay fast: no redundant comments, no over-abstraction, no boilerplate the task does not need. Tight, complete code — every feature works, but no filler.\n' +
  'LANGUAGE: write ALL user-facing copy in ENGLISH by default — even when the brand is from another country (an Italian/French/Japanese/Spanish restaurant, brand, or product still gets ENGLISH headings, descriptions, buttons, labels, and body text). A few authentic proper nouns or dish names are fine (e.g. "Tagliatelle al Ragù"), but everything else is English. ONLY write the site in another language if the user EXPLICITLY asks for that language.\n' +
  'FAVOR THE PRE-INSTALLED STACK: the workspace already ships a large, verified dependency set — framer-motion, react-router-dom, the full shadcn/Radix UI set, lucide-react, react-hook-form + zod, @tanstack/react-query, three + @react-three/fiber + @react-three/drei, gsap, swiper, recharts/chart.js, zustand/jotai, @dnd-kit, embla, date-fns, and many more. ALWAYS reach for one of these FIRST. Solving something with an already-installed package is BETTER and more reliable than inventing or importing a new one — a new/uncommon package is the #1 cause of install + import errors. Only import a package outside the set when it is genuinely required and has no in-stack equivalent.\n' +
  'ROUTER: src/main.tsx already wraps the app in <BrowserRouter>. In App.tsx write <Routes> directly. NEVER import or add <BrowserRouter>/<HashRouter>, never edit main.tsx.\n' +
  'File order: write shared utilities and types first, then components, then pages.\n' +
  '\n## VERIFIED STACK CONTRACT — use ONLY what is installed. NEVER guess an import or a package.\n' +
  'This is a React 18 + Vite SPA (NOT Next.js — NO "use client", NO server components, NO RSC).\n' +
  'EXACT imports (these packages ARE installed — use these exact specifiers):\n' +
  '- Animation: import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion"  ← NEVER "motion/react", NEVER "motion".\n' +
  '- Icons: import { IconName } from "lucide-react"  ← the ONLY icon source. NEVER @phosphor-icons, NEVER @radix-ui/react-icons, NEVER inline <svg>.\n' +
  '- Routing: import { Routes, Route, Link, useNavigate } from "react-router-dom" (v6).\n' +
  '- Class util: import { cn } from "@/lib/utils". Pre-made UI: import { Button, Card, ... } from "@/components/ui/<name>".\n' +
  '- REUSABLE BLOCKS (use these — do NOT re-write this boilerplate): import { Section, Container, Reveal, Stagger, StaggerItem, Marquee, CountUp } from "@/components/blocks".\n' +
  '  • Section = consistent section vertical padding · Container = max-width + responsive padding · Reveal = scroll fade-up (wrap any section content) · Stagger + StaggerItem = staggered list reveal · Marquee = infinite horizontal scroll (logos/tags) · CountUp = animated number (stats).\n' +
  '  These are token-agnostic, so they inherit each project\'s unique colours/fonts/theme. Compose pages FROM them (e.g. <Section><Container><Reveal>…</Reveal></Container></Section>) — only hand-write a layout primitive when a section genuinely needs something they cannot express. This keeps output tight and the build fast.\n' +
  '- SECTION + APP blocks (optional): import { Hero, Footer, FeatureGrid, CTASection, FAQ, PageHeader, StatCard, EmptyState } from "@/components/blocks/sections". Footer (variant "columns"|"minimal"), FeatureGrid, CTASection, FAQ, and the app blocks (PageHeader / StatCard / EmptyState for dashboards & web apps) are fine to reuse — they speed you up and stay on-brand via tokens. Hero (variant "split"|"spotlight"|"editorial") is ONLY for simple/standard requests. For ANY brand that should feel distinctive, WRITE A CUSTOM HERO and custom signature sections per the DESIGN CONTRACT\'s signature moves + creative session ID — never default every project to the same Hero. Two projects of the same type (e.g. two restaurants) MUST NOT share a hero layout. Uniqueness comes from custom hero/signature sections; reuse is for motion helpers, chrome, and app scaffolding.\n' +
  '- GAME engine (games only): import { useGameLoop, useHighScore, playTone, rectsOverlap, circlesHit, useShake, burst, stepParticles } from "@/components/game/engine". ALWAYS drive the loop with useGameLoop (correct fixed-timestep + cleanup — never hand-roll it); use rectsOverlap/circlesHit for collision, useShake for screen shake, burst/stepParticles for particle juice, useHighScore for the best score, playTone for sound.\n' +
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
  '\n## ROUTING & LINKS — never strand the user on a blank screen.\n' +
  '- The app MUST include a catch-all route LAST: <Route path="*" element={<NotFound />} /> rendering a simple, on-brand "page not found" with a link home. A blank screen is never acceptable.\n' +
  '- Only use <Link to="/x"> for pages you ACTUALLY build a <Route> for. For a link you are NOT building a page for (e.g. a footer "Terms"/"Privacy" you did not create), DO NOT navigate — render it as a non-navigating element (a <button>/<span> styled as a link, or href="#" with onClick preventDefault). A visible link must either work or do nothing — never lead to a blank route.\n' +
  '\nBefore finishing each file, self-check: every import resolves to an installed package, every CSS value is complete, colors use tokens, text has contrast, every <Link> target has a matching <Route> (or is non-navigating), and a catch-all 404 exists. No placeholder content. Real code only.'

function buildGenSystem(designContext?: string): string {
  if (!designContext) return GEN_SYSTEM
  return GEN_SYSTEM + '\n\n## DESIGN CONTRACT (authoritative — every file must honor this)\n' + designContext
}

// SERIAL generation (STABLE) — one streamText writes all files via writeFile, each
// yielded as it completes. Parallel/concurrent streamText was tried twice for speed
// and BOTH times destabilized the Next.js dev server (async-context/stream issues) —
// reverted permanently. Speed must come from elsewhere (less output, warm pool, etc.),
// NOT model concurrency in this environment. Stability over speed.
// Interruption guard: order so the FILES THAT IMPORT OTHERS come last. App.tsx
// (the router — it imports every page) and main are generated dead last; index.css
// + lib/types first; components/pages in the middle. If a generation is cut off
// (timeout, network drop, closed tab) the router is either not-yet-written (no
// dangling import) or written only AFTER every page it references already exists.
// Turns a half-finished generation from "blank screen" into "a few pages missing
// but the app still renders" — and the import-closure fills the rest on a full run.
function rankPath(p: string): number {
  if (/(^|\/)(App)\.(tsx|jsx)$/.test(p) || /(^|\/)main\.(tsx|jsx)$/.test(p)) return 4
  if (/(^|\/)(routes?|router)\.(tsx|jsx|ts)$/i.test(p)) return 3.5
  if (/\/pages?\//.test(p)) return 3
  if (/\/components?\//.test(p)) return 2
  if (/\.css$/.test(p) || /\/(lib|utils|types|hooks|data|constants)\//.test(p)) return 0
  return 1
}
function orderForResilience(paths: string[]): string[] {
  return [...paths].sort((a, b) => rankPath(a) - rankPath(b))
}

export async function* getContents(
  params: Params
): AsyncGenerator<FileContentChunk> {
  const { messages, modelId, designContext } = params
  const paths = orderForResilience(params.paths)

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
          'Write ALL of the following files completely using writeFile, one call per file, ' +
          'IN THIS EXACT ORDER (foundation + pages first, the App/router that imports them LAST — ' +
          'so the app is always coherent even if generation is interrupted):\n' +
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
          // INTEGRITY GATE — reject corrupted tool-call output (the `true]}` fragment / dropped
          // imports) BEFORE it touches disk. A rejected file is left unwritten → the missing-file
          // retry regenerates it cleanly. Garbage never reaches the preview.
          const clean = sanitizeContent(path, content)
          if (clean === null) {
            console.warn(`[getContents] rejected corrupted content for ${path} — will regenerate`)
            return 'The content for this file was corrupted/incomplete. Call writeFile again for this exact path with the COMPLETE, valid file (start with the imports).'
          }
          for (const file of splitConcatenated(path, clean, paths)) {
            enqueue({ path: file.path, content: fixRouter(file.path, fixFonts(file.path, fixImports(file.path, fixCss(file.path, file.content)))) })
          }
          return 'ok'
        },
      }),
    },
    stopWhen: stepCountIs(paths.length + 5),
    onFinish: () => { finished = true; notify() },
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
