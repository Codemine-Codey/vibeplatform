import { tool } from 'ai'
import z from 'zod/v3'

// ── Durable-runs STEP 2: phased, SHELL-FIRST manifest ─────────────────────────
// The planner assigns a `phase` to every manifest file. Phase 1 is the complete,
// immediately-previewable skeleton: index.css, App.tsx (ALL routes wired), Nav,
// Footer, the home page — plus a BRANDED SHELL for every other route. Phases 2..N
// each REPLACE 3-6 shells with full pages. Because every file exists (as a shell)
// from phase 1, no file in phase N imports anything created only in phase N+1 → the
// app builds after EVERY phase, by construction. A mechanical normalization pass
// (normalizeManifest) enforces this: foundation/chrome forced to phase 1, phases
// renumbered contiguously, and trivially-phased or small projects collapsed to a
// single phase (today's behavior — must keep working).

export interface ManifestFile {
  path: string
  exports: string[]
  phase: number
}

export interface NormalizedManifest {
  files: ManifestFile[]
  phaseCount: number
  multiPhase: boolean
  extraPackages: string[]
}

// Foundation + chrome that MUST be complete from phase 1 (the shell everything else
// renders inside). App.tsx wires all routes; index.css holds the tokens; Nav/Footer/
// Header are the persistent frame. These can never be a later-phase shell.
const FOUNDATION_RE = /(^|\/)(App\.(tsx|jsx)|index\.css)$/i
const CHROME_RE = /(^|\/)(Nav(bar|igation)?|Header|Footer|Layout)\.(tsx|jsx)$/i

// A project only benefits from phasing when it's big enough that a shell-first split
// gives a meaningfully faster first preview. Below this, ship everything at once.
const SMALL_PROJECT_FILES = 8
const MIN_ENRICHMENT_FILES = 3

// ── Deterministic (server-enforced) shell-first phasing ───────────────────────
// The model's `phase` hints proved unreliable — a complex multi-page site often comes
// back with no phases at all, collapsing to a single monolithic pass and a slow (10-16
// min) first preview. The guarantee CANNOT depend on the model opting in. So when the
// model didn't split the work, the server mechanically defers the non-home PAGE files
// (the bulk of the build) into enrichment phases 2..N. Foundation, chrome, the home
// page, shared components, stores, hooks and data all stay in phase 1 — the small, fast,
// immediately-previewable skeleton (every deferred page ships as a branded shell in
// phase 1, so imports always resolve).
const PAGE_DIR_RE = /(^|\/)(pages|routes|views|screens)\//i
const HOME_LIKE_RE = /(^|\/)(Home|Index|Landing|Main)(Page|View|Screen)?\.(tsx|jsx)$/i
const PAGE_SUFFIX_RE = /(Page|View|Screen)\.(tsx|jsx)$/i
// Flat PascalCase files directly in src/ — e.g. src/About.tsx, src/Gallery.tsx, src/Menu.tsx
// These are common website page files generated at top level rather than in a pages/ dir.
// Excludes lowercase (store.ts, utils.ts) + single-letter (App.tsx caught by FOUNDATION_RE).
const PAGE_TOP_FLAT_RE = /^src\/([A-Z][a-z][^/]+)\.(tsx|jsx)$/
const AUTO_PHASE_MIN_PAGES = 3      // fewer non-home pages than this → monolithic is fast enough
const AUTO_PHASE_GROUP = 4          // pages enriched per later phase (spec: 3-6)

function isEnrichablePage(path: string): boolean {
  if (FOUNDATION_RE.test(path) || CHROME_RE.test(path)) return false
  if (HOME_LIKE_RE.test(path)) return false
  const base = path.split('/').pop() ?? ''
  return PAGE_DIR_RE.test(path) || PAGE_SUFFIX_RE.test(base) || PAGE_TOP_FLAT_RE.test(path)
}

// Mechanically normalize + validate a raw planner manifest into phases. Never throws;
// always returns a coherent manifest (worst case: everything in phase 1 = today).
//
// Phasing strategy (server-enforced, not model-dependent):
//  - Small projects (< SMALL_PROJECT_FILES) → single phase (fast, no overhead)
//  - Large projects with enough non-home page files → phase 1 = foundation + home,
//    phases 2..N = non-home page files (AUTO_PHASE_GROUP per phase)
//  - Phase 2+ files are replaced by server-stamped shells in phase 1 so the build
//    always passes and all routes resolve. Enrichment fills them in live via HMR.
export function normalizeManifest(
  raw: Array<{ path: string; exports: string[]; phase?: number }>,
  extraPackages: string[] = []
): NormalizedManifest {
  if (raw.length === 0) return { files: [], phaseCount: 1, multiPhase: false, extraPackages }

  // Small projects: one shot is faster than phasing overhead
  if (raw.length < SMALL_PROJECT_FILES) {
    const files = raw.map((f) => ({ path: f.path, exports: f.exports, phase: 1 }))
    return { files, phaseCount: 1, multiPhase: false, extraPackages }
  }

  // Find pages that can be deferred (non-home, non-foundation, non-chrome page files)
  const enrichable = raw.filter((f) => isEnrichablePage(f.path))
  const enrichableSet = new Set(enrichable.map((f) => f.path))

  // Not enough enrichable pages → single phase
  if (enrichable.length < AUTO_PHASE_MIN_PAGES || enrichable.length < MIN_ENRICHMENT_FILES) {
    const files = raw.map((f) => ({ path: f.path, exports: f.exports, phase: 1 }))
    return { files, phaseCount: 1, multiPhase: false, extraPackages }
  }

  // Phase 1: everything except enrichable non-home pages
  const files: ManifestFile[] = []
  for (const f of raw) {
    if (!enrichableSet.has(f.path)) {
      files.push({ path: f.path, exports: f.exports, phase: 1 })
    }
  }

  // Phases 2..N: batch deferred pages AUTO_PHASE_GROUP at a time
  let phaseNum = 2
  for (let i = 0; i < enrichable.length; i += AUTO_PHASE_GROUP) {
    const batch = enrichable.slice(i, i + AUTO_PHASE_GROUP)
    for (const f of batch) {
      files.push({ path: f.path, exports: f.exports, phase: phaseNum })
    }
    phaseNum++
  }

  const phaseCount = phaseNum - 1
  return { files, phaseCount, multiPhase: phaseCount > 1, extraPackages }
}

// Durable-runs STEP 3: rebuild a NormalizedManifest from the bare files array that was
// persisted on the run row (run.manifest = enrichManifest.files). Used by a continuation
// invocation to resume enrichment with ZERO model context. phaseCount is derived from the
// stored per-file phases (already normalized when the run was first created).
export function manifestFromFiles(input: unknown): NormalizedManifest {
  const raw = Array.isArray(input) ? input : []
  const files: ManifestFile[] = raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      path: String((f as { path?: unknown }).path ?? ''),
      exports: Array.isArray((f as { exports?: unknown }).exports)
        ? ((f as { exports: unknown[] }).exports.map((e) => String(e)))
        : [],
      phase:
        typeof (f as { phase?: unknown }).phase === 'number' && (f as { phase: number }).phase >= 1
          ? Math.floor((f as { phase: number }).phase)
          : 1,
    }))
    .filter((f) => f.path.length > 0)
  const phaseCount = files.reduce((max, f) => Math.max(max, f.phase), 1)
  return { files, phaseCount, multiPhase: phaseCount > 1, extraPackages: [] }
}

export const planProject = (
  { onPlan }: { onPlan?: (manifest: NormalizedManifest) => void } = {}
) =>
  tool({
    description:
      'Commit to the complete project architecture — a BUILD MANIFEST — before generating any files. ' +
      'Only call this for NEW project generation — never during edits to an existing project. ' +
      'Call this after getUnsplashBatch (or createSandbox for image-free projects) and before generateFiles. ' +
      'The manifest is FINAL: generateFiles must produce exactly these files, and each file must export ' +
      'exactly the names you declare here. Declaring the exports up-front is what prevents cross-file ' +
      'import drift (importing useHabitStore when the store actually exports useStore).\n\n' +
      'STRUCTURE (websites/webapps): routing is FILE-BASED and scaffolded — do NOT list src/App.tsx or ' +
      'src/main.tsx (they are read-only and discarded). List one page per route in src/pages/ ' +
      '(src/pages/Home.tsx is REQUIRED and routes to "/", src/pages/About.tsx → "/about", etc.), the global ' +
      'nav/footer as src/components/Layout.tsx, plus any section components, stores, and src/index.css. ' +
      'Leave `phase` off — every file ships in one pass. NEVER list src/App.tsx or src/main.tsx for ANY ' +
      'project type (they are scaffolded/read-only). GAMES: list src/pages/Home.tsx as the game root ' +
      '(it mounts the game UI) plus the game components — games have no router but still root at Home.tsx.',
    inputSchema: z.object({
      files: z
        .array(
          z.object({
            path: z
              .string()
              .describe('File path relative to sandbox root, e.g. src/store/useCart.ts'),
            exports: z
              .array(z.string())
              .describe(
                'The EXACT named exports this file will provide (the identifiers other files will import). ' +
                'e.g. ["useCart","CartItem"]. For a default-only component file (e.g. src/components/Hero.tsx) ' +
                'use ["default"]. Be precise — these names are the contract every importing file must match.'
              ),
            phase: z
              .number()
              .int()
              .min(1)
              .optional()
              .describe(
                'Build phase (SHELL-FIRST). 1 = built fully in the first, immediately-previewable pass ' +
                '(index.css, App.tsx with all routes, Nav, Footer, the home page). 2+ = a route/page that ships ' +
                'as a branded shell in phase 1 and is enriched into a full page at this phase. Group 3-6 pages ' +
                'per later phase. Omit (or use 1) for a small/simple project so everything ships at once.'
              ),
          })
        )
        .min(1)
        .describe(
          'Complete ordered build manifest — every file to generate, each with its exact exports. ' +
          'Order foundation files (types, store, hooks, lib, data) BEFORE the components/pages that import them. ' +
          'Do NOT include scaffold files: package.json, vite.config.ts, tailwind.config.js, ' +
          'postcss.config.js, tsconfig.json, tsconfig.app.json, tsconfig.node.json, .npmrc, src/main.tsx.'
        ),
      extraPackages: z
        .array(z.string())
        .optional()
        .describe(
          'Additional npm packages beyond the pre-installed scaffold base. ' +
          'Scaffold already includes: react, react-dom, react-router-dom, lucide-react, framer-motion, ' +
          'vite, tailwindcss, typescript, @vitejs/plugin-react, autoprefixer, postcss.'
        ),
    }),
    execute: async ({ files, extraPackages }) => {
      // ── Pre-generation validation gate ────────────────────────────────────────
      // Catch wrong paths and forbidden packages BEFORE a single file is written.
      // Return a rejection string so the AI fixes the plan; never silently proceed
      // with a broken manifest — that's what causes cascading import drift.

      const FORBIDDEN_PATHS = [
        /^server\.(js|ts|mjs|cjs)$/i,
        /^express\.(js|ts)$/i,
        /^api\/(index|server|app)\.(js|ts)$/i,
        /^src\/main\.(tsx|jsx|ts|js)$/i,
        /^src\/App\.(tsx|jsx)$/i,
        /^vite\.config\.(ts|js|mjs)$/i,
        /^tsconfig.*\.json$/i,
        /^(index|app)\.(js|ts|mjs)$(?!.*src\/)/i,
      ]
      const FORBIDDEN_PACKAGES = new Set([
        'express', 'koa', 'fastify', 'hapi', 'nest', '@nestjs/core',
        'next', '@next/core', 'nuxt', '@nuxt/core',
        'motion',                       // wrong framer-motion rebrand (use framer-motion)
        'styled-components', '@emotion/react', '@emotion/styled',
        '@mui/material', '@mui/core',
        'antd', '@ant-design/icons',
        'chakra-ui', '@chakra-ui/react',
        'mantine', '@mantine/core',
        'daisyui',
        'bootstrap', 'react-bootstrap',
      ])

      const pathErrors: string[] = []
      for (const f of files) {
        for (const re of FORBIDDEN_PATHS) {
          if (re.test(f.path)) {
            pathErrors.push(`"${f.path}" — FORBIDDEN: ${
              /server|express|api\//i.test(f.path)
                ? 'no server-side files allowed. This is a Vite SPA. For backend calls use VITE_CODEMINE_API env var.'
                : /main\.tsx|App\.tsx/i.test(f.path)
                  ? 'scaffold-owned and read-only. Do not include in your manifest.'
                  : 'scaffold-owned config file. Do not include in your manifest.'
            }`)
          }
        }
      }

      const pkgErrors: string[] = []
      for (const pkg of extraPackages ?? []) {
        if (FORBIDDEN_PACKAGES.has(pkg)) {
          pkgErrors.push(`"${pkg}" — FORBIDDEN: ${
            /express|koa|fastify|hapi|nest/.test(pkg)
              ? 'no server frameworks. This is a Vite SPA with no Node runtime.'
              : /^next|nuxt/.test(pkg)
                ? 'no SSR frameworks. Use React + Vite only.'
                : /motion$/.test(pkg)
                  ? 'use "framer-motion" instead.'
                  : 'not compatible with the Codemine SPA stack.'
          }`)
        }
      }

      if (pathErrors.length > 0 || pkgErrors.length > 0) {
        const lines: string[] = ['MANIFEST REJECTED — fix these before calling planProject again:']
        if (pathErrors.length) lines.push('\nForbidden files:\n' + pathErrors.map(e => '  • ' + e).join('\n'))
        if (pkgErrors.length) lines.push('\nForbidden packages:\n' + pkgErrors.map(e => '  • ' + e).join('\n'))
        lines.push('\nRemove these from your manifest and call planProject again with the corrected list.')
        return lines.join('\n')
      }
      // ── End validation ────────────────────────────────────────────────────────

      const manifest = normalizeManifest(files, extraPackages ?? [])
      onPlan?.(manifest)

      const pkgNote = extraPackages?.length
        ? `\nExtra packages: ${extraPackages.join(', ')} — declare them in package.json before generateFiles.`
        : '\nScaffold packages cover all dependencies — no extra installs needed.'
      // Surface the export contract back to the model so the very next step (generateFiles)
      // writes every import against these exact names — no guessing, no drift.
      const contract = manifest.files
        .map((f) => `- ${f.path} → exports { ${f.exports.join(', ')} }`)
        .join('\n')
      const allPaths = manifest.files.map((f) => f.path)

      // ── Single-phase (small/simple project) — EXACTLY today's instruction ─────
      if (!manifest.multiPhase) {
        return (
          `Manifest locked — ${manifest.files.length} files. This is the export CONTRACT; every import must match it exactly:\n` +
          `${contract}${pkgNote}\n\n` +
          `Now call generateFiles with exactly these ${manifest.files.length} paths: ${allPaths.join(', ')}. ` +
          `Each file must export precisely the names declared above.`
        )
      }

      // ── Multi-phase (SHELL-FIRST) — the model builds ONLY the phase-1 real files ──
      // The deferred (phase-2+) pages are SERVER-STAMPED as on-brand shells (zero tokens,
      // instant) and enriched into full pages automatically after the preview goes live.
      // So the model generates ONLY the phase-1 files — the small, fast first-preview set.
      const phase1 = manifest.files.filter((f) => f.phase === 1).map((f) => f.path)
      const deferred = manifest.files.filter((f) => f.phase > 1).map((f) => f.path)
      return (
        `Manifest locked — ${manifest.files.length} files across ${manifest.phaseCount} progressive build phases. ` +
        `This is the export CONTRACT; every import must match it exactly:\n${contract}${pkgNote}\n\n` +
        `Now call generateFiles with ONLY these ${phase1.length} phase-1 paths (build each COMPLETE and ` +
        `production-quality): ${phase1.join(', ')}.\n\n` +
        `Do NOT generate these ${deferred.length} pages — they are created automatically as on-brand placeholders ` +
        `and filled in live right after the preview goes online: ${deferred.join(', ')}.\n\n` +
        `Every file you generate must export precisely the names declared above.`
      )
    },
  })
