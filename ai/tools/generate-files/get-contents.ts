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
  '- BACKGROUND = LEGIBILITY FIRST. Any background treatment (grain, gradient, particles, blobs, 3D) sits QUIETLY behind content at LOW opacity — it must NEVER make text hard to read or fight the content. Grain/noise ≤ ~6% opacity. If in doubt, use a clean solid token background. A busy/noisy background that hurts readability is a FAILURE — subtle and readable beats loud every time.\n' +
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

// ── INTERFACE REGISTRY (the "import/export agent") ────────────────────────────
// The named-vs-default blank happened because each per-file call GUESSED how to import
// its dependencies. This extracts a file's REAL export contract the moment it's written,
// so every later file is TOLD exactly how to import it — no guessing, no mismatch.
// Returns a one-line human directive, e.g.
//   "default export `HeroSection` → import it as: import HeroSection from '@/components/sections/HeroSection'"
//   "named exports { featured, burgers } → import as: import { featured, burgers } from '@/lib/menuData'"
function atSpecFor(path: string): string {
  // src/components/X.tsx → @/components/X   |   src/pages/Home.tsx → @/pages/Home
  return '@/' + path.replace(/^src\//, '').replace(/\.(tsx|ts|jsx|js)$/, '')
}
function summarizeInterface(path: string, content: string): string {
  if (path.endsWith('.css')) return 'stylesheet (import for side effects only)'
  const spec = atSpecFor(path)
  // Default export name (function/class/const/identifier).
  let defaultName: string | null = null
  const dm =
    content.match(/export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/) ||
    content.match(/export\s+default\s+([A-Za-z0-9_$]+)\s*;?\s*$/m)
  if (dm) defaultName = dm[1]
  else if (/export\s+default\b/.test(content)) defaultName = path.split('/').pop()!.replace(/\.(tsx|ts|jsx|js)$/, '')
  // Named exports.
  const named = new Set<string>()
  for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g)) {
    if (!/export\s+default/.test(m[0])) named.add(m[1])
  }
  for (const m of content.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim(); if (!seg) continue
      const asM = seg.match(/\bas\s+([A-Za-z0-9_$]+)\s*$/)
      named.add(asM ? asM[1] : seg.split(/\s+/)[0])
    }
  }
  const parts: string[] = []
  if (defaultName) parts.push(`default export \`${defaultName}\` → import as: import ${defaultName} from '${spec}'`)
  if (named.size) parts.push(`named exports { ${[...named].join(', ')} } → import as: import { ${[...named].join(', ')} } from '${spec}'`)
  return parts.length ? parts.join('  ·  ') : `(no exports detected — check before importing)`
}

export async function* getContents(
  params: Params
): AsyncGenerator<FileContentChunk> {
  const { messages, modelId, designContext, abortSignal } = params
  const allPaths = orderForResilience(params.paths)
  const written = new Set<string>()
  // Interface registry: path → its real export contract, filled as each file completes.
  const interfaceOf = new Map<string, string>()

  // ── PER-FILE SCOPED GENERATION (anti-drift — the single biggest quality lever) ─────────────
  // Instead of ONE model call writing every file (which DRIFTS — the model forgets the palette/
  // tokens/archetype by file 6 and leaves later sections thin/generic), generate ONE file per
  // call, each with the SAME design plan (DESIGN CONTRACT) pinned at the top and the full file
  // list for imports. A fresh, focused call per file cannot drift — this is what keeps every
  // section on-theme and fully filled. SERIAL, not parallel: parallel streamText destabilized
  // the dev server here twice (see note above) — serial keeps that stability while killing drift.
  //
  // Transport stays the raw-text, nonce-fenced format (never JSON-escaped → the `true]}`/dropped-
  // import class is impossible). A file is kept ONLY when its CMEND fence arrives; a truncated/
  // corrupt file is retried (up to 2 attempts/file), then left to the pipeline's missing-file
  // backstop + the section-completeness gate.
  for (const path of allPaths) {
    if (abortSignal?.aborted) break
    if (written.has(path)) continue

    // INTERFACE REGISTRY: split the other files into (a) ALREADY-GENERATED — show their
    // EXACT export contract so this file imports them correctly (no default/named guess),
    // and (b) NOT-YET-GENERATED — show the path + a light hint so it imports by the path
    // it WILL export. Files are generated dependency-first (orderForResilience: lib/data →
    // components → pages → App), so a page almost always sees its sections' real contracts.
    const known = allPaths.filter(p => p !== path && interfaceOf.has(p))
    const pending = allPaths.filter(p => p !== path && !interfaceOf.has(p))

    for (let attempt = 0; attempt < 2 && !written.has(path); attempt++) {
      const nonce = randomUUID().replace(/-/g, '').slice(0, 16)
      const instruction =
        `Generate EXACTLY ONE file — \`${path}\` — as RAW TEXT in this delimited format ` +
        `(NO JSON, NO markdown code fences, NO commentary):\n\n` +
        `<<<CMFILE:${nonce}:${path}>>>\n` +
        `<the complete file content, written literally exactly as it should be saved to disk>\n` +
        `<<<CMEND:${nonce}>>>\n\n` +
        `Rules:\n` +
        `- Output ONLY this one file, COMPLETE start to finish, between the fences. Nothing else.\n` +
        `- Write the code LITERALLY — do not escape quotes or newlines, do not wrap in backticks.\n` +
        `- Stay 100% consistent with the DESIGN CONTRACT (identical colour tokens, fonts, archetype, spacing) — this file is one part of a cohesive site, so it MUST match the others.\n` +
        `- Make it RICH and COMPLETE: real copy, real imagery, full styling. Never a thin stub, placeholder, or "coming soon".\n` +
        (known.length
          ? `\n## EXISTING FILES — import them EXACTLY as declared (do NOT guess default vs named, do NOT redefine them):\n${known.map(p => `- ${interfaceOf.get(p)}`).join('\n')}`
          : '') +
        (pending.length
          ? `\n\nFiles that will also exist (import from these paths if you need them; use a DEFAULT export + default import for section/page components, a NAMED export for data/util/hook modules):\n${pending.map(p => `- ${p}`).join('\n')}`
          : '') +
        `\n\nWhen THIS file is a section/page component, give it a DEFAULT export named after the file (e.g. ${path.split('/').pop()!.replace(/\.(tsx|ts|jsx|js)$/, '')}). When it is a data/util/hook module, use NAMED exports. Be consistent so other files import it correctly.`

      // Per-file cap so a single stubborn file can't burn the whole budget; the outer
      // deadline (abortSignal) still wins if the invocation nears the function cap.
      const perFileTimeout = AbortSignal.timeout(90_000)
      const effectiveSignal = abortSignal
        ? AbortSignal.any([abortSignal, perFileTimeout])
        : perFileTimeout

      let buffer = ''
      let got = false
      try {
        const result = streamText({
          ...getModelOptions(modelId),
          maxOutputTokens: getMaxOutputTokens(modelId),
          system: buildGenSystem(designContext),
          messages: [...messages, { role: 'user' as const, content: instruction }],
          abortSignal: effectiveSignal,
          onError: err => console.error(`[getContents] stream error for ${path}:`, err),
        })

        const blockRe = /<<<CMFILE:[^:>\n]+:(.+?)>>>\r?\n([\s\S]*?)\r?\n?<<<CMEND[^>\n]*>>>/g
        for await (const delta of result.textStream) {
          buffer += delta
          blockRe.lastIndex = 0
          let m: RegExpExecArray | null
          while ((m = blockRe.exec(buffer)) !== null) {
            const echoed = m[1].trim()
            // Accept the block: use the echoed path if it's a known target, else the requested one.
            const filePath = allPaths.includes(echoed) ? echoed : path
            if (written.has(filePath)) continue
            const clean = sanitizeContent(filePath, m[2])
            if (clean === null) {
              console.warn(`[getContents] rejected corrupted/empty content for ${filePath} — will retry`)
              continue
            }
            written.add(filePath)
            for (const file of splitConcatenated(filePath, clean, allPaths)) {
              written.add(file.path)
              const fixed = fixIcons(file.path, fixRouter(file.path, fixFonts(file.path, fixImports(file.path, fixCss(file.path, file.content)))))
              const gated = fixUnknownLocalImports(file.path, fixed, allPaths)
              const badImports = auditLocalImports(file.path, gated, allPaths)
              if (badImports.length > 0) console.warn(`[import-audit] ${file.path} unknown @/ imports after gate: ${badImports.join(', ')}`)
              // Record this file's REAL export contract so every later file imports it right.
              if (/\.(tsx|ts|jsx|js)$/.test(file.path)) interfaceOf.set(file.path, summarizeInterface(file.path, gated))
              yield { files: [{ path: file.path, content: gated }], paths: [file.path], written: [] }
            }
            got = true
          }
          if (got) break // this file is complete — stop reading, move to the next file
        }
      } catch (e) {
        console.warn(`[getContents] per-file gen failed for ${path} (attempt ${attempt + 1}):`, e instanceof Error ? e.message : e)
      }
      if (abortSignal?.aborted) break
    }
  }

  const stillMissing = allPaths.filter(p => !written.has(p))
  if (stillMissing.length > 0) {
    console.warn(`[getContents] per-file INCOMPLETE — ${stillMissing.length} file(s) unrecovered: ${stillMissing.join(', ')}`)
  }
}
