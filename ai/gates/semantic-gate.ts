// ── P1-A: Static semantic gate ────────────────────────────────────────────────
// The biggest single reliability win: three deterministic, no-AI, no-browser checks
// run over generated file CONTENTS before the preview is ever shown. Every check is
// designed around one rule — NEVER create a new error. We only ever ADD safe things
// (a validated import, an additive CSS rule) or REGENERATE a provably-empty file; we
// NEVER strip a class from JSX, guess semantics, or emit an import that could 404.
//
//   1. Mechanical icon fix (Q3/Q2)  — an empty `*Icon` component → a REAL lucide icon
//      whose name is PROVEN to exist in the installed lucide-react, else a safe inline
//      element. Zero AI. Cannot emit a bad import (see the safety proof on resolveLucide).
//   2. CSS closure (Q2)            — classNames used in JSX but never defined get a
//      correct synthesized definition (recognized patterns) or a harmless no-op
//      (unrecognized) APPENDED to index.css. Never strips, never hides content.
//   3. Empty-render heuristics (Q3) — components that render nothing are flagged as
//      BLOCKERS (regenerate the file) or ADVISORIES (flag; escalate only on pages).
//
// Wiring is HYBRID (Q4): the mechanical icon fix runs per-file as each file is
// finalized (it's a pure content transform); CSS closure + empty-render run ONCE over
// the full file set after everything is written. No concurrency is introduced.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// ── Lucide validation set (the icon-fix safety foundation) ────────────────────
// We read the ACTUAL export list from the installed lucide-react so we never invent
// an icon name. But the generated app pins lucide-react "^0.468.0" (a 0.x caret =
// 0.468.x) while THIS package may ship a newer lucide with icons that 0.468 lacks —
// so validating against the installed set alone could still emit a name absent from
// the app's version. Fix: the emittable set is (curated-old-names ∩ installed). Every
// STABLE name below is a long-established lucide icon guaranteed to exist in 0.468;
// intersecting with the installed set drops any stray typo. Result: any name we ever
// emit is present in BOTH → it resolves in the generated app → it can NEVER 404.

// Curated icons that have existed in lucide since well before 0.468 (safe to import
// in the app). Kept broad enough to cover the common cases (incl. the sushi/food
// domain that produced the original FishIcon bug); anything not matched falls back.
const STABLE_ICON_NAMES: string[] = [
  // guaranteed fallbacks (ancient)
  'Circle', 'Sparkles', 'Star', 'Heart', 'Zap', 'Check', 'X', 'Plus', 'Minus',
  // food / restaurant / drink
  'Utensils', 'UtensilsCrossed', 'Coffee', 'Wine', 'Beer', 'Martini', 'Fish',
  'Beef', 'Egg', 'Cake', 'Pizza', 'Soup', 'Salad', 'Croissant', 'Sandwich',
  'Popcorn', 'Candy', 'Cookie', 'Milk', 'Apple', 'Cherry', 'Grape', 'Carrot',
  'Wheat', 'Drumstick', 'CupSoda', 'GlassWater',
  // arrows / chevrons / nav
  'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ChevronRight', 'ChevronLeft',
  'ChevronUp', 'ChevronDown', 'ChevronsRight', 'ChevronsLeft', 'Menu', 'MoreHorizontal',
  'MoreVertical', 'ExternalLink', 'Navigation', 'Compass', 'Map', 'MapPin',
  // common UI
  'Search', 'Settings', 'User', 'Users', 'Home', 'Mail', 'Phone', 'Calendar',
  'Clock', 'Bell', 'BellRing', 'Bookmark', 'Book', 'BookOpen', 'FileText', 'File',
  'Folder', 'Clipboard', 'List', 'LayoutGrid', 'Grid', 'Layers', 'Filter', 'Sliders',
  'Eye', 'EyeOff', 'Lock', 'Unlock', 'Key', 'Shield', 'ShieldCheck', 'Info',
  'HelpCircle', 'AlertCircle', 'AlertTriangle', 'CheckCircle', 'XCircle', 'Ban',
  // commerce
  'ShoppingCart', 'ShoppingBag', 'CreditCard', 'DollarSign', 'Tag', 'Gift', 'Wallet',
  'Receipt', 'Coins', 'Percent', 'Package', 'Truck', 'Store', 'Briefcase',
  // media / social
  'Play', 'Pause', 'Camera', 'Image', 'Video', 'Music', 'Mic', 'Volume2', 'Headphones',
  'Share2', 'Link', 'ThumbsUp', 'MessageCircle', 'MessageSquare', 'Send', 'Smile',
  // awards / brand feel
  'Award', 'Trophy', 'Crown', 'Gem', 'Flame', 'Rocket', 'Target', 'Flag', 'Wand2',
  'Palette', 'Brush', 'PenTool', 'Pencil', 'Feather',
  // nature / weather
  'Sun', 'Moon', 'Cloud', 'Leaf', 'Flower', 'Flower2', 'TreePine', 'Trees', 'Bird',
  'Droplet', 'Droplets', 'Wind', 'Snowflake', 'Umbrella', 'Sprout',
  // objects / tech
  'Globe', 'Anchor', 'Plane', 'Car', 'Bike', 'Ship', 'Building', 'Building2', 'Hammer',
  'Wrench', 'Scissors', 'Lightbulb', 'Monitor', 'Smartphone', 'Laptop', 'Wifi',
  'Cpu', 'Database', 'Server', 'Printer', 'Gamepad2', 'Puzzle', 'Dumbbell',
  'Stethoscope', 'Pill', 'Scale', 'GraduationCap', 'Landmark', 'Trash2', 'Download',
  'Upload', 'RefreshCw', 'Loader', 'Loader2', 'Power', 'Plug', 'Battery',
  'TrendingUp', 'TrendingDown', 'BarChart', 'PieChart', 'Activity', 'Hash', 'AtSign',
  'Quote', 'Sparkle', 'Handshake', 'HeartHandshake', 'Footprints', 'Lightbulb',
]

let _validIcons: Set<string> | null = null
let _validIconsLoaded = false

// Build the emittable icon set once: curated-stable ∩ installed. If the installed
// export list can't be read for any reason, fall back to the curated stable list on
// its own (still safe — every curated name predates 0.468). Cached for the process.
function getValidIcons(): Set<string> {
  if (_validIcons) return _validIcons
  const stable = new Set(STABLE_ICON_NAMES)
  let installed: Set<string> | null = null
  try {
    const req = createRequire(__filename)
    // Resolve the installed lucide-react's type declarations and read its export list.
    const pkgPath = req.resolve('lucide-react/package.json')
    const dtsPath = pkgPath.replace(/package\.json$/, 'dist/lucide-react.d.ts')
    const dts = readFileSync(dtsPath, 'utf8')
    installed = new Set([...dts.matchAll(/declare const (\w+):/g)].map((m) => m[1]))
  } catch {
    installed = null
  }
  _validIconsLoaded = installed !== null
  _validIcons = installed ? new Set([...stable].filter((n) => installed!.has(n))) : stable
  if (_validIcons.size === 0) _validIcons = stable // never end up empty
  return _validIcons
}

// Resolve a target lucide name for a stripped component base (e.g. "Fish", "ChefHat").
// Returns a name that is PROVEN present, or null when nothing safe is available
// (only possible if the whole valid set failed to load — then callers inline a safe
// element instead of importing). This is the core of the "cannot emit a bad import".
function resolveLucide(base: string): string | null {
  const valid = getValidIcons()
  if (valid.size === 0) return null
  if (valid.has(base)) return base
  // Try a couple of trivial, SAFE morphologies (still validated against `valid`).
  const singular = base.replace(/s$/, '')
  if (singular !== base && valid.has(singular)) return singular
  // Guaranteed fallbacks — both are ancient; whichever is in the valid set wins.
  for (const fb of ['Sparkles', 'Circle', 'Star']) if (valid.has(fb)) return fb
  return null
}

// A safe, non-empty inline element used when we choose NOT to emit an import. Inherits
// the surrounding text color, is aria-hidden, and always paints something.
const SAFE_INLINE =
  '<span aria-hidden="true" style={{ display: "inline-block", width: "1em", height: "1em", borderRadius: "9999px", background: "currentColor", opacity: 0.55 }} />'

// Tokens that count as an "empty render" for a component body.
const EMPTY_RENDER =
  /^(?:null|undefined|<>\s*<\/>|<React\.Fragment\s*\/>|<(?:span|div|i|svg)(?:\s+[^>]*?)?\/>|<(?:span|div|i)(?:\s+[^>]*?)?>\s*<\/(?:span|div|i)>)$/

function prependImport(content: string, importLine: string): string {
  // Insert after the last line of the top-of-file import block; else at the very start.
  const lines = content.split('\n')
  let lastImport = -1
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (l.startsWith('import ')) lastImport = i
    else if (l === '' || l.startsWith('//') || l.startsWith('/*') || l.startsWith('*')) continue
    else break // hit real code — stop scanning the header
  }
  if (lastImport < 0) return importLine + '\n' + content
  lines.splice(lastImport + 1, 0, importLine)
  return lines.join('\n')
}

// ── 1. Mechanical icon fix (per-file, pure transform) ─────────────────────────
// Detects a locally-defined `*Icon` component whose body renders empty and (a) if the
// component is NOT exported, replaces the definition with a validated lucide import
// aliased to the same local name (so all `<XIcon .../>` usages keep working); (b) if it
// IS exported (another file may import it), keeps the export but swaps the empty body
// for a safe inline element. Either way no dangling reference and no risky import.
export function fixEmptyIcons(content: string): string {
  if (!/Icon\b/.test(content)) return content
  let out = content

  // Arrow components:  const XIcon = (args) => <empty>   /   => { return <empty> }
  const arrowRe =
    /(^|\n)([ \t]*)(export\s+)?const\s+([A-Z][A-Za-z0-9]*Icon)\s*(?::[^=]+)?=\s*\(([^)]*)\)\s*=>\s*(\{[\s\S]*?\}|[^\n;]+);?/g
  out = out.replace(arrowRe, (full, lead, indent, exp, name, args, body) => {
    const rendered = extractReturned(body)
    if (rendered === null || !EMPTY_RENDER.test(rendered.trim())) return full
    return rewriteIcon(full, lead, indent, !!exp, name, args, out)
  })

  // Function declarations:  function XIcon(args) { return <empty> }
  const fnRe =
    /(^|\n)([ \t]*)(export\s+)?(?:default\s+)?function\s+([A-Z][A-Za-z0-9]*Icon)\s*\(([^)]*)\)\s*(\{[\s\S]*?\})/g
  out = out.replace(fnRe, (full, lead, indent, exp, name, args, body) => {
    const rendered = extractReturned(body)
    if (rendered === null || !EMPTY_RENDER.test(rendered.trim())) return full
    return rewriteIcon(full, lead, indent, !!exp, name, args, out)
  })

  return out
}

// Pull the returned JSX/value from a body (block `{ return X }` or a concise expr).
function extractReturned(body: string): string | null {
  const t = body.trim()
  if (t.startsWith('{')) {
    const m = t.match(/return\s*\(?\s*([\s\S]*?)\)?\s*;?\s*\}$/)
    return m ? m[1].trim() : null
  }
  // concise arrow body — may be wrapped in parens
  return t.replace(/^\(|\)$/g, '').trim()
}

function rewriteIcon(
  full: string,
  lead: string,
  indent: string,
  exported: boolean,
  name: string,
  args: string,
  fileContent: string
): string {
  // SAFETY: never rewrite in a way that could DROP a default export or strand a
  // re-exported binding — that would trade an empty (cosmetic) icon for a real build
  // error, violating "never introduce a new error".
  //   • Default export (either `export default function XIcon` here, or a separate
  //     `export default XIcon`) → leave the whole definition untouched. An empty
  //     default-exported icon is only cosmetic; changing its form risks breaking the
  //     default import elsewhere. Do nothing = provably safe.
  const isDefault =
    /\bexport\s+default\b/.test(full) ||
    new RegExp(`export\\s+default\\s+${name}\\b`).test(fileContent)
  if (isDefault) return full
  //   • Re-exported via a separate `export { XIcon }` statement → we must KEEP the
  //     local binding (removing it would break that export). Handle like `exported`.
  const reExported = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(fileContent)

  const base = name.replace(/Icon$/, '')
  const target = resolveLucide(base)
  // Exported / re-exported / unresolvable → keep the binding (and its export/usage
  // contract) but make it paint a safe non-empty element. This preserves the NAMED
  // export exactly (an `export function` becomes an `export const` of the same name —
  // still a named export) and never touches a default export. No import introduced.
  if (exported || reExported || !target) {
    const argPart = args.trim() ? `(${args})` : '()'
    return `${lead}${indent}${exported ? 'export ' : ''}const ${name} = ${argPart} => (${SAFE_INLINE});`
  }
  // Purely LOCAL + resolvable → replace the empty def with a validated lucide import
  // alias. `target` is PROVEN present in the installed lucide-react (curated ∩ installed),
  // so the emitted `import { <target> as <name> } from 'lucide-react'` can never 404.
  // The def line is removed here; the import is hoisted to the head in applyIconFix.
  pendingImports.push(`import { ${target} as ${name} } from 'lucide-react'`)
  return `${lead}` // remove the definition entirely; import hoisted post-pass
}

// Side channel for imports discovered mid-replace (hoisted after the pass).
let pendingImports: string[] = []

// Public per-file entry that also hoists any lucide imports the fix introduced.
export function applyIconFix(content: string): string {
  pendingImports = []
  let out = fixEmptyIcons(content)
  if (pendingImports.length > 0) {
    const uniq = [...new Set(pendingImports)]
    for (const imp of uniq) out = prependImport(out, imp)
    pendingImports = []
  }
  return out
}

// ── 2. CSS closure (cross-file, run once) ─────────────────────────────────────
// Collect classNames used in JSX, subtract ones already defined (Tailwind ∪ generated
// CSS), then for each remaining custom class either SYNTHESIZE a correct definition
// (recognized decorative patterns) or APPEND a harmless no-op. Returns CSS to append
// to index.css plus the list of unrecognized classes (for the catalog). NEVER strips.

// Extract class tokens from className="..." / className={'...'} / cn('...', ...) and
// template literals — ignoring any ${...} interpolated segments.
export function collectClassNames(content: string): Set<string> {
  const out = new Set<string>()
  const add = (raw: string) => {
    for (const tok of raw.split(/\s+/)) {
      const t = tok.trim()
      if (!t || t.includes('${') || t.includes('{')) continue
      // strip variant prefixes (md:, hover:, dark:, group-hover:) and !important
      const base = t.replace(/^!/, '').split(':').pop() || ''
      if (base) out.add(base)
    }
  }
  // className="..." and className='...'
  for (const m of content.matchAll(/className\s*=\s*["']([^"']+)["']/g)) add(m[1])
  // any single/double/backtick string literal inside a className={...} or cn(...) call
  for (const m of content.matchAll(/className\s*=\s*\{([\s\S]*?)\}/g)) {
    for (const s of m[1].matchAll(/["'`]([^"'`]+)["'`]/g)) add(s[1])
  }
  for (const m of content.matchAll(/\bcn\(([\s\S]*?)\)/g)) {
    for (const s of m[1].matchAll(/["'`]([^"'`]+)["'`]/g)) add(s[1])
  }
  return out
}

// A permissive Tailwind recognizer. False negatives are HARMLESS here (an unrecognized
// Tailwind class only earns an empty no-op rule, which changes nothing), so we bias to
// simple + safe rather than exhaustive.
const TW_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'from', 'to', 'via', 'fill', 'stroke', 'outline',
  'divide', 'shadow', 'opacity', 'w', 'h', 'min', 'max', 'size', 'p', 'px', 'py', 'pt',
  'pb', 'pl', 'pr', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'gap', 'space', 'grid',
  'col', 'row', 'flex', 'basis', 'order', 'place', 'items', 'justify', 'content', 'self',
  'rounded', 'z', 'top', 'bottom', 'left', 'right', 'inset', 'translate', 'rotate',
  'scale', 'skew', 'origin', 'transition', 'duration', 'delay', 'ease', 'animate',
  'font', 'leading', 'tracking', 'line', 'list', 'decoration', 'underline', 'indent',
  'align', 'whitespace', 'break', 'overflow', 'object', 'aspect', 'cursor', 'select',
  'pointer', 'resize', 'backdrop', 'blur', 'brightness', 'contrast', 'saturate',
  'grayscale', 'invert', 'sepia', 'drop', 'mix', 'columns', 'table', 'caption', 'accent',
  'caret', 'scroll', 'snap', 'touch', 'will', 'container', 'sr', 'not', 'antialiased',
  'subpixel', 'uppercase', 'lowercase', 'capitalize', 'normal', 'italic', 'truncate',
]
const TW_STATIC = new Set([
  'flex', 'grid', 'block', 'inline', 'inline-block', 'inline-flex', 'hidden', 'table',
  'contents', 'flow-root', 'container', 'relative', 'absolute', 'fixed', 'sticky',
  'static', 'italic', 'uppercase', 'lowercase', 'capitalize', 'underline', 'truncate',
  'antialiased', 'rounded', 'border', 'shadow', 'transition', 'transform', 'sr-only',
  'group', 'peer', 'isolate', 'overflow-hidden', 'overflow-auto', 'grow', 'shrink',
])
function isTailwindClass(cls: string): boolean {
  if (TW_STATIC.has(cls)) return true
  const seg = cls.replace(/^-/, '').split('-')[0]
  if (TW_PREFIXES.includes(seg)) return true
  // arbitrary value classes like bg-[#fff] / w-[42px] — always Tailwind
  if (/\[[^\]]+\]/.test(cls)) return true
  return false
}

// Pull selector class names already defined in a CSS file (`.foo`, `.foo-bar`).
export function definedCssClasses(css: string): Set<string> {
  const out = new Set<string>()
  for (const m of css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) out.add(m[1])
  return out
}

type Synth = { css: string; keyframes?: string }

// Recognized decorative patterns → a formulaic, token-driven definition. Uses the
// project's OWN locked CSS variables (--primary/--accent/--foreground/--border), so the
// synthesized decoration is automatically on-brand and never a guessed color.
function synthesizeClass(cls: string): Synth | null {
  // {color}-gradient-text  |  gradient-text
  if (cls === 'gradient-text' || /-gradient-text$/.test(cls)) {
    return {
      css:
        `.${cssEsc(cls)} { background-image: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent, var(--primary)))); ` +
        `-webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }`,
    }
  }
  // glass | glass-strong | glass-{x}
  if (cls === 'glass' || /^glass(-|$)/.test(cls)) {
    const strong = /strong/.test(cls)
    return {
      css:
        `.${cssEsc(cls)} { background-color: hsl(var(--background) / ${strong ? '0.8' : '0.55'}); ` +
        `backdrop-filter: blur(${strong ? '16px' : '10px'}); -webkit-backdrop-filter: blur(${strong ? '16px' : '10px'}); ` +
        `border: 1px solid hsl(var(--border) / 0.4); }`,
    }
  }
  // {x}-glow | glow
  if (cls === 'glow' || /-glow$/.test(cls)) {
    return { css: `.${cssEsc(cls)} { box-shadow: 0 0 28px -4px hsl(var(--primary) / 0.5); }` }
  }
  // text-shimmer | shimmer
  if (cls === 'text-shimmer' || cls === 'shimmer') {
    return {
      css:
        `.${cssEsc(cls)} { background: linear-gradient(90deg, hsl(var(--foreground)), hsl(var(--primary)), hsl(var(--foreground))); ` +
        `background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: cm-shimmer 3s linear infinite; }`,
      keyframes: '@keyframes cm-shimmer { to { background-position: 200% center; } }',
    }
  }
  // *-scrim | *-overlay — a gentle bottom-up gradient overlay (its intended purpose).
  if (/-scrim$/.test(cls) || /-overlay$/.test(cls)) {
    return {
      css:
        `.${cssEsc(cls)} { position: absolute; inset: 0; pointer-events: none; ` +
        `background: linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0) 60%); }`,
    }
  }
  // animate-float | animate-marquee | animate-pulse-slow
  if (cls === 'animate-float') {
    return {
      css: `.animate-float { animation: cm-float 6s ease-in-out infinite; }`,
      keyframes: '@keyframes cm-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }',
    }
  }
  if (cls === 'animate-marquee') {
    return {
      css: `.animate-marquee { animation: cm-marquee 30s linear infinite; }`,
      keyframes: '@keyframes cm-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }',
    }
  }
  if (cls === 'animate-pulse-slow') {
    return {
      css: `.animate-pulse-slow { animation: cm-pulse-slow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite; }`,
      keyframes: '@keyframes cm-pulse-slow { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }',
    }
  }
  return null
}

function cssEsc(cls: string): string {
  // Escape CSS-significant chars in a class selector (defensive; class tokens here are
  // already simple identifiers).
  return cls.replace(/[^A-Za-z0-9_-]/g, (c) => '\\' + c)
}

export interface CssClosureResult {
  append: string // CSS to append to index.css ('' if nothing to add)
  synthesized: string[] // classes we defined properly
  noop: string[] // classes we no-op'd (the catalog "unrecognized" list)
}

// Compute the CSS to append so every JSX class resolves. `knownCss` is the combined
// text of every CSS file already present (index.css + any persistent utility file), so
// classes those define are treated as known and skipped.
// Color-family words models hallucinate as Tailwind classes (bg-cream, text-warm-900,
// border-sand) that don't exist in the theme — Tailwind's JIT emits NOTHING for them, so the
// element renders unstyled (the recurring A3 "undefined class" look). We map each to the
// project's OWN semantic token so it renders on-brand instead of blank. CURATED to contain no
// real Tailwind color, so genuine utilities (text-sm, bg-cover, border-2, bg-red-500) are never
// touched — a false map here would be worse than the miss.
const INVENTED_COLOR_WORDS = new Set([
  'cream', 'ivory', 'sand', 'beige', 'taupe', 'warm', 'cool', 'charcoal', 'ink', 'paper',
  'bone', 'linen', 'pearl', 'snow', 'midnight', 'forest', 'sage', 'terracotta', 'rust',
  'mustard', 'olive', 'clay', 'coffee', 'mocha', 'latte', 'espresso', 'wine', 'burgundy',
  'navy', 'coral', 'peach', 'blush', 'lavender', 'mint', 'seafoam', 'ocean', 'sunset', 'dusk',
  'dawn', 'ash', 'graphite', 'onyx', 'ebony', 'jet', 'smoke', 'fog', 'mist', 'cloud', 'chalk',
  'vanilla', 'honey', 'gold', 'bronze', 'copper', 'brass', 'sienna', 'umber', 'ochre',
  'saffron', 'aqua',
])
const DARK_COLOR_WORDS = new Set([
  'charcoal', 'ink', 'midnight', 'ebony', 'jet', 'onyx', 'graphite', 'navy', 'espresso',
  'wine', 'burgundy', 'forest', 'olive', 'coffee',
])

function synthesizeInventedColor(cls: string): Synth | null {
  const m = cls.match(/^(bg|text|border|ring|from|to|via|fill|stroke|decoration|caret|accent|placeholder|outline|divide)-(.+)$/)
  if (!m) return null
  const prefix = m[1]
  const rest = m[2]
  if (rest.includes('[')) return null // arbitrary value bg-[#fff] — real
  const word = rest.split('/')[0].split('-')[0] // 'warm' from 'warm-900'; drop opacity suffix
  if (!INVENTED_COLOR_WORDS.has(word)) return null
  const esc = cssEsc(cls)
  if (prefix === 'text' || prefix === 'decoration' || prefix === 'caret' || prefix === 'accent' || prefix === 'placeholder') {
    return { css: `.${esc} { color: hsl(var(--foreground)); }` }
  }
  if (prefix === 'border' || prefix === 'ring' || prefix === 'outline' || prefix === 'divide') {
    return { css: `.${esc} { border-color: hsl(var(--border)); }` }
  }
  if (prefix === 'fill') return { css: `.${esc} { fill: hsl(var(--foreground)); }` }
  if (prefix === 'stroke') return { css: `.${esc} { stroke: hsl(var(--border)); }` }
  // bg / from / to / via → a surface. Dark words map to a deeper token so overlaid text stays readable.
  const isDark = DARK_COLOR_WORDS.has(word) || /-(7|8|9)\d\d$/.test(rest)
  const token = isDark ? '--secondary' : '--card'
  return { css: `.${esc} { background-color: hsl(var(${token})); }` }
}

export function computeCssClosure(
  files: { path: string; content: string }[],
  knownCss: string
): CssClosureResult {
  const used = new Set<string>()
  for (const f of files) {
    if (!/\.(tsx|jsx|ts|js|html)$/.test(f.path)) continue
    for (const c of collectClassNames(f.content)) used.add(c)
  }
  const defined = definedCssClasses(knownCss)
  const synthBlocks: string[] = []
  const keyframes = new Set<string>()
  const noopClasses: string[] = []
  const synthesized: string[] = []
  const seen = new Set<string>()

  for (const cls of used) {
    if (!cls || seen.has(cls)) continue
    seen.add(cls)
    if (isTailwindClass(cls)) {
      // Even a "valid-looking" Tailwind class may be an invented color (bg-cream) that the
      // JIT drops — map those to a token so they render instead of vanishing. Real utilities
      // return null here and are correctly skipped.
      const invented = synthesizeInventedColor(cls)
      if (invented) { synthBlocks.push(invented.css); synthesized.push(cls) }
      continue
    }
    if (defined.has(cls)) continue
    // Custom class with no definition anywhere.
    const synth = synthesizeClass(cls)
    if (synth) {
      synthBlocks.push(synth.css)
      if (synth.keyframes) keyframes.add(synth.keyframes)
      synthesized.push(cls)
    } else {
      noopClasses.push(cls)
    }
  }

  const parts: string[] = []
  if (synthBlocks.length || noopClasses.length) {
    parts.push('\n/* ── Codemine CSS closure (auto — every JSX class resolves) ── */')
    for (const kf of keyframes) parts.push(kf)
    for (const b of synthBlocks) parts.push(b)
    if (noopClasses.length) {
      // Harmless no-op definitions for unrecognized custom classes: guarantees the
      // selector exists (no "undefined class" surprise) while changing NOTHING visually.
      parts.push('/* unrecognized custom classes — no-op so nothing is ever undefined */')
      for (const c of noopClasses) parts.push(`.${cssEsc(c)} {}`)
    }
  }

  return {
    append: parts.length ? parts.join('\n') + '\n' : '',
    synthesized,
    noop: noopClasses,
  }
}

// ── 3. Empty-render heuristics (per-file, run once over the set) ──────────────
// Strictness scales with how load-bearing the file is (page > section > leaf). BLOCKERS
// mean "this file renders nothing meaningful" → regenerate it. ADVISORIES are softer
// smells → only escalated to a regen on page files.

function fileKind(path: string): 'page' | 'section' | 'leaf' {
  if (/\/(pages?|routes?|views?|screens?)\//i.test(path) || /(^|\/)(App|Home|Index|Landing)\.(tsx|jsx)$/.test(path)) return 'page'
  if (/\/(sections?|layouts?)\//i.test(path)) return 'section'
  return 'leaf'
}

// Strip strings/comments cheaply so text-floor + marker checks don't count code.
function stripCode(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

export interface EmptyRenderFinding {
  path: string
  reasons: string[]
  blocker: boolean
}

export function detectEmptyRender(path: string, content: string): EmptyRenderFinding | null {
  if (!/\.(tsx|jsx)$/.test(path)) return null
  const kind = fileKind(path)
  const reasons: string[] = []
  const advisories: string[] = []

  // The primary component renders nothing meaningful: it returns null / an empty
  // fragment AND never returns real JSX anywhere. High-confidence, low false-positive
  // (a real page always has at least one `return <div…`). A conditional early
  // `return null` alongside a real JSX return does NOT trip this.
  const hasEmptyReturn = /return\s*(?:null|undefined|<>\s*<\/>|<\s*\/>)\s*;?/.test(content)
  const hasRealJsxReturn = /return\s*\(?\s*<[A-Za-z]/.test(content)
  if (hasEmptyReturn && !hasRealJsxReturn) {
    reasons.push('The component returns null/empty fragment and never renders real JSX — it paints nothing.')
  }

  // Page text floor: a page with almost no static text and no data source is a blank page.
  if (kind === 'page') {
    const stripped = stripCode(content)
    // count characters of JSX text nodes (between > and <) that are real words
    const textChars = [...stripped.matchAll(/>([^<>{}]+)</g)]
      .map((m) => m[1].replace(/\s+/g, ' ').trim())
      .filter((s) => /[A-Za-z]{2,}/.test(s))
      .join(' ').length
    const hasData = /\b(useState|useQuery|useLoaderData|fetch|axios|\.map\(|import\s+\w+\s+from\s+['"].*data)/.test(content)
    if (textChars < 40 && !hasData) {
      reasons.push(`This page has almost no static text (${textChars} chars) and no data source — it will look blank.`)
    }
  }

  // Advisory smells (escalated to a regen only on page files).
  if (/DATA\s*=\s*\[\s*\]/.test(content) && /DATA\.map\(/.test(content)) {
    advisories.push('A component maps over a DATA array that is defined empty in the same file — nothing renders from it.')
  }
  if (/coming soon|todo|lorem ipsum|placeholder/i.test(stripCode(content))) {
    advisories.push('Placeholder / "coming soon" / lorem markers present.')
  }

  const escalate = kind === 'page' ? advisories : []
  const allReasons = [...reasons, ...escalate]
  if (allReasons.length === 0) return null
  return {
    path,
    reasons: allReasons,
    // Only true blockers force a regen on non-page files; on pages, escalated advisories
    // count too. A leaf with only advisories returns null above (escalate is empty).
    blocker: reasons.length > 0 || escalate.length > 0,
  }
}

// Whether the icon-validation set was backed by a real read of installed lucide (for
// diagnostics/logging only — the fix is safe either way).
export function iconSetLoadedFromDisk(): boolean {
  getValidIcons()
  return _validIconsLoaded
}
