// Server-stamped SHELL pages (Fable's #1 speed change). A deferred (phase-2+) page ships
// in phase 1 as a deterministic, on-brand placeholder the SERVER stamps in microseconds —
// the model NEVER generates shells. This makes phase-1 generation only the real files
// (huge token/time cut), always compiles, always matches the design system (it uses the
// same Tailwind semantic tokens the generated index.css defines), and permanently removes
// the shell-vs-empty-render-gate conflict. Enrichment later REPLACES each shell with the
// full page, live via HMR.

// Human title from a component/page path: src/pages/MenuGallery.tsx → "Menu Gallery".
function titleFromPath(path: string): string {
  const base = (path.split('/').pop() ?? 'Page').replace(/\.(tsx|jsx|ts|js)$/i, '')
  const spaced = base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Page'
}

// The export name the router imports must match the manifest. Pages are almost always a
// default export; honor a single named export if the manifest declared one.
function exportSignature(exportsList: string[]): { keyword: string; name: string } {
  const named = (exportsList ?? []).find((e) => e && e !== 'default')
  if (named) return { keyword: `export function ${named}`, name: named }
  return { keyword: 'export default function', name: 'Page' }
}

// Stamp a branded shell component for one deferred page. Uses ONLY Tailwind semantic
// classes (bg-background / text-foreground / text-primary / border-border / bg-card /
// text-muted-foreground) so it inherits whatever palette + fonts index.css defines — no
// imports beyond React's implicit JSX, so it can never fail to resolve or compile.
export function stampShell(opts: {
  path: string
  exports: string[]
  brandName?: string
}): string {
  const title = titleFromPath(opts.path)
  const sig = exportSignature(opts.exports)
  const eyebrow = (opts.brandName || 'Coming together').replace(/[<>{}`]/g, '')
  const fnName = /^[A-Za-z_]\w*$/.test(sig.name) ? sig.name : 'Page'
  return `${sig.keyword} ${fnName}() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="max-w-6xl mx-auto px-6 py-24">
        <p className="text-sm font-medium uppercase tracking-widest text-primary/80">${eyebrow}</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">${title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          This page is being crafted right now — it will fill in with real content in just a moment. Feel free to keep exploring.
        </p>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card/50 p-6">
              <div className="h-5 w-1/3 rounded-md bg-foreground/10 animate-pulse" />
              <div className="mt-4 h-3 w-full rounded bg-foreground/5 animate-pulse" />
              <div className="mt-2 h-3 w-5/6 rounded bg-foreground/5 animate-pulse" />
              <div className="mt-2 h-3 w-2/3 rounded bg-foreground/5 animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
`
}

// Stamp a minimal skeleton stub for a deferred visual COMPONENT (not a page). Components
// are rendered inside other components, not as standalone routes, so they just need to
// export a valid default function that accepts any props without TS errors. The animated
// placeholder div inherits the design system's muted color so it blends naturally until
// the real component loads via HMR during Phase 2 enrichment.
export function stampComponentShell(opts: {
  path: string
  exports: string[]
}): string {
  const sig = exportSignature(opts.exports)
  const fnName = /^[A-Za-z_]\w*$/.test(sig.name) ? sig.name : 'Component'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return `${sig.keyword} ${fnName}(_props?: any) {
  return <div className="animate-pulse rounded-xl bg-muted/40 h-40 w-full" />
}
`
}

// Stamp all deferred-phase shells for a manifest. Returns files ready for sandbox.writeFiles.
// Detects page vs. component files by path pattern and uses the appropriate shell type:
// pages get the full branded placeholder; components get a minimal animated skeleton stub.
const PAGE_LIKE_PATH_RE = /(^|\/)(pages|routes|views|screens)\/|Page\.(tsx|jsx)$|View\.(tsx|jsx)$|^src\/[A-Z][a-z][^/]+\.(tsx|jsx)$/
export function stampShellsForManifest(
  files: Array<{ path: string; exports: string[]; phase: number }>,
  brandName?: string
): Array<{ path: string; content: string }> {
  return files
    .filter((f) => f.phase > 1)
    .map((f) => {
      const isPage = PAGE_LIKE_PATH_RE.test(f.path)
      const content = isPage
        ? stampShell({ path: f.path, exports: f.exports, brandName })
        : stampComponentShell({ path: f.path, exports: f.exports })
      return { path: f.path, content }
    })
}
