// ── Deterministic import gate ────────────────────────────────────────────────
// Hard-locks generated code to the verified stack. Two layers, both model-
// independent:
//   1. SUBSTITUTIONS — rewrite a known-wrong specifier to the verified one
//      (only API-compatible swaps, so the code keeps working).
//   2. PACKAGE PRE-DECLARE — for a curated allow-list of real, React-18-safe
//      packages the model legitimately uses, ensure the package is in
//      package.json BEFORE install, so it's resolved up-front instead of via a
//      runtime miss + dev-server restart. Anything outside the allow-list is left
//      to the runtime installMissingModules catch-all (which pnpm-resolves it).
// Net: a wrong specifier can't ship, and a common real dependency never triggers
// the slow repair loop.

// Specifier rewrites — ONLY where the target's API is a drop-in for the source,
// so rewriting never breaks the code. (Icon/UI libs are NOT swapped here — their
// component names differ; those real packages are installed via the allow-list.)
const SUBSTITUTIONS: Array<[RegExp, string]> = [
  // The framer-motion rebrand. `motion` / `motion/react` expose the same API.
  [/(from\s*['"])motion\/react(['"])/g, '$1framer-motion$2'],
  [/(from\s*['"])motion(['"])/g, '$1framer-motion$2'],
  [/(import\s*\(\s*['"])motion\/react(['"]\s*\))/g, '$1framer-motion$2'],
  // Deep icon imports → the package root (lucide re-exports everything from root).
  [/(from\s*['"])lucide-react\/(?:dist\/)?(?:esm\/)?icons\/[^'"]+(['"])/g, '$1lucide-react$2'],
]

export function applySubstitutions(content: string): string {
  let out = content
  for (const [re, good] of SUBSTITUTIONS) out = out.replace(re, good)
  return out
}

// Curated allow-list: real, popular, React-18-compatible packages with safe caret
// versions. Auto-adding any of these to package.json can NEVER add a non-existent
// package or an incompatible major — that's the whole point of curating it.
export const KNOWN_PACKAGES: Record<string, string> = {
  // In the website/app scaffold by default, but NOT in the game package.json — so if a
  // game imports them (e.g. a menu animation or routing) the pre-declare adds them
  // instead of erroring.
  'framer-motion': '^11.18.2',
  'react-router-dom': '^6.28.0',
  'react-icons': '^5.4.0',
  '@phosphor-icons/react': '^2.1.7',
  'react-intersection-observer': '^9.13.1',
  'react-hot-toast': '^2.4.1',
  'react-toastify': '^10.0.6',
  swiper: '^11.1.15',
  'keen-slider': '^6.8.6',
  'react-fast-marquee': '^1.6.5',
  recharts: '^2.13.3',
  'chart.js': '^4.4.7',
  'react-chartjs-2': '^5.2.0',
  axios: '^1.7.9',
  dayjs: '^1.11.13',
  'lodash-es': '^4.17.21',
  nanoid: '^5.0.9',
  uuid: '^11.0.3',
  jotai: '^2.10.3',
  zustand: '^5.0.2',
  immer: '^10.1.1',
  '@tanstack/react-table': '^8.20.5',
  swr: '^2.2.5',
  'react-markdown': '^9.0.1',
  'react-countup': '^6.5.3',
  'react-confetti': '^6.1.0',
  'embla-carousel-autoplay': '^8.5.1',
  '@use-gesture/react': '^10.3.1',
  '@react-spring/web': '^9.7.5',
  gsap: '^3.12.5',
  'qrcode.react': '^4.2.0',
  'react-use': '^17.6.0',
  clsx: '^2.1.1',
  'tailwind-merge': '^2.6.0',
}

const NODE_BUILTINS = new Set([
  'react', 'react-dom', 'react/jsx-runtime', 'react-router-dom',
])

// Pull every BARE package specifier (not relative, not @/ alias) from a file and
// reduce it to its installable base name (`@scope/pkg/sub` → `@scope/pkg`).
export function extractBarePackages(content: string): string[] {
  const out = new Set<string>()
  const reFrom = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g
  const reBare = /import\s*['"]([^'"]+)['"]/g
  const reDyn = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const re of [reFrom, reBare, reDyn]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      const spec = m[1]
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('node:')) continue
      const parts = spec.split('/')
      const base = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
      if (base) out.add(base)
    }
  }
  return [...out]
}

// Given the generated files + the deps already in package.json, return the subset
// of imported packages that are on the allow-list AND not yet declared — i.e. the
// real deps to pre-add so install resolves them without a runtime miss.
export function computeMissingKnownPackages(
  files: { path: string; content: string }[],
  declared: Set<string>
): Record<string, string> {
  const add: Record<string, string> = {}
  for (const f of files) {
    if (!/\.(tsx|jsx|ts|js)$/.test(f.path)) continue
    for (const pkg of extractBarePackages(f.content)) {
      if (NODE_BUILTINS.has(pkg) || declared.has(pkg)) continue
      if (KNOWN_PACKAGES[pkg]) add[pkg] = KNOWN_PACKAGES[pkg]
    }
  }
  return add
}
