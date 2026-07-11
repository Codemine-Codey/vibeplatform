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
  // process.env crashes a Vite SPA ("process is not defined"). import.meta.env is the
  // Vite equivalent — VITE_* vars resolve, anything else is undefined (no crash). Always
  // a safe rewrite, and it deterministically kills the blank-screen-from-process.env class.
  [/\bprocess\.env\b/g, 'import.meta.env'],
  // Scaffold block-component import path normalization. The AI sometimes writes the
  // bare directory path without /index — Vite resolves it but TypeScript doesn't,
  // causing blank previews on the type-check path. Rewrite to explicit index.
  [/(from\s*['"])(@\/components\/blocks)(['"])/g, '$1$2/index$3'],
  // Game engine path — both spellings resolve identically.
  [/(from\s*['"])(@\/components\/game\/engine)\.js(['"])/g, '$1$2$3'],
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
  // ── In the website/app scaffold but NOT games — so a game importing them auto-gets
  //    them (versions aligned with the scaffold so a reconcile never conflicts) ──
  'framer-motion': '^11.18.2',
  'react-router-dom': '^6.28.0',
  'react-hook-form': '^7.54.0',
  '@hookform/resolvers': '^3.9.1',
  zod: '^3.24.1',
  '@tanstack/react-query': '^5.62.0',
  'date-fns': '^4.4.0',
  sonner: '^2.0.7',
  'embla-carousel-react': '^8.6.0',
  'embla-carousel-autoplay': '^8.5.1',
  'next-themes': '^0.4.6',
  'react-day-picker': '^10.0.1',

  // ── 3D / WebGL — a website 3D hero OR any game (React-18-safe majors: fiber v8/drei v9) ──
  three: '^0.169.0',
  '@react-three/fiber': '^8.17.10',
  '@react-three/drei': '^9.114.0',
  '@react-three/postprocessing': '^2.16.3',
  postprocessing: '^6.36.4',
  'three-stdlib': '^2.35.6',
  maath: '^0.10.8',
  leva: '^0.9.35',

  // ── Game: physics / sprites / audio / state ──
  'matter-js': '^0.20.0',
  '@dimforge/rapier3d-compat': '^0.14.0',
  'pixi.js': '^8.6.6',
  howler: '^2.2.4',
  tone: '^15.0.4',
  zustand: '^5.0.2',
  jotai: '^2.10.3',
  valtio: '^2.1.2',
  immer: '^10.1.1',
  nanoid: '^5.0.9',

  // ── Animation / motion / gesture ──
  gsap: '^3.12.5',
  '@react-spring/web': '^9.7.5',
  'lottie-react': '^2.4.1',
  '@use-gesture/react': '^10.3.1',

  // ── Carousels / sliders / marquee ──
  swiper: '^11.1.15',
  'keen-slider': '^6.8.6',
  'react-fast-marquee': '^1.6.5',

  // ── Charts / data-viz ──
  recharts: '^2.13.3',
  'chart.js': '^4.4.7',
  'react-chartjs-2': '^5.2.0',

  // ── Data / fetch / tables / cache ──
  axios: '^1.7.9',
  swr: '^2.2.5',
  ky: '^1.7.4',
  '@tanstack/react-table': '^8.20.5',

  // ── Forms (extra) ──
  yup: '^1.6.1',
  formik: '^2.4.6',

  // ── Dates / utils ──
  dayjs: '^1.11.13',
  'lodash-es': '^4.17.21',
  uuid: '^11.0.3',
  clsx: '^2.1.1',
  classnames: '^2.5.1',
  'tailwind-merge': '^2.6.0',

  // ── Content / markdown ──
  'react-markdown': '^9.0.1',
  'remark-gfm': '^4.0.0',
  'react-syntax-highlighter': '^15.6.1',

  // ── Toasts / overlays / UI extras ──
  'react-hot-toast': '^2.4.1',
  'react-toastify': '^10.0.6',
  'react-tooltip': '^5.28.0',
  '@headlessui/react': '^2.2.0',
  'react-modal': '^3.16.1',
  'react-dropzone': '^14.3.5',

  // ── Icons ──
  'react-icons': '^5.4.0',
  '@phosphor-icons/react': '^2.1.7',
  '@heroicons/react': '^2.2.0',

  // ── Viewport / scroll / misc ──
  'react-intersection-observer': '^9.13.1',
  'react-use': '^17.6.0',
  'react-countup': '^6.5.3',
  'react-confetti': '^6.1.0',
  'qrcode.react': '^4.2.0',
  'react-helmet-async': '^2.0.5',

  // ── 2D game engines (canvas/webgl, framework-agnostic) ──
  phaser: '^3.87.0',
  kaplay: '^3001.0.0',
  p5: '^1.11.0',

  // ── 3D worlds: physics + ECS + character control (fiber-v8 / React-18 majors) ──
  '@react-three/rapier': '^1.5.0',
  '@react-three/cannon': '^6.6.0',
  'cannon-es': '^0.20.0',
  ecctrl: '^1.0.93',
  miniplex: '^2.0.0',

  // ── Drag & drop ──
  '@dnd-kit/core': '^6.3.1',
  '@dnd-kit/sortable': '^10.0.0',
  '@dnd-kit/utilities': '^3.2.2',

  // ── Virtualization (big lists/tables) ──
  '@tanstack/react-virtual': '^3.11.0',
  'react-window': '^1.8.11',

  // ── Global state (Redux path) ──
  '@reduxjs/toolkit': '^2.5.0',
  'react-redux': '^9.2.0',

  // ── Rich text / code editors ──
  '@tiptap/react': '^2.10.3',
  '@tiptap/starter-kit': '^2.10.3',
  '@tiptap/pm': '^2.10.3',
  '@monaco-editor/react': '^4.6.0',

  // ── Maps (v4 react-leaflet = React 18; v5 needs React 19) ──
  'react-leaflet': '^4.2.1',
  leaflet: '^1.9.4',
  'mapbox-gl': '^3.9.0',

  // ── More charts / media / scroll ──
  victory: '^37.3.0',
  'react-player': '^2.16.0',
  lenis: '^1.3.0',
  'react-parallax': '^3.5.1',
  'react-awesome-reveal': '^4.3.1',
  animejs: '^3.2.2',
  '@formkit/auto-animate': '^0.8.2',

  // ── Storage / cookies / clipboard / hooks / slugs ──
  localforage: '^1.10.0',
  'js-cookie': '^3.0.5',
  'copy-to-clipboard': '^3.3.3',
  'react-hotkeys-hook': '^4.6.0',
  'usehooks-ts': '^3.1.0',
  slugify: '^1.6.6',
}

// ── Scaffold @/ paths that ALWAYS exist (never generated, always resolvable) ──
// Any @/ import NOT in this set AND not a path declared by the AI's own generateFiles
// call is a hallucinated import that will break the build. Used by fixUnknownLocalImports.
export const SCAFFOLD_AT_PATHS = new Set([
  '@/lib/utils',
  // shadcn/ui components — pre-written in every sandbox (all backed by Radix, pre-installed)
  '@/components/ui/button',
  '@/components/ui/card',
  '@/components/ui/input',
  '@/components/ui/label',
  '@/components/ui/badge',
  '@/components/ui/textarea',
  '@/components/ui/separator',
  '@/components/ui/select',
  '@/components/ui/dialog',
  '@/components/ui/tabs',
  '@/components/ui/accordion',
  '@/components/ui/dropdown-menu',
  '@/components/ui/switch',
  '@/components/ui/slider',
  '@/components/ui/tooltip',
  '@/components/ui/avatar',
  '@/components/ui/progress',
  '@/components/ui/table',
  '@/components/ui/checkbox',
  '@/components/ui/popover',
  '@/components/ui/scroll-area',
  '@/components/ui/radio-group',
  '@/components/ui/sheet',
  '@/components/ui/skeleton',
  '@/components/ui/alert',
  '@/components/ui/toast',
  // Scaffold blocks + game engine
  '@/components/blocks',
  '@/components/blocks/index',
  '@/components/blocks/sections',
  '@/components/game/engine',
  '@/components/NotFound',
])

// Convert a generated file path (e.g. "src/store/useCart.ts") to its @/ alias
// (e.g. "@/store/useCart"). Used to build the set of resolvable local paths.
function toAtPath(filePath: string): string {
  return '@/' + filePath.replace(/^src\//, '').replace(/\.(tsx|ts|jsx|js)$/, '')
}

// Extract all @/ import specifiers from a TypeScript/JSX file.
function extractAtImports(content: string): string[] {
  const out: string[] = []
  const re = /(?:import|export)[^'"]*?from\s*['"](@\/[^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) out.push(m[1])
  return out
}

// Post-generation guard: for each @/ import in a file that resolves to neither a
// scaffold path nor a path the AI declared in this generation, log a warning.
// Does NOT rewrite (that would break intent) — surfaces the miss so verifyAndRepair
// has a precise error to fix. Called once per generated file before sandbox write.
export function auditLocalImports(
  filePath: string,
  content: string,
  generatedPaths: string[]  // all paths from this generateFiles call
): string[] {
  if (!/\.(tsx|ts|jsx|js)$/.test(filePath)) return []
  const known = new Set([
    ...SCAFFOLD_AT_PATHS,
    ...generatedPaths.map(toAtPath),
  ])
  const bad: string[] = []
  for (const spec of extractAtImports(content)) {
    // Normalize: strip trailing /index for comparison
    const normalized = spec.replace(/\/index$/, '')
    if (!known.has(spec) && !known.has(normalized) && !known.has(spec + '/index')) {
      bad.push(spec)
    }
  }
  return bad
}

// Always present in every scaffold (react itself) — skip from pre-declare. NOT
// react-router-dom: it's absent from games, so it must stay eligible for the
// KNOWN_PACKAGES pre-declare when a game imports it.
const NODE_BUILTINS = new Set([
  'react', 'react-dom', 'react/jsx-runtime',
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
