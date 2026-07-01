// Deterministic design-token lock. The brief picks a unique 6-colour palette per
// project; this writes that EXACT palette into index.css :root as the shadcn HSL
// variables — so every project's colours are (a) consistent within itself and
// (b) unique across projects, regardless of whether the AI remembered the tokens.
// This is the consistency engine: the AI composes token-driven components, the
// tokens are locked here, so output is professional + on-brand, never generic.

import type { ColorTokens } from '@/ai/types/project-brief'

// "#0D0A06" / "0d0a06" → "H S% L%" (the shadcn var format used by hsl(var(--x))).
export function hexToHslTriplet(hex: string): string | null {
  const m = String(hex).trim().replace(/^#/, '')
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

// Relative luminance → pick black or white foreground for guaranteed contrast.
function readableOn(hex: string): string {
  const m = String(hex).trim().replace(/^#/, '')
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return '0 0% 100%'
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.45 ? '0 0% 9%' : '0 0% 98%'
}

// Build the authoritative :root block from the brief's locked palette. Maps the 6
// brand roles onto the full shadcn variable set the baked components expect, deriving
// the *-foreground pairs for guaranteed contrast. Returns null if the palette is
// unparseable (caller then leaves the AI's CSS untouched).
export function buildBrandRootCss(tokens: ColorTokens): string | null {
  const bg = hexToHslTriplet(tokens.background)
  const surface = hexToHslTriplet(tokens.surface)
  const fg = hexToHslTriplet(tokens.foreground)
  const muted = hexToHslTriplet(tokens.mutedForeground)
  const primary = hexToHslTriplet(tokens.primary)
  const accent = hexToHslTriplet(tokens.accent)
  if (!bg || !surface || !fg || !muted || !primary || !accent) return null

  const vars: Record<string, string> = {
    background: bg,
    foreground: fg,
    card: surface,
    'card-foreground': fg,
    popover: surface,
    'popover-foreground': fg,
    primary,
    'primary-foreground': readableOn(tokens.primary),
    secondary: surface,
    'secondary-foreground': fg,
    muted: surface,
    'muted-foreground': muted,
    accent,
    'accent-foreground': readableOn(tokens.accent),
    destructive: '0 72% 51%',
    'destructive-foreground': '0 0% 98%',
    border: surface,
    input: surface,
    ring: primary,
  }
  const body = Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`).join('\n')
  return `:root {\n${body}\n  --radius: 0.625rem;\n}`
}

// Lock the palette into an existing index.css: replace the :root block (or prepend
// one if absent) with the brand block, and ensure the base body/border bindings
// exist. Idempotent and safe — only touches :root + the two base rules.
export function lockPaletteInCss(css: string, tokens: ColorTokens): string | null {
  const root = buildBrandRootCss(tokens)
  if (!root) return null
  let out = css
  if (/:root\s*\{[\s\S]*?\}/.test(out)) {
    out = out.replace(/:root\s*\{[\s\S]*?\}/, root)
  } else {
    out = `${root}\n${out}`
  }
  if (!/border-color:\s*hsl\(var\(--border\)\)/.test(out)) {
    out += `\n* { border-color: hsl(var(--border)); }\nbody { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }\n`
  }
  return out
}
