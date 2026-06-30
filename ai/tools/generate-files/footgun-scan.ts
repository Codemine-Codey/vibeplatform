// ── Deterministic footgun scanner ────────────────────────────────────────────
// Catches the RUNTIME bug classes that compile cleanly (so neither `vite build` nor
// `tsc` sees them) but break or hang the app at runtime. These are the bugs that read
// as "amateur" — a Zustand selector that loops, a purged Tailwind class, an index key.
// Returns the violations so the pipeline can repair them BEFORE the user sees a preview.
// High-confidence patterns only — designed for near-zero false positives.

export type Footgun = { path: string; issue: string }

const RULES: { test: RegExp; issue: string }[] = [
  {
    // useXStore(s => ({...})) | useXStore(s => s.method()) | useXStore(s => [ ... ])
    test: /use[A-Z]\w*Store\(\s*\(?\s*\w+\s*\)?\s*=>\s*\(?\s*[[{]/,
    issue:
      'Zustand selector returns a NEW object/array literal (s => ({...}) / s => [ ... ]) — a new reference every render triggers a useSyncExternalStore infinite loop ("maximum update depth"). Select primitives individually (s => s.x), derive objects with useMemo, or use `useShallow` from "zustand/react/shallow".',
  },
  {
    test: /use[A-Z]\w*Store\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\.\w+\(/,
    issue:
      'Zustand selector CALLS a method (s => s.getStats()) that builds a fresh object each render → useSyncExternalStore infinite loop. Compute the value with useMemo outside the selector, or select the primitive inputs and derive locally.',
  },
  {
    // `bg-${x}-500`, `text-${size}`, etc. — interpolated Tailwind class is purged.
    test: /['"`][^'"`]*\b(?:bg|text|border|ring|from|to|via|fill|stroke|w|h|p|px|py|m|mx|my|gap|grid-cols|col-span|rounded)-\$\{/,
    issue:
      'A Tailwind class is built by string interpolation (e.g. `bg-${x}-500`). Tailwind purges any class it cannot see as a complete literal, so this renders UNSTYLED. Map each value to a full static class string ({ ok: "bg-emerald-500", warn: "bg-amber-500" }[x]) or use an inline style / CSS variable for truly dynamic colors.',
  },
  {
    // .map((item, index) => ... key={index} ...) — breaks on reorder/drag/delete.
    test: /\.map\(\s*\(?[^)]*\b(?:index|idx|i)\b[^)]*\)?\s*=>[\s\S]{0,500}?key=\{\s*(?:index|idx|i)\s*\}/,
    issue:
      'A mapped list uses key={index}. Index keys corrupt state, inputs, and animations the moment items reorder, drag, sort, or get deleted. Key by a stable unique id instead (key={item.id}).',
  },
  {
    // <AnimatePresence> ... <motion.* > with NO key= on the direct child (best-effort).
    test: /<AnimatePresence[^>]*>\s*\{[^}]*&&\s*<motion\.[a-z]+(?:(?!key=)[^>])*\/?>(?![\s\S]{0,40}key=)/,
    issue:
      'An <AnimatePresence> child has no `key`. Exit animations only fire when each direct child has a unique stable key (and is a DIRECT child, no wrapper between). Add key="..." (or key={item.id} for lists).',
  },
]

export function scanFootguns(files: { path: string; content: string }[]): Footgun[] {
  const out: Footgun[] = []
  for (const f of files) {
    if (!/\.(tsx|jsx|ts|js)$/.test(f.path)) continue
    for (const rule of RULES) {
      if (rule.test.test(f.content)) out.push({ path: f.path, issue: rule.issue })
    }
  }
  return out
}
