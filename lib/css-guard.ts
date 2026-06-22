import postcss from 'postcss'

// ── CSS guard: invalid CSS can NEVER reach the sandbox ───────────────────────
// A single CSS syntax error (unclosed gradient paren, @apply with unknown class,
// bare Tailwind class as a declaration) crashes PostCSS in the sandbox → Vite
// returns 500 for EVERY request → blank preview. Regex sanitizers kept missing
// edge cases, so we validate with the real parser: the exact same PostCSS engine
// that would crash in the sandbox. If it parses here, it parses there.
//
// Repair strategy: strip the known-bad patterns first, then parse; while the
// parser reports a syntax error, drop the offending line and re-parse (≤25
// rounds). A missing declaration is invisible; a syntax error blanks the page.
const MINIMAL_FALLBACK =
  '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'

export function ensureValidCss(css: string): string {
  // Pass 0: drop declarations whose value is an EMPTY function — e.g.
  // `background-image: repeating-linear-gradient();` or `background: linear-gradient( );`.
  // These are syntactically valid (so the parser keeps them) but render nothing /
  // broken, which makes the AI re-edit the file forever (the divider-lattice loop).
  // Dropping the whole declaration leaves a clean page and breaks that cycle.
  let out = css.replace(
    /[^;{}\n]*:\s*[^;{}\n]*(?:linear|radial|conic|repeating-linear|repeating-radial)-gradient\(\s*\)[^;{}\n]*;?/gi,
    ''
  )

  // Pass 1: strip @apply anywhere (unknown classes crash Tailwind even when parseable)
  out = out.replace(/@apply\s+[^;{}\n]*;?/gi, '')

  // Pass 2: drop bare Tailwind class names used as declarations (`tracking-wide;`)
  out = out
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (!t) return true
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('@')) return true
      if (t.includes('{') || t.includes('}')) return true
      if (t.endsWith(';') && !t.includes(':')) return false
      return true
    })
    .join('\n')

  // Pass 3: the real parser. On each failure, first try to REPAIR the reported
  // line (the most common break is a missing ")" in a gradient/hsl value — a
  // dropped declaration leaves an empty rule and a visually broken layout, so
  // closing the paren preserves the design). Only drop the line if repair fails.
  let lastFailedLine = -1
  for (let i = 0; i < 25; i++) {
    try {
      postcss.parse(out)
      return out
    } catch (err) {
      const line = (err as { line?: number }).line
      if (typeof line !== 'number' || line < 1) break
      const lines = out.split('\n')
      if (line > lines.length) break
      const bad = lines[line - 1]
      const open = (bad.match(/\(/g) || []).length
      const close = (bad.match(/\)/g) || []).length
      if (open > close && line !== lastFailedLine) {
        // Append the missing close-parens before the trailing semicolon (or at end)
        const missing = ')'.repeat(open - close)
        lines[line - 1] = /;\s*$/.test(bad)
          ? bad.replace(/;\s*$/, `${missing};`)
          : bad + missing + (bad.includes(':') ? ';' : '')
        lastFailedLine = line // if the same line fails again, drop it next round
      } else {
        lines.splice(line - 1, 1)
        lastFailedLine = -1
      }
      out = lines.join('\n')
    }
  }

  // Pass 4: still unparseable — try once more after also dropping any line with
  // unbalanced parens (the most common unlocatable breakage).
  out = out
    .split('\n')
    .filter(line => {
      const o = (line.match(/\(/g) || []).length
      const c = (line.match(/\)/g) || []).length
      return o === c
    })
    .join('\n')
  try {
    postcss.parse(out)
    return out
  } catch {
    // Unsalvageable — a plain working stylesheet always beats a blank preview.
    // (The server CSS sanity check re-appends :root variables if missing.)
    return MINIMAL_FALLBACK
  }
}
