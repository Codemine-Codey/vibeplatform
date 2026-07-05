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
const AUTO_PHASE_MIN_PAGES = 3      // fewer non-home pages than this → monolithic is fast enough
const AUTO_PHASE_GROUP = 4          // pages enriched per later phase (spec: 3-6)

function isEnrichablePage(path: string): boolean {
  if (FOUNDATION_RE.test(path) || CHROME_RE.test(path)) return false
  if (HOME_LIKE_RE.test(path)) return false
  const base = path.split('/').pop() ?? ''
  return PAGE_DIR_RE.test(path) || PAGE_SUFFIX_RE.test(base)
}

// Mechanically normalize + validate a raw planner manifest into phases. Never throws;
// always returns a coherent manifest (worst case: everything in phase 1 = today).
export function normalizeManifest(
  raw: Array<{ path: string; exports: string[]; phase?: number }>,
  extraPackages: string[] = []
): NormalizedManifest {
  // 1. Default missing/invalid phases to 1.
  const files: ManifestFile[] = raw.map((f) => ({
    path: f.path,
    exports: f.exports,
    phase: typeof f.phase === 'number' && f.phase >= 1 ? Math.floor(f.phase) : 1,
  }))

  // 2. Force foundation + chrome to phase 1 (the shell-first invariant's anchor).
  for (const f of files) {
    if (FOUNDATION_RE.test(f.path) || CHROME_RE.test(f.path)) f.phase = 1
  }

  // 2b. DETERMINISTIC PHASING — the model's `phase` hints are unreliable (it emits none,
  // or a weak split that collapses), so we compute the split from PAGE STRUCTURE and make
  // it AUTHORITATIVE. For any page-rich project, defer the non-home pages into enrichment
  // phases 2..N and force everything else to phase 1 — overriding whatever the model did.
  // This is what guarantees a small, fast, immediately-previewable phase-1 skeleton.
  const pages = files.filter((f) => isEnrichablePage(f.path))
  if (pages.length >= AUTO_PHASE_MIN_PAGES && files.length > SMALL_PROJECT_FILES) {
    for (const f of files) if (!isEnrichablePage(f.path)) f.phase = 1
    pages.forEach((f, i) => { f.phase = 2 + Math.floor(i / AUTO_PHASE_GROUP) })
    console.log(`[normalizeManifest] auto-phased: ${files.length} files, ${pages.length} pages deferred → phases 2..${2 + Math.floor((pages.length - 1) / AUTO_PHASE_GROUP)}`)
  }

  // 3. Renumber distinct phases to a contiguous 1..N (so gaps like 1,3,5 → 1,2,3).
  const distinct = [...new Set(files.map((f) => f.phase))].sort((a, b) => a - b)
  const remap = new Map(distinct.map((p, i) => [p, i + 1]))
  for (const f of files) f.phase = remap.get(f.phase) ?? 1
  let phaseCount = distinct.length

  // 4. Collapse to a single phase for small projects or trivial phasing — the
  //    current single-pass behavior, which must keep working exactly as before.
  const laterCount = files.filter((f) => f.phase > 1).length
  if (phaseCount <= 1 || files.length <= SMALL_PROJECT_FILES || laterCount < MIN_ENRICHMENT_FILES) {
    for (const f of files) f.phase = 1
    phaseCount = 1
  }

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
      'PHASING (SHELL-FIRST progressive build): assign each file a `phase`. Phase 1 is the complete, ' +
      'immediately-previewable skeleton — index.css, App.tsx with ALL routes wired, Nav, Footer, and the ' +
      'HOME page, all built fully. Give every OTHER page/route a phase of 2 or higher: it will be created as ' +
      'a branded SHELL in phase 1 and filled into a full page at its phase, LIVE in the preview. Group 3-6 ' +
      'related pages per later phase. For a small or simple project, leave phase off (or use 1) so everything ' +
      'ships at once. Foundation files (index.css, App.tsx, Nav, Footer) are always phase 1.',
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

      // ── Multi-phase (SHELL-FIRST) — build phase-1 files fully + the rest as shells ─
      const phase1 = manifest.files.filter((f) => f.phase === 1).map((f) => f.path)
      const shells = manifest.files.filter((f) => f.phase > 1).map((f) => f.path)
      return (
        `Manifest locked — ${manifest.files.length} files across ${manifest.phaseCount} progressive build phases. ` +
        `This is the export CONTRACT; every import must match it exactly:\n${contract}${pkgNote}\n\n` +
        `Now call generateFiles with ALL ${allPaths.length} paths: ${allPaths.join(', ')}.\n\n` +
        `Build these ${phase1.length} files as COMPLETE, production-quality pages/files now:\n` +
        phase1.map((p) => `- ${p}`).join('\n') +
        `\n\nBuild these ${shells.length} files as branded SHELL pages — the real header/nav/footer layout plus the ` +
        `section HEADINGS this page will have, in the brand's colors, fonts, and spacing, with a single intro line under ` +
        `each heading. They must look on-brand and intentional — NEVER gray boxes, lorem ipsum, or "coming soon". ` +
        `They will be enriched into full pages automatically, live in the preview, right after it goes online:\n` +
        shells.map((p) => `- ${p}`).join('\n') +
        `\n\nEvery file must export precisely the names declared above.`
      )
    },
  })
