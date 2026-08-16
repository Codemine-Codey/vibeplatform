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
    // .map(cb => <Tag ...>) whose opening tag has NO key= (the "Each child in a list should have a
    // unique key" warning). Matches an arrow map with an EXPRESSION body returning a JSX element
    // whose opening tag (up to the first >) contains no key=. Keyed maps and block-body maps
    // ({ return <..> }) are NOT flagged → near-zero false positives.
    test: /\.map\(\s*(?:async\s*)?\(?[^)]*\)?\s*=>\s*\(?\s*<[A-Za-z][\w.]*(?:(?!key=)[^>])*\/?>/,
    issue:
      'A mapped list renders elements WITHOUT a `key` prop (React warns "Each child in a list should have a unique key"). Add a stable unique `key` to the top-level element returned by .map() — key={item.id} or another stable unique value. Never key by array index.',
  },
  {
    // BLOCK-BODY map: .map(item => { ...; return <Tag ...> }) whose returned opening tag has NO key=.
    // The expression-body rule above only catches `=> <Tag>`; a block body (`=> { return <Tag> }`) slips
    // past it — that's the ContactDetail miss. Same near-zero-false-positive guard: a key= before the
    // first `>` (keyed element) breaks the match, so keyed maps are NOT flagged.
    test: /\.map\(\s*(?:async\s*)?\(?[^)]*\)?\s*=>\s*\{[\s\S]{0,800}?return\s*\(?\s*<[A-Za-z][\w.]*(?:(?!key=)[^>])*\/?>/,
    issue:
      'A mapped list (block-body .map with a return) renders elements WITHOUT a `key` prop (React warns "Each child in a list should have a unique key"). Add a stable unique `key` to the top-level element returned inside the .map() callback — key={item.id} or another stable unique value. Never key by array index.',
  },
  {
    // <AnimatePresence> ... <motion.* > with NO key= on the direct child (best-effort).
    test: /<AnimatePresence[^>]*>\s*\{[^}]*&&\s*<motion\.[a-z]+(?:(?!key=)[^>])*\/?>(?![\s\S]{0,40}key=)/,
    issue:
      'An <AnimatePresence> child has no `key`. Exit animations only fire when each direct child has a unique stable key (and is a DIRECT child, no wrapper between). Add key="..." (or key={item.id} for lists).',
  },
  {
    // <AnimatePresence> wrapping <Routes> or <Outlet> — route/outlet aren't motion elements,
    // so exit animations throw a runtime error and crash the layout. Very high confidence.
    test: /<AnimatePresence[\s\S]{0,120}?<(Routes|Outlet)\b/,
    issue:
      'This wraps <Routes>/<Outlet> in <AnimatePresence> for page transitions — that throws a runtime error and crashes the layout (Routes/Outlet are not motion elements). Remove the <AnimatePresence> wrapper here and instead animate ENTRANCE inside each page component with <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>. Keep all routing exactly as-is.',
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
