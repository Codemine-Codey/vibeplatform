// Deterministic WCAG contrast guard for the brief's color tokens.
//
// The model sometimes produces a palette where the text color sits too close to
// the background → headlines/body become invisible (the exact bug the user hit).
// This guarantees readable text by MATH, not by hoping the model behaves: any
// foreground/muted token that fails WCAG AA against the background is nudged
// toward black or white until it passes. The brand hue is preserved as much as
// possible — we only adjust lightness.

export interface ColorTokens {
  background: string
  surface: string
  foreground: string
  mutedForeground: string
  primary: string
  accent: string
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

// Relative luminance per WCAG.
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return 21 // can't parse → assume fine, don't break anything
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// Mix a color toward black or white by t (0..1).
function mixToward(rgb: [number, number, number], toWhite: boolean, t: number): [number, number, number] {
  const target = toWhite ? 255 : 0
  return [
    rgb[0] + (target - rgb[0]) * t,
    rgb[1] + (target - rgb[1]) * t,
    rgb[2] + (target - rgb[2]) * t,
  ]
}

// Ensure `fg` meets `minRatio` against `bg`; if not, push it toward whichever of
// black/white the background is farther from, preserving hue as long as possible.
function ensureContrast(fg: string, bg: string, minRatio: number): string {
  if (contrastRatio(fg, bg) >= minRatio) return fg
  const fgRgb = hexToRgb(fg)
  const bgRgb = hexToRgb(bg)
  if (!fgRgb || !bgRgb) return fg
  const bgLum = luminance(bgRgb)
  const toWhite = bgLum < 0.5 // dark bg → lighten text; light bg → darken text
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const candidate = mixToward(fgRgb, toWhite, t)
    const hex = rgbToHex(...candidate)
    if (contrastRatio(hex, bg) >= minRatio) return hex
  }
  // Fully mixed and still short (impossible for AA) → hard fallback to pure.
  return toWhite ? '#FFFFFF' : '#000000'
}

// Guard the whole token set. Returns the corrected tokens + which were changed.
export function guardColorTokens(tokens: ColorTokens): { tokens: ColorTokens; changed: string[] } {
  const changed: string[] = []
  const out = { ...tokens }

  // Body/heading text must clear AA (4.5:1) on the background.
  const fg = ensureContrast(tokens.foreground, tokens.background, 4.5)
  if (fg !== tokens.foreground) { out.foreground = fg; changed.push('foreground') }

  // Secondary text — AA large/UI threshold (3:1) is acceptable for muted copy.
  const muted = ensureContrast(tokens.mutedForeground, tokens.background, 3)
  if (muted !== tokens.mutedForeground) { out.mutedForeground = muted; changed.push('mutedForeground') }

  // Primary is often used as a button background OR as accent text — make sure it
  // is distinguishable from the page background (3:1) so CTAs never disappear.
  if (contrastRatio(tokens.primary, tokens.background) < 1.6) {
    const p = ensureContrast(tokens.primary, tokens.background, 2.2)
    if (p !== tokens.primary) { out.primary = p; changed.push('primary') }
  }

  return { tokens: out, changed }
}
