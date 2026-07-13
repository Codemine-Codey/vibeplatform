import { streamText } from 'ai'
import { randomUUID } from 'node:crypto'
import type { ModelMessage } from 'ai'
import { getModelOptions } from '../../gateway'
import { getMaxOutputTokens } from '../../constants'
import { applySubstitutions, auditLocalImports, fixUnknownLocalImports } from './import-gate'
import { applyIconFix } from '../../gates/semantic-gate'

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
  // Durable-runs STEP 3: hard deadline guard for the enrichment chain. When the
  // invocation nears the Vercel function cap, the model call is aborted; any file
  // whose CMEND fence already landed is safely kept (salvaged), the rest re-run in
  // the next chained invocation. Undefined on the normal (non-chained) path.
  abortSignal?: AbortSignal
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

// P1-A mechanical icon fix (per-file, Q4 hybrid): an empty locally-defined `*Icon`
// component → a VALIDATED lucide import (or a safe inline element). Only .tsx/.jsx.
// applyIconFix guarantees any emitted import name is present in the installed
// lucide-react, so it can NEVER introduce a 404 import. Runs as a pure transform in
// the same chain as fixRouter/fixImports so the fixed content is what reaches disk.
function fixIcons(path: string, content: string): string {
  if (!/\.(tsx|jsx)$/.test(path)) return content
  return applyIconFix(content)
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
    // ── JSX backslash-escape fix ───────────────────────────────────────────────
    // `\"` inside JSX attribute strings crashes Vite: "Expecting Unicode escape
    // sequence \uXXXX". In JS expression context `\"` === `"` anyway. Always safe.
    if (content.includes('\\"')) {
      content = content.replace(/\\"/g, '"')
    }

    // ── Import drift fixer ────────────────────────────────────────────────────
    // Silently rewrite well-known wrong imports to their correct in-scaffold
    // equivalents. These are the most common AI training-data mistakes:
    //   motion/react  →  framer-motion  (the AI SDK renamed it; we use old name)
    //   "motion" bare →  framer-motion
    //   @phosphor-icons/react  →  lucide-react  (not installed)
    //   @radix-ui/react-icons  →  lucide-react  (not installed standalone)
    //   @tabler/icons-react    →  lucide-react  (not installed)
    //   @heroicons/react       →  lucide-react  (not installed)
    //   next/image, next/link, next/font  →  strip (this is Vite, not Next.js)
    //   process.env.NEXT_PUBLIC_ →  import.meta.env.VITE_  (Next.js pattern)
    //   process.env.REACT_APP_   →  import.meta.env.VITE_  (CRA pattern)
    content = content
      .replace(/from\s+['"]motion\/react['"]/g, "from 'framer-motion'")
      .replace(/from\s+['"]motion['"]/g, "from 'framer-motion'")
      .replace(/from\s+['"]@phosphor-icons\/react['"]/g, "from 'lucide-react'")
      .replace(/from\s+['"]@radix-ui\/react-icons['"]/g, "from 'lucide-react'")
      .replace(/from\s+['"]@tabler\/icons-react['"]/g, "from 'lucide-react'")
      .replace(/from\s+['"]@heroicons\/react(\/[^'"]+)?['"]/g, "from 'lucide-react'")
      .replace(/process\.env\.NEXT_PUBLIC_(\w+)/g, 'import.meta.env.VITE_$1')
      .replace(/process\.env\.REACT_APP_(\w+)/g, 'import.meta.env.VITE_$1')

    // Strip Next.js-only imports that crash Vite (no equivalent — remove silently)
    content = content
      .replace(/^import\s+\w+\s+from\s+['"]next\/image['"]\s*;?\s*\n?/gm, '')
      .replace(/^import\s+\{[^}]*\}\s+from\s+['"]next\/navigation['"]\s*;?\s*\n?/gm, '')
      .replace(/^import\s+\{[^}]*\}\s+from\s+['"]next\/font\/google['"]\s*;?\s*\n?/gm, '')

    // Strip Express/Node server imports (these never run in a Vite sandbox)
    content = content
      .replace(/^import\s+express\s+from\s+['"]express['"]\s*;?\s*\n?/gm, '')
      .replace(/^const\s+express\s*=\s*require\(['"]express['"]\)\s*;?\s*\n?/gm, '')
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
  'You are a senior product designer + engineer writing real, production source files.\n' +
  'Write COMPLETE production-quality code for every file — never truncate, abbreviate, or placeholder. Output each file in the EXACT delimited raw-text format given in the instruction (write code LITERALLY — do NOT wrap it in JSON or markdown code fences).\n' +
  'Be CONCISE to stay fast: no redundant comments, no over-abstraction, no boilerplate the task does not need. Tight, complete code — every feature works, but no filler.\n' +
  'LANGUAGE: write ALL user-facing copy in ENGLISH by default — even when the brand is from another country (an Italian/French/Japanese/Spanish restaurant, brand, or product still gets ENGLISH headings, descriptions, buttons, labels, and body text). A few authentic proper nouns or dish names are fine (e.g. "Tagliatelle al Ragù"), but everything else is English. ONLY write the site in another language if the user EXPLICITLY asks for that language.\n' +
  'FAVOR THE PRE-INSTALLED STACK: the workspace already ships a large, verified dependency set — framer-motion, react-router-dom, the full shadcn/Radix UI set, lucide-react, react-hook-form + zod, @tanstack/react-query, three + @react-three/fiber + @react-three/drei, gsap, swiper, recharts/chart.js, zustand/jotai, @dnd-kit, embla, date-fns, and many more. ALWAYS reach for one of these FIRST. Solving something with an already-installed package is BETTER and more reliable than inventing or importing a new one — a new/uncommon package is the #1 cause of install + import errors. Only import a package outside the set when it is genuinely required and has no in-stack equivalent.\n' +
  'ENTRY: NEVER write src/App.tsx or src/main.tsx — both are scaffolded, read-only, and discarded. The app ROOT is always src/pages/Home.tsx (a default-exported component, no props). WEBSITES/WEBAPPS: routing is file-based — each src/pages/*.tsx is auto-routed by filename (Home.tsx → "/", About.tsx → "/about"); shared nav/footer go in src/components/Layout.tsx (default-exported, wraps {children}); NEVER import <BrowserRouter>/<Routes>/<Route>. GAMES: src/pages/Home.tsx is your game root (it mounts the canvas / game UI) — there is no router.\n' +
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
  '- PERSISTENT CSS UTILITIES (already defined in src/styles/cm-ui.css — USE these class names directly, do NOT re-declare them in index.css): `gradient-text` / `gradient-text-accent` (token gradient headline text), `glass` / `glass-strong` (frosted panel), `glow-sm` / `glow` (primary glow shadow), `section` (vertical section rhythm), `container-page` (max-width page container), `img-scrim` (bottom-up image fade for text-over-image), `animate-float` / `animate-marquee` / `animate-pulse-slow`, `text-shimmer`. They are token-driven so they match each brand automatically. Writing your own @keyframes/gradient-clip CSS for these is a common build-break — prefer the class.\n' +
  '- 404 PAGE: a pre-built on-brand NotFound already exists — `import NotFound from "@/components/NotFound"` and wire it as the catch-all: <Route path="*" element={<NotFound />} />. Do NOT hand-write a 404.\n' +
  '- GAME engine (games only): import { useGameLoop, useHighScore, playTone, rectsOverlap, circlesHit, useShake, burst, stepParticles, SPEEDS, SPAWN } from "@/components/game/engine". ALWAYS drive the loop with useGameLoop (correct fixed-timestep + cleanup — never hand-roll it); use rectsOverlap/circlesHit for collision, useShake for screen shake, burst/stepParticles for particle juice, useHighScore for the best score, playTone for sound. USE the SPEEDS/SPAWN constants (e.g. SPEEDS.flappy, SPAWN.balloonMs) for movement/spawn tuning — these are calibrated so the game is neither turtle-slow nor impossible; do not invent raw magic numbers.\n' +
  '- GAME STATE LAW (enforced — breaking this = broken game): ALL mutable game data (positions, velocities, entities, score, timers) goes in ONE useRef: `const gs = useRef({...})`. `useState` is for HUD overlay ONLY (phase for showing overlays, score for display). NEVER call setState inside the game loop update — reads/writes go to gs.current only, then setUiScore(gs.current.score) at end of update. Keyboard handlers read gs.current (not state values) to avoid stale closures. startGame() resets gs.current then calls setUiPhase("playing"). endGame() sets gs.current.phase = "over" then calls setUiPhase("over").\n' +
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
  const { messages, modelId, designContext, abortSignal } = params
  const allPaths = orderForResilience(params.paths)
  const written = new Set<string>()

  // ── RAW-TEXT, NONCE-FENCED TRANSPORT + P0-A MANIFEST CLOSURE ───────────────────────────────
  // Files are streamed as PLAIN TEXT between unguessable fences — never encoded inside a JSON
  // tool-call string. Because the body is never JSON-escaped, it CANNOT be mangled by bad escaping
  // (the `true]}` / dropped-import class is impossible here) and file size stops mattering.
  //
  // CLOSURE CONTRACT (P0-A): a file is written ONLY when its CMEND fence arrives — a truncated file
  // (no END) is dropped, never shipped partial. Then we LOOP: any manifest path still unwritten
  // (truncated or skipped) is re-requested — ONLY the missing files — for up to MAX_ROUNDS. This
  // turns the old manual "Please continue from where you left off" click into a deterministic job
  // the pipeline does itself. Truncation stops being a user-visible failure.
  const MAX_ROUNDS = 3
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const pending = allPaths.filter(p => !written.has(p))
    if (pending.length === 0) break

    const nonce = randomUUID().replace(/-/g, '').slice(0, 16)
    const header =
      round === 0
        ? `Output EVERY file listed below as RAW TEXT in EXACTLY this delimited format`
        : `The previous output was cut off before all files were finished. Output ONLY the files listed below — each one COMPLETE, start to finish — in EXACTLY this delimited format`
    const instruction =
      `${header} — NO JSON, NO markdown code fences, NO commentary between blocks:\n\n` +
      `<<<CMFILE:${nonce}:relative/path/here.tsx>>>\n` +
      `<the complete file content, written literally exactly as it should be saved to disk>\n` +
      `<<<CMEND:${nonce}>>>\n\n` +
      `Rules:\n` +
      `- The path on each CMFILE line MUST exactly match one path from the list below.\n` +
      `- Put the ENTIRE file between its CMFILE and CMEND lines. Write the code LITERALLY — do not escape quotes or newlines, do not wrap in backticks.\n` +
      `- One CMFILE/CMEND block per file. Output nothing outside the blocks.\n\n` +
      `Write them IN THIS ORDER (foundation + pages first, the App/router that imports them LAST — so the app stays coherent even if generation is interrupted):\n` +
      pending.map(p => `- ${p}`).join('\n')

    // Cap each round at 120s regardless of the outer deadline. Without this,
    // a single round for a physics-heavy game can run 3-5 min per attempt,
    // and MAX_ROUNDS=3 compounds that to 9-15 min of wall time.
    const roundTimeout = AbortSignal.timeout(120_000)
    const effectiveSignal = abortSignal
      ? AbortSignal.any([abortSignal, roundTimeout])
      : roundTimeout

    const result = streamText({
      ...getModelOptions(modelId),
      maxOutputTokens: getMaxOutputTokens(modelId),
      system: buildGenSystem(designContext),
      messages: [...messages, { role: 'user' as const, content: instruction }],
      abortSignal: effectiveSignal,
      onError: err => console.error('[getContents] stream error:', err),
    })

    // Parse for COMPLETE <<<CMFILE:nonce:path>>> … <<<CMEND:nonce>>> blocks. Match on fence
    // STRUCTURE, not the exact nonce — the marker is already unique enough that it can't collide
    // with real code, and tolerating a mangled nonce means one stray char never breaks the parse.
    const blockRe = /<<<CMFILE:[^:>\n]+:(.+?)>>>\r?\n([\s\S]*?)\r?\n?<<<CMEND[^>\n]*>>>/g
    let buffer = ''
    for await (const delta of result.textStream) {
      buffer += delta
      blockRe.lastIndex = 0
      let consumedTo = 0
      let m: RegExpExecArray | null
      while ((m = blockRe.exec(buffer)) !== null) {
        consumedTo = m.index + m[0].length
        const filePath = m[1].trim()
        if (!allPaths.includes(filePath) || written.has(filePath)) continue
        // INTEGRITY GATE (defence in depth) — reject empty/garbage before it's written; the missing
        // file is then re-requested in the next round instead of shipping corruption.
        const clean = sanitizeContent(filePath, m[2])
        if (clean === null) {
          console.warn(`[getContents] rejected corrupted/empty content for ${filePath} — will re-request`)
          continue
        }
        written.add(filePath)
        for (const file of splitConcatenated(filePath, clean, allPaths)) {
          // Mark EVERY produced path written (incl. concatenated splits) so closure sees them.
          written.add(file.path)
          const fixed = fixIcons(file.path, fixRouter(file.path, fixFonts(file.path, fixImports(file.path, fixCss(file.path, file.content)))))
          // Hard pre-write gate: strip any @/ imports that don't resolve to a scaffold
          // path or a file in this generation batch. Converts "module not found" (kills
          // ALL rendering) into "X is not defined" (only breaks the component using it),
          // giving verifyAndRepair a precise, fixable target instead of a fatal cascade.
          const gated = fixUnknownLocalImports(file.path, fixed, allPaths)
          // Log any remaining unknown imports for telemetry (should be zero after fix)
          const badImports = auditLocalImports(file.path, gated, allPaths)
          if (badImports.length > 0) {
            console.warn(`[import-audit] ${file.path} still has unknown @/ imports after gate: ${badImports.join(', ')}`)
          }
          yield {
            files: [{ path: file.path, content: gated }],
            paths: [file.path],
            written: [],
          }
        }
      }
      if (consumedTo > 0) buffer = buffer.slice(consumedTo)
    }

    if (round > 0) {
      const recovered = pending.filter(p => written.has(p)).length
      console.warn(`[getContents] auto-continue round ${round}: re-requested ${pending.length}, recovered ${recovered}`)
    }
  }

  const stillMissing = allPaths.filter(p => !written.has(p))
  if (stillMissing.length > 0) {
    // Rare: after MAX_ROUNDS a file never completed. The pipeline's import-closure / missing-file
    // handling is the final backstop; log loudly so it's visible in the reliability metrics.
    console.warn(`[getContents] CLOSURE INCOMPLETE — ${stillMissing.length} file(s) unrecovered after ${MAX_ROUNDS} rounds: ${stillMissing.join(', ')}`)
  }
}
