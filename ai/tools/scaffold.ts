// ONE universal package.json — no skill branching. All deps always present;
// tree-shaking eliminates unused ones from the bundle. This eliminates the entire
// class of "wrong scaffold → missing deps → build crash" failures that happened
// when the classifier mis-picked game vs webapp (or the user asked for a game with
// a leaderboard UI, or a webapp with canvas animations).
function makePackageJson(): string {
  return JSON.stringify(
    {
      name: 'codemine-app',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        // --strictPort: NEVER silently drift to 3001 if 3000 is busy. The platform
        // proxies a HARD-CODED :3000; a drifted server leaves :3000 dead → permanent
        // 502. With strictPort a second `vite` start exits instead of stealing the
        // port, so the first (healthy) server keeps owning 3000.
        dev: 'vite --port 3000 --strictPort --host 0.0.0.0',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        // Routing — present for all types. Games use it for the Home.tsx → "/" route.
        'react-router-dom': '^6.28.0',
        'framer-motion': '^11.18.2',
        'lucide-react': '^0.528.0',
        // shadcn/ui Radix backing — always present so every UI component is importable.
        '@radix-ui/react-accordion': '^1.2.14',
        '@radix-ui/react-alert-dialog': '^1.1.17',
        '@radix-ui/react-aspect-ratio': '^1.1.10',
        '@radix-ui/react-avatar': '^1.2.0',
        '@radix-ui/react-checkbox': '^1.3.5',
        '@radix-ui/react-collapsible': '^1.1.14',
        '@radix-ui/react-context-menu': '^2.3.1',
        '@radix-ui/react-dialog': '^1.1.4',
        '@radix-ui/react-dropdown-menu': '^2.1.4',
        '@radix-ui/react-hover-card': '^1.1.17',
        '@radix-ui/react-label': '^2.1.1',
        '@radix-ui/react-menubar': '^1.1.18',
        '@radix-ui/react-navigation-menu': '^1.2.16',
        '@radix-ui/react-popover': '^1.1.17',
        '@radix-ui/react-progress': '^1.1.10',
        '@radix-ui/react-radio-group': '^1.4.1',
        '@radix-ui/react-scroll-area': '^1.2.12',
        '@radix-ui/react-select': '^2.1.4',
        '@radix-ui/react-separator': '^1.1.1',
        '@radix-ui/react-slider': '^1.4.1',
        '@radix-ui/react-switch': '^1.3.1',
        '@radix-ui/react-tabs': '^1.1.15',
        '@radix-ui/react-toggle': '^1.1.12',
        '@radix-ui/react-toggle-group': '^1.1.13',
        '@radix-ui/react-tooltip': '^1.1.6',
        '@radix-ui/react-slot': '^1.1.1',
        cmdk: '^1.1.1',
        'date-fns': '^4.4.0',
        'embla-carousel-react': '^8.6.0',
        'next-themes': '^0.4.6',
        'react-day-picker': '^10.0.1',
        'react-resizable-panels': '^4.11.2',
        sonner: '^2.0.7',
        vaul: '^1.1.2',
        'class-variance-authority': '^0.7.1',
        clsx: '^2.1.1',
        'tailwind-merge': '^2.6.0',
        'tailwindcss-animate': '^1.0.7',
        // Forms + validation + server state (websites, webapps, and game leaderboards).
        'react-hook-form': '^7.54.0',
        '@hookform/resolvers': '^3.9.1',
        zod: '^3.24.1',
        '@tanstack/react-query': '^5.62.0',
        // 3D + audio + game state — always available, tree-shaken away if unused.
        // A "game with a leaderboard" needs both Radix AND three; a webapp with a canvas
        // effect needs howler; both work now without any scaffold mis-pick.
        three: '^0.169.0',
        '@react-three/fiber': '^8.17.10',
        '@react-three/drei': '^9.114.0',
        howler: '^2.2.4',
        zustand: '^5.0.2',
        // Database — Neon serverless Postgres (available when DATABASE_URL is set)
        '@neondatabase/serverless': '^0.10.4',
        postgres: '^3.4.5',
        // Auth — Better Auth client for user-facing login/signup flows
        'better-auth': '^1.6.23',
      },
      devDependencies: {
        '@types/node': '^22.0.0',
        '@types/react': '^18.3.12',
        '@types/react-dom': '^18.3.1',
        '@vitejs/plugin-react': '^4.3.4',
        autoprefixer: '^10.4.20',
        postcss: '^8.4.49',
        tailwindcss: '^3.4.16',
        typescript: '^5.6.3',
        vite: '^6.0.5',
      },
    },
    null,
    2
  )
}

// Merge an AI-generated package.json with the scaffold's so scaffold dependencies
// can NEVER be dropped. The scaffold's tailwind.config.js requires tailwindcss-animate,
// src/lib/utils.ts requires clsx + tailwind-merge, etc. — if the AI regenerates
// package.json and omits any of these, install succeeds but the dev server crashes
// (PostCSS "Cannot find module") and the preview blanks. Scaffold versions win
// (they match what is pre-installed); the AI's NEW packages are preserved.
export function mergePackageJson(aiContent: string): string {
  const scaffoldRaw = makePackageJson()
  try {
    const scaffold = JSON.parse(scaffoldRaw)
    const ai = JSON.parse(aiContent)
    return JSON.stringify(
      {
        ...scaffold,
        ...ai,
        // scripts/deps: AI extras kept, scaffold entries always present and authoritative
        scripts: { ...(ai.scripts ?? {}), ...scaffold.scripts },
        dependencies: { ...(ai.dependencies ?? {}), ...scaffold.dependencies },
        devDependencies: { ...(ai.devDependencies ?? {}), ...scaffold.devDependencies },
      },
      null,
      2
    )
  } catch {
    // AI emitted malformed JSON — a broken package.json bricks install entirely,
    // so fall back to the known-good scaffold file.
    return scaffoldRaw
  }
}

// Error bridge — placed in <head> so it runs BEFORE the React module script and
// installs window.onerror first. Forwards runtime errors AND silent blank screens
// to the parent window so ErrorMonitor can auto-fix them. Pre-injecting here means
// the AI never writes index.html — eliminating a major blank-preview source.
//
// Two layers of detection:
//   1. Thrown errors: window.onerror, unhandledrejection, console.error
//   2. SILENT blanks: after load, if #root is empty, report it. This is the
//      "snapshot" check — it catches pages that mount nothing without throwing
//      (component returns null, render never ran, etc.), which is the exact
//      failure that previously went undetected.
const ERROR_BRIDGE_SCRIPT = `<script>
(function(){
  var _w=window,_p=_w.parent,_sent={};
  function _send(m,s){try{var k=(s||'')+String(m).slice(0,120);if(_sent[k])return;_sent[k]=1;_p.postMessage({type:'cm-error',message:m,source:s},'*');}catch(e){}}
  _w.onerror=function(m,s,l,c){_send(m+'\\n'+s+':'+l+':'+c,'onerror');return false;};
  _w.addEventListener('unhandledrejection',function(e){_send(String(e.reason&&e.reason.stack||e.reason),'unhandledrejection');});
  var _ce=_w.console.error.bind(_w.console);
  _w.console.error=function(){var m=Array.from(arguments).map(String).join(' ');_send(m,'console.error');_ce.apply(_w.console,arguments);};
  function _blankCheck(){var r=document.getElementById('root');if(r&&r.childElementCount===0&&(!r.textContent||!r.textContent.trim())){_send('Blank screen: the app loaded but #root is empty. A component threw during render or returned nothing — check src/App.tsx and the page/component files for runtime errors.','blank-check');}}
  _w.addEventListener('load',function(){setTimeout(_blankCheck,2500);setTimeout(_blankCheck,5000);});
})();
</script>`

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>App</title>
    <style>
      html, body, #root { height: 100%; margin: 0; padding: 0; }
      #root { display: flex; flex-direction: column; }
      * { box-sizing: border-box; }
    </style>
${ERROR_BRIDGE_SCRIPT}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`

// ROUTER BOOTSTRAP INVARIANT: main.tsx always wraps <App/> in <BrowserRouter>
// for ALL project types (websites, webapps, and games). Games use the file-based
// router App.tsx which auto-routes src/pages/Home.tsx → "/", so BrowserRouter is
// required even for games. Structural guarantee: "Missing <BrowserRouter>" is
// impossible. This file is scaffold-owned, never touched by the AI.
function makeMainTsx(): string {
  return `import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './styles/cm-ui.css'
import App from './App'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Always report the crash to the platform so it can auto-repair. It is NEVER the
    // user's job to copy a stack trace or type "fix the error" — the platform fixes it.
    try {
      window.parent.postMessage(
        { type: 'cm-error', message: (error?.stack || String(error)) + '\\n' + (info?.componentStack || ''), source: 'error-boundary' },
        '*'
      )
    } catch {}
    try { sessionStorage.setItem('_cm_crashed', '1') } catch {}
    // Transient errors (HMR race, async first-load) clear on a single reload.
    try {
      if (!sessionStorage.getItem('_cm_reloaded')) {
        sessionStorage.setItem('_cm_reloaded', '1')
        setTimeout(() => window.location.reload(), 2000)
      }
    } catch {}
  }
  render() {
    if (this.state.error) {
      // ONE calm, honest message — the app is being fixed automatically. We never expose
      // internals or ask the user to do anything; the crashed tree self-heals the moment a
      // repair lands (see the vite:afterUpdate reload hook below).
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'system-ui, sans-serif', background: '#fafafa', color: '#111' }}>
          <div style={{ maxWidth: '26rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✨</div>
            <h1 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Putting the final touches on this page
            </h1>
            <p style={{ fontSize: '0.9rem', opacity: 0.65 }}>
              One moment — this updates automatically.
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Self-heal: the instant a code fix is hot-applied by the dev server, a crashed React tree
// cannot recover on its own (its error state is stuck), so reload to mount the fixed code.
// Event-driven — fires exactly when a repair lands, no polling, no timing guesses.
if (import.meta.hot) {
  import.meta.hot.on('vite:afterUpdate', () => {
    try {
      if (sessionStorage.getItem('_cm_crashed')) {
        sessionStorage.removeItem('_cm_crashed')
        sessionStorage.removeItem('_cm_reloaded')
        window.location.reload()
      }
    } catch {}
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter><App /></BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
`
}

// Base scaffold written to every sandbox on creation.
// Includes: Vite+React+TypeScript+Tailwind config, shadcn/ui packages + 8 core components,
// path alias (@→src), lib/utils, index.html (with error bridge), and src/main.tsx.
// The AI skips ALL of these in generateFiles — they are pre-written and correct.
// Heavier-scaffold building blocks — token-agnostic, reusable across every project.
// The AI composes pages from these instead of re-writing the same motion/layout
// boilerplate each time: cuts output sharply (fixes truncation), keeps consistency,
// and stays UNIQUE per project because colours/fonts/theme come from the locked tokens.
// One import: `import { Section, Container, Reveal, Stagger, StaggerItem, Marquee, CountUp } from '@/components/blocks'`
const BLOCKS_TSX = `import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useInView } from 'framer-motion'

const EASE = [0.22, 1, 0.36, 1] as const

// Consistent vertical rhythm for page sections.
export function Section({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={'py-20 md:py-28 lg:py-32 ' + className}>{children}</section>
}

// Standard max-width + responsive horizontal padding.
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={'mx-auto w-full max-w-7xl px-6 md:px-10 ' + className}>{children}</div>
}

// Fade + rise in when scrolled into view (once). The default reveal for any block.
export function Reveal({ children, className = '', delay = 0, y = 24 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, ease: EASE, delay }} className={className}>
      {children}
    </motion.div>
  )
}

// Stagger a group of children into view. Wrap each child in <StaggerItem>.
export function Stagger({ children, className = '', stagger = 0.1 }: { children: ReactNode; className?: string; stagger?: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div ref={ref} initial="hidden" animate={inView ? 'show' : 'hidden'} variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }} className={className}>
      {children}
    </motion.div>
  )
}
export function StaggerItem({ children, className = '', y = 24 }: { children: ReactNode; className?: string; y?: number }) {
  return (
    <motion.div variants={{ hidden: { opacity: 0, y }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }} className={className}>
      {children}
    </motion.div>
  )
}

// Infinite horizontal marquee (logos, tags, accolades).
export function Marquee({ children, className = '', speed = 30, reverse = false }: { children: ReactNode; className?: string; speed?: number; reverse?: boolean }) {
  return (
    <div className={'flex overflow-hidden ' + className}>
      <motion.div className="flex shrink-0 gap-8 pr-8" animate={{ x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }} transition={{ duration: speed, ease: 'linear', repeat: Infinity }}>
        {children}{children}
      </motion.div>
    </div>
  )
}

// Number that counts up (ease-out) when scrolled into view.
export function CountUp({ to, duration = 2, suffix = '', prefix = '', className = '' }: { to: number; duration?: number; suffix?: string; prefix?: string; className?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!inView) return
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - start) / (duration * 1000), 1)
      setN(Math.floor((1 - Math.pow(1 - p, 3)) * to))
      if (p < 1) raf = requestAnimationFrame(tick)
      else setN(to)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, to, duration])
  return <span ref={ref} className={className}>{prefix}{n.toLocaleString()}{suffix}</span>
}
`

// v2 blocks — section components WITH VARIANTS. Content via props, look from the
// locked tokens, so structure is reused (fast, fixes truncation) while every project
// stays unique. The AI PICKS the variant that fits the brand — the same Hero/Footer
// never repeats verbatim. import { Hero, Footer } from '@/components/blocks/sections'.
const BLOCKS_SECTIONS_TSX = `import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

type Cta = { label: string; href: string }
const EASE = [0.22, 1, 0.36, 1] as const

// HERO — variant: 'split' (product/SaaS) | 'spotlight' (bold/image-led) | 'editorial'
// (premium/type-led). Pick the one that fits the brand.
export function Hero(props: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; image?: string; primaryCta?: Cta; secondaryCta?: Cta; variant?: 'split' | 'spotlight' | 'editorial' }) {
  const { eyebrow, title, subtitle, image, primaryCta, secondaryCta, variant = 'split' } = props
  const ctas = (
    <div className="mt-8 flex flex-wrap gap-3">
      {primaryCta && <Link to={primaryCta.href} className="inline-flex items-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">{primaryCta.label}</Link>}
      {secondaryCta && <Link to={secondaryCta.href} className="inline-flex items-center rounded-md border border-border px-6 py-3 text-sm font-medium hover:bg-accent transition-colors">{secondaryCta.label}</Link>}
    </div>
  )
  if (variant === 'spotlight') {
    return (
      <section className="relative flex min-h-[88vh] items-center overflow-hidden">
        {image && <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 md:px-10">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }} className="max-w-2xl">
            {eyebrow && <p className="mb-4 text-sm uppercase tracking-[0.2em] text-primary">{eyebrow}</p>}
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">{subtitle}</p>}
            {ctas}
          </motion.div>
        </div>
      </section>
    )
  }
  if (variant === 'editorial') {
    return (
      <section className="mx-auto w-full max-w-7xl px-6 md:px-10 pt-28 pb-20 md:pt-36 md:pb-28">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
          {eyebrow && <p className="mb-6 text-sm uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>}
          <h1 className="font-display text-6xl md:text-8xl font-bold leading-[0.95] tracking-tight text-foreground max-w-5xl">{title}</h1>
          <div className="mt-10 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
            {subtitle && <p className="max-w-xl text-lg text-muted-foreground leading-relaxed">{subtitle}</p>}
            {ctas}
          </div>
          {image && <img src={image} alt="" className="mt-16 w-full rounded-xl object-cover aspect-[16/7]" />}
        </motion.div>
      </section>
    )
  }
  return (
    <section className="mx-auto w-full max-w-7xl px-6 md:px-10 pt-24 pb-16 md:pt-32 md:pb-24">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
          {eyebrow && <p className="mb-4 text-sm uppercase tracking-[0.2em] text-primary">{eyebrow}</p>}
          <h1 className="font-display text-5xl md:text-6xl font-bold leading-[1.05] tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-6 text-lg text-muted-foreground leading-relaxed">{subtitle}</p>}
          {ctas}
        </motion.div>
        {image && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}>
            <img src={image} alt="" className="w-full rounded-xl object-cover aspect-[4/3]" />
          </motion.div>
        )}
      </div>
    </section>
  )
}

// FOOTER — variant: 'columns' (rich) | 'minimal' (single row).
type FooterCol = { title: string; links: { label: string; href: string }[] }
export function Footer(props: { brand: ReactNode; tagline?: string; columns?: FooterCol[]; variant?: 'columns' | 'minimal' }) {
  const { brand, tagline, columns = [], variant = 'columns' } = props
  const year = new Date().getFullYear()
  const name = typeof brand === 'string' ? brand : ''
  if (variant === 'minimal') {
    return (
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-7xl px-6 md:px-10 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="font-display text-lg font-semibold">{brand}</div>
          <nav className="flex flex-wrap gap-6">
            {columns.flatMap((c) => c.links).map((l) => (
              <a key={l.href} href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{l.label}</a>
            ))}
          </nav>
          <p className="text-xs text-muted-foreground">© {year} {name}</p>
        </div>
      </footer>
    )
  }
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-7xl px-6 md:px-10 py-16">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(auto-fit,minmax(0,1fr))]">
          <div>
            <div className="font-display text-xl font-semibold">{brand}</div>
            {tagline && <p className="mt-3 max-w-xs text-sm text-muted-foreground leading-relaxed">{tagline}</p>}
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-medium">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}><a href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{l.label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">© {year} {name}. All rights reserved.</div>
      </div>
    </footer>
  )
}

// ── APP blocks — common dashboard / web-app patterns (compose with the shadcn ui set) ──
export function PageHeader(props: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{props.title}</h1>
        {props.subtitle && <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p>}
      </div>
      {props.actions && <div className="flex items-center gap-2">{props.actions}</div>}
    </div>
  )
}

export function StatCard(props: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{props.label}</p>
        {props.icon}
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{props.value}</p>
      {props.hint && <p className="mt-1 text-xs text-muted-foreground">{props.hint}</p>}
    </div>
  )
}

export function EmptyState(props: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      {props.icon && <div className="mb-4 text-muted-foreground">{props.icon}</div>}
      <h3 className="text-base font-medium text-foreground">{props.title}</h3>
      {props.description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{props.description}</p>}
      {props.action && <div className="mt-5">{props.action}</div>}
    </div>
  )
}

// ── More website sections — FeatureGrid, CTA, FAQ (token-driven, content via props) ──
export function FeatureGrid(props: { items: { icon?: ReactNode; title: ReactNode; description: ReactNode }[]; columns?: 2 | 3 | 4 }) {
  const cols = props.columns ?? 3
  const cls = cols === 4 ? 'md:grid-cols-4' : cols === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'
  return (
    <div className={'grid grid-cols-1 gap-6 ' + cls}>
      {props.items.map((it, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-6">
          {it.icon && <div className="mb-4 text-primary">{it.icon}</div>}
          <h3 className="text-lg font-semibold text-foreground">{it.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{it.description}</p>
        </div>
      ))}
    </div>
  )
}

export function CTASection(props: { title: ReactNode; subtitle?: ReactNode; primary?: { label: string; href: string }; secondary?: { label: string; href: string } }) {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20 text-center">
      <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-foreground">{props.title}</h2>
      {props.subtitle && <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{props.subtitle}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {props.primary && <Link to={props.primary.href} className="inline-flex items-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">{props.primary.label}</Link>}
        {props.secondary && <Link to={props.secondary.href} className="inline-flex items-center rounded-md border border-border px-6 py-3 text-sm font-medium hover:bg-accent transition-colors">{props.secondary.label}</Link>}
      </div>
    </section>
  )
}

export function FAQ(props: { items: { q: ReactNode; a: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="mx-auto w-full max-w-3xl divide-y divide-border">
      {props.items.map((it, i) => (
        <div key={i} className="py-4">
          <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between text-left">
            <span className="text-base font-medium text-foreground">{it.q}</span>
            <span className="ml-4 text-muted-foreground">{open === i ? '−' : '+'}</span>
          </button>
          {open === i && <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{it.a}</p>}
        </div>
      ))}
    </div>
  )
}
`

// ── Q1: deterministic template fallback (P0-B terminal state) ─────────────────
// Baked into EVERY scaffold and validated at bake time — NEVER generated or assembled
// at runtime, so it carries zero regression risk. When the bounded repair budget is
// exhausted and a page still won't render, the pipeline swaps the offending page (or,
// if App itself is broken, App.tsx) to render THIS component, so the preview is never
// blank. Hard constraints that make it un-break-able:
//   • ZERO imports beyond React (no Tailwind — its pipeline may be the broken thing;
//     no lucide, no router, no tokens file). It compiles and paints on its own.
//   • Inline styles + ONE <style> tag only. Colors via CSS vars WITH hardcoded
//     fallbacks, so it looks right whether or not the app's :root tokens loaded.
//   • A pure-CSS breathing orb (signals "alive", not crashed) + a 20s self-reload so
//     it heals itself the moment a background fix lands. Confident copy — never
//     "error/failed/spinner".
const FALLBACK_TSX = `import { useEffect, type CSSProperties, type ReactNode } from 'react'

type FallbackSkill = 'website' | 'webapp' | 'game'

// A guaranteed-render "finishing touches" screen. Props are optional so it renders
// even if swapped in with no props. No imports beyond React → cannot fail to compile.
export default function Fallback({ brand = 'This project', skill = 'website' }: { brand?: string; skill?: FallbackSkill }) {
  useEffect(() => {
    // Self-healing: the moment a background repair lands, the next reload shows it.
    const t = setInterval(() => { try { location.reload() } catch (e) { void e } }, 20000)
    return () => clearInterval(t)
  }, [])

  const wrap: CSSProperties = {
    minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '1.5rem', padding: '2rem', textAlign: 'center',
    background: 'var(--cm-bg, var(--background, #0a0a0a))',
    color: 'var(--cm-fg, var(--foreground, #ededed))',
    fontFamily: 'var(--font-display, var(--font-body, system-ui, -apple-system, sans-serif))',
  }
  const orb: CSSProperties = {
    width: '84px', height: '84px', borderRadius: '9999px',
    background: 'radial-gradient(circle at 35% 35%, var(--primary, #6366f1), transparent 72%)',
    boxShadow: '0 0 60px 8px var(--primary, #6366f1)',
    animation: 'cm-breathe 2.8s ease-in-out infinite',
  }
  const title: CSSProperties = { fontSize: 'clamp(1.25rem, 3.5vw, 2rem)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }
  const sub: CSSProperties = { fontSize: '0.95rem', opacity: 0.62, margin: 0, maxWidth: '30rem' }

  let garnish: ReactNode = null
  if (skill === 'game') {
    garnish = <p style={{ ...sub, opacity: 0.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: '0.8rem' }}>Preparing the arena.</p>
  } else if (skill === 'webapp') {
    garnish = (
      <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.5rem' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: '150px', height: '92px', borderRadius: '14px', border: '1px solid var(--border, rgba(255,255,255,0.12))', background: 'var(--card, rgba(255,255,255,0.03))', overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, var(--primary, #6366f1), transparent)', opacity: 0.16, animation: 'cm-sweep 1.8s linear infinite' }} />
          </div>
        ))}
      </div>
    )
  } else {
    garnish = (
      <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap', justifyContent: 'center', opacity: 0.4, fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {['Home', 'About', 'Work', 'Contact'].map((s) => <span key={s}>{s}</span>)}
      </div>
    )
  }

  return (
    <div style={wrap}>
      <style>{\`@keyframes cm-breathe{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.16);opacity:1}}@keyframes cm-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}\`}</style>
      <div style={orb} aria-hidden="true" />
      <h1 style={title}>{brand} — putting on the finishing touches.</h1>
      <p style={sub}>This page refreshes itself.</p>
      {garnish}
    </div>
  )
}
`

// ── Q5: persistent utility CSS — the ~10 classes models keep re-inventing ─────
// Lives in its OWN file (main.tsx imports it AFTER index.css) — NOT in index.css,
// which the AI overwrites with brand tokens. Token-driven so it inherits each project's
// palette; the AI is TOLD these exist (GEN_SYSTEM) so it stops re-declaring them (a
// top source of undefined-class + truncated-keyframe build breaks). The semantic-gate's
// CSS-closure treats these as defined (knownCss includes this file) and won't duplicate.
const CM_UI_CSS = `/* Codemine UI utilities — persistent, token-driven. Do NOT edit index.css to add these. */

.gradient-text { background-image: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent, var(--primary)))); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.gradient-text-accent { background-image: linear-gradient(135deg, hsl(var(--accent, var(--primary))), hsl(var(--primary))); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }

.glass { background-color: hsl(var(--background) / 0.55); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid hsl(var(--border) / 0.4); }
.glass-strong { background-color: hsl(var(--background) / 0.8); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid hsl(var(--border) / 0.5); }

.glow-sm { box-shadow: 0 0 16px -4px hsl(var(--primary) / 0.45); }
.glow { box-shadow: 0 0 28px -4px hsl(var(--primary) / 0.5); }

.section { padding-top: 5rem; padding-bottom: 5rem; }
@media (min-width: 768px) { .section { padding-top: 7rem; padding-bottom: 7rem; } }
.container-page { width: 100%; max-width: 80rem; margin-left: auto; margin-right: auto; padding-left: 1.5rem; padding-right: 1.5rem; }

.img-scrim { position: relative; }
.img-scrim::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0) 60%); }

@keyframes cm-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes cm-shimmer { to { background-position: 200% center; } }
@keyframes cm-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes cm-pulse-slow { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

.animate-float { animation: cm-float 6s ease-in-out infinite; }
.animate-marquee { animation: cm-marquee 30s linear infinite; }
.animate-pulse-slow { animation: cm-pulse-slow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.text-shimmer { background: linear-gradient(90deg, hsl(var(--foreground)), hsl(var(--primary)), hsl(var(--foreground))); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: cm-shimmer 3s linear infinite; }
`

// ── Q5: pre-built 404 (websites/apps). The AI wires it as the catch-all route:
//   <Route path="*" element={<NotFound />} /> — no need to hand-write it each time.
const NOTFOUND_TSX = `import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div data-cm-notfound="1" className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">404</p>
      <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">This page wandered off</h1>
      <p className="max-w-md text-muted-foreground">The page you're looking for doesn't exist or may have moved.</p>
      <Link to="/" className="mt-2 inline-flex items-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">Back home</Link>
    </div>
  )
}
`

export const SCAFFOLD_FILES: Array<{ path: string; content: string }> = [
  {
    // Q1 template fallback — baked, validated once, swapped in at the P0-B terminal state.
    path: 'src/components/__fallback.tsx',
    content: FALLBACK_TSX,
  },
  {
    // Q5 persistent utilities (main.tsx imports this after index.css).
    path: 'src/styles/cm-ui.css',
    content: CM_UI_CSS,
  },
  {
    // Q5 pre-built 404 (excluded from games — imports react-router-dom).
    path: 'src/components/NotFound.tsx',
    content: NOTFOUND_TSX,
  },
  {
    path: 'src/components/blocks/index.tsx',
    content: BLOCKS_TSX,
  },
  {
    path: 'src/components/blocks/sections.tsx',
    content: BLOCKS_SECTIONS_TSX,
  },
  {
    // SPA fallback for Cloudflare Pages — every path serves index.html so client
    // routing + deep links work AND the user never sees Cloudflare's own 404 page
    // (whitelabel). The app's own catch-all <Route path="*"> renders the 404.
    path: 'public/_redirects',
    content: '/*    /index.html    200\n',
  },
  {
    path: 'index.html',
    content: INDEX_HTML,
  },
  {
    path: '.npmrc',
    content: 'prefer-offline=true\nshamefully-hoist=true\n',
  },
  {
    path: 'package.json',
    content: makePackageJson(), // unified — all project types
  },
  {
    path: 'vite.config.ts',
    content: `import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    port: 3000,
    // Bind 3000 or FAIL — never auto-increment to 3001 (the platform proxies a fixed
    // :3000, so a drifted port = permanent 502 on a live-but-unreachable server).
    strictPort: true,
    // DISABLE_HMR=true (set only while the agent is writing files) turns off HMR + file
    // watching so the preview never reloads a half-written file mid-generation. Unset =
    // normal HMR (current behavior). This enables "boot the dev server first, stream files
    // in silently, then one coordinated refresh" without the white-screen/error flash.
    hmr: process.env.DISABLE_HMR === 'true' ? false : { overlay: false },
    watch: process.env.DISABLE_HMR === 'true' ? null : undefined,
  },
})
`,
  },
  {
    path: 'tailwind.config.js',
    content: `/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every semantic token carries an inline FALLBACK, so a class like bg-background
        // / text-foreground can NEVER render invisible when the CSS var isn't defined —
        // e.g. a game whose index.css omits the tokens still gets a real color instead of
        // nothing. Deterministic safety net (the game skill also says to avoid these).
        border: 'hsl(var(--border, 214.3 31.8% 91.4%))',
        input: 'hsl(var(--input, 214.3 31.8% 91.4%))',
        ring: 'hsl(var(--ring, 221.2 83.2% 53.3%))',
        background: 'hsl(var(--background, 0 0% 100%))',
        foreground: 'hsl(var(--foreground, 222.2 84% 4.9%))',
        primary: { DEFAULT: 'hsl(var(--primary, 221.2 83.2% 53.3%))', foreground: 'hsl(var(--primary-foreground, 210 40% 98%))' },
        secondary: { DEFAULT: 'hsl(var(--secondary, 210 40% 96.1%))', foreground: 'hsl(var(--secondary-foreground, 222.2 47.4% 11.2%))' },
        destructive: { DEFAULT: 'hsl(var(--destructive, 0 84.2% 60.2%))', foreground: 'hsl(var(--destructive-foreground, 210 40% 98%))' },
        muted: { DEFAULT: 'hsl(var(--muted, 210 40% 96.1%))', foreground: 'hsl(var(--muted-foreground, 215.4 16.3% 46.9%))' },
        accent: { DEFAULT: 'hsl(var(--accent, 210 40% 96.1%))', foreground: 'hsl(var(--accent-foreground, 222.2 47.4% 11.2%))' },
        popover: { DEFAULT: 'hsl(var(--popover, 0 0% 100%))', foreground: 'hsl(var(--popover-foreground, 222.2 84% 4.9%))' },
        card: { DEFAULT: 'hsl(var(--card, 0 0% 100%))', foreground: 'hsl(var(--card-foreground, 222.2 84% 4.9%))' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
`,
  },
  {
    path: 'postcss.config.js',
    content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`,
  },
  {
    path: 'tsconfig.json',
    content: JSON.stringify(
      { files: [], references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }] },
      null, 2
    ),
  },
  {
    path: 'tsconfig.app.json',
    content: JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
          noFallthroughCasesInSwitch: true,
          baseUrl: '.',
          paths: { '@/*': ['./src/*'] },
        },
        include: ['src'],
      },
      null, 2
    ),
  },
  {
    path: 'tsconfig.node.json',
    content: JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2023'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          strict: true,
          noFallthroughCasesInSwitch: true,
          noUncheckedSideEffectImports: true,
        },
        include: ['vite.config.ts'],
      },
      null, 2
    ),
  },

  // ── base CSS — AI MUST override this with brand-specific variables ───────────
  {
    path: 'src/index.css',
    content: `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Default CSS variables — AI always overwrites this file with brand-specific values */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
  --radius: 0.5rem;
}

* { border-color: hsl(var(--border)); }

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  -webkit-font-smoothing: antialiased;
}
`,
  },

  // ── shadcn/ui utility ────────────────────────────────────────────────────────
  {
    path: 'src/lib/utils.ts',
    content: `import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`,
  },

  // ── shadcn/ui components ─────────────────────────────────────────────────────
  {
    path: 'src/components/ui/button.tsx',
    content: `import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
`,
  },
  {
    path: 'src/components/ui/card.tsx',
    content: `import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
  )
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
`,
  },
  {
    path: 'src/components/ui/input.tsx',
    content: `import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
`,
  },
  {
    path: 'src/components/ui/label.tsx',
    content: `import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const labelVariants = cva('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70')

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
`,
  },
  {
    path: 'src/components/ui/badge.tsx',
    content: `import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
`,
  },
  {
    path: 'src/components/ui/textarea.tsx',
    content: `import * as React from 'react'
import { cn } from '@/lib/utils'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export { Textarea }
`,
  },
  {
    path: 'src/components/ui/separator.tsx',
    content: `import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cn } from '@/lib/utils'

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]', className)}
    {...props}
  />
))
Separator.displayName = SeparatorPrimitive.Root.displayName

export { Separator }
`,
  },
  {
    path: 'src/components/ui/select.tsx',
    content: `import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn('flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1', className)}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild><ChevronDown className="h-4 w-4 opacity-50" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton ref={ref} className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}>
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton ref={ref} className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}>
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn('relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2', position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1', className)}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport className={cn('p-1', position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]')}>
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className)} {...props} />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item ref={ref} className={cn('relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}>
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator><Check className="h-4 w-4" /></SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton }
`,
  },
  {
    path: 'src/components/ui/dialog.tsx',
    content: `import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn('fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg', className)}
      {...props}
    >
      {children}
      <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogClose>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
`,
  },
  {
    path: 'src/components/ui/tabs.tsx',
    content: `import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root
const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  ({ className, ...props }, ref) => <TabsPrimitive.List ref={ref} className={cn('inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground', className)} {...props} />
)
TabsList.displayName = TabsPrimitive.List.displayName
const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  ({ className, ...props }, ref) => <TabsPrimitive.Trigger ref={ref} className={cn('inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm', className)} {...props} />
)
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName
const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  ({ className, ...props }, ref) => <TabsPrimitive.Content ref={ref} className={cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)} {...props} />
)
TabsContent.displayName = TabsPrimitive.Content.displayName
export { Tabs, TabsList, TabsTrigger, TabsContent }
`,
  },
  {
    path: 'src/components/ui/accordion.tsx',
    content: `import * as React from 'react'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const Accordion = AccordionPrimitive.Root
const AccordionItem = React.forwardRef<React.ElementRef<typeof AccordionPrimitive.Item>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>>(
  ({ className, ...props }, ref) => <AccordionPrimitive.Item ref={ref} className={cn('border-b', className)} {...props} />
)
AccordionItem.displayName = 'AccordionItem'
const AccordionTrigger = React.forwardRef<React.ElementRef<typeof AccordionPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger ref={ref} className={cn('flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180', className)} {...props}>
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
)
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName
const AccordionContent = React.forwardRef<React.ElementRef<typeof AccordionPrimitive.Content>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>>(
  ({ className, children, ...props }, ref) => (
    <AccordionPrimitive.Content ref={ref} className="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down" {...props}>
      <div className={cn('pb-4 pt-0', className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
)
AccordionContent.displayName = AccordionPrimitive.Content.displayName
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
`,
  },
  {
    path: 'src/components/ui/dropdown-menu.tsx',
    content: `import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
const DropdownMenuGroup = DropdownMenuPrimitive.Group
const DropdownMenuPortal = DropdownMenuPrimitive.Portal
const DropdownMenuSub = DropdownMenuPrimitive.Sub
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }>(
  ({ className, inset, children, ...props }, ref) => (
    <DropdownMenuPrimitive.SubTrigger ref={ref} className={cn('flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent', inset && 'pl-8', className)} {...props}>
      {children}<ChevronRight className="ml-auto h-4 w-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
)
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.SubContent>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>>(
  ({ className, ...props }, ref) => <DropdownMenuPrimitive.SubContent ref={ref} className={cn('z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2', className)} {...props} />
)
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>>(
  ({ className, sideOffset = 4, ...props }, ref) => (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn('z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2', className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  )
)
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Item>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }>(
  ({ className, inset, ...props }, ref) => <DropdownMenuPrimitive.Item ref={ref} className={cn('relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', inset && 'pl-8', className)} {...props} />
)
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>>(
  ({ className, children, checked, ...props }, ref) => (
    <DropdownMenuPrimitive.CheckboxItem ref={ref} className={cn('relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} checked={checked} {...props}>
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator><Check className="h-4 w-4" /></DropdownMenuPrimitive.ItemIndicator>
      </span>{children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
)
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>>(
  ({ className, children, ...props }, ref) => (
    <DropdownMenuPrimitive.RadioItem ref={ref} className={cn('relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}>
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator><Circle className="h-2 w-2 fill-current" /></DropdownMenuPrimitive.ItemIndicator>
      </span>{children}
    </DropdownMenuPrimitive.RadioItem>
  )
)
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Label>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }>(
  ({ className, inset, ...props }, ref) => <DropdownMenuPrimitive.Label ref={ref} className={cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', className)} {...props} />
)
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>>(
  ({ className, ...props }, ref) => <DropdownMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
)
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ml-auto text-xs tracking-widest opacity-60', className)} {...props} />
)
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut'

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup }
`,
  },
  {
    path: 'src/components/ui/switch.tsx',
    content: `import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitive.Root className={cn('peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input', className)} {...props} ref={ref}>
      <SwitchPrimitive.Thumb className={cn('pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0')} />
    </SwitchPrimitive.Root>
  )
)
Switch.displayName = SwitchPrimitive.Root.displayName
export { Switch }
`,
  },
  {
    path: 'src/components/ui/slider.tsx',
    content: `import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <SliderPrimitive.Root ref={ref} className={cn('relative flex w-full touch-none select-none items-center', className)} {...props}>
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
  )
)
Slider.displayName = SliderPrimitive.Root.displayName
export { Slider }
`,
  },
  {
    path: 'src/components/ui/tooltip.tsx',
    content: `import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger
const TooltipContent = React.forwardRef<React.ElementRef<typeof TooltipPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>>(
  ({ className, sideOffset = 4, ...props }, ref) => (
    <TooltipPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn('z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2', className)} {...props} />
  )
)
TooltipContent.displayName = TooltipPrimitive.Content.displayName
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
`,
  },
  {
    path: 'src/components/ui/avatar.tsx',
    content: `import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn } from '@/lib/utils'

const Avatar = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>>(
  ({ className, ...props }, ref) => <AvatarPrimitive.Root ref={ref} className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)} {...props} />
)
Avatar.displayName = AvatarPrimitive.Root.displayName
const AvatarImage = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Image>, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>>(
  ({ className, ...props }, ref) => <AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full', className)} {...props} />
)
AvatarImage.displayName = AvatarPrimitive.Image.displayName
const AvatarFallback = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Fallback>, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>>(
  ({ className, ...props }, ref) => <AvatarPrimitive.Fallback ref={ref} className={cn('flex h-full w-full items-center justify-center rounded-full bg-muted', className)} {...props} />
)
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName
export { Avatar, AvatarImage, AvatarFallback }
`,
  },
  {
    path: 'src/components/ui/progress.tsx',
    content: `import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@/lib/utils'

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>>(
  ({ className, value, ...props }, ref) => (
    <ProgressPrimitive.Root ref={ref} className={cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', className)} {...props}>
      <ProgressPrimitive.Indicator className="h-full w-full flex-1 bg-primary transition-all" style={{ transform: \`translateX(-\${100 - (value || 0)}%)\` }} />
    </ProgressPrimitive.Root>
  )
)
Progress.displayName = ProgressPrimitive.Root.displayName
export { Progress }
`,
  },
  {
    path: 'src/components/ui/table.tsx',
    content: `import * as React from 'react'
import { cn } from '@/lib/utils'

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => <div className="relative w-full overflow-auto"><table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} /></div>
)
Table.displayName = 'Table'
const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
)
TableHeader.displayName = 'TableHeader'
const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
)
TableBody.displayName = 'TableBody'
const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tfoot ref={ref} className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)} {...props} />
)
TableFooter.displayName = 'TableFooter'
const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />
)
TableRow.displayName = 'TableRow'
const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <th ref={ref} className={cn('h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0', className)} {...props} />
)
TableHead.displayName = 'TableHead'
const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn('p-4 align-middle [&:has([role=checkbox])]:pr-0', className)} {...props} />
)
TableCell.displayName = 'TableCell'
const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
)
TableCaption.displayName = 'TableCaption'
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
`,
  },
  {
    path: 'src/components/ui/checkbox.tsx',
    content: `import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <CheckboxPrimitive.Root ref={ref} className={cn('peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', className)} {...props}>
      <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
        <Check className="h-4 w-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
)
Checkbox.displayName = CheckboxPrimitive.Root.displayName
export { Checkbox }
`,
  },
  {
    path: 'src/components/ui/popover.tsx',
    content: `import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '@/lib/utils'

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverContent = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Content>, React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(
  ({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content ref={ref} align={align} sideOffset={sideOffset} className={cn('z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2', className)} {...props} />
    </PopoverPrimitive.Portal>
  )
)
PopoverContent.displayName = PopoverPrimitive.Content.displayName
export { Popover, PopoverTrigger, PopoverContent }
`,
  },
  {
    path: 'src/components/ui/scroll-area.tsx',
    content: `import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { cn } from '@/lib/utils'

const ScrollArea = React.forwardRef<React.ElementRef<typeof ScrollAreaPrimitive.Root>, React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>>(
  ({ className, children, ...props }, ref) => (
    <ScrollAreaPrimitive.Root ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
)
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>, React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>>(
  ({ className, orientation = 'vertical', ...props }, ref) => (
    <ScrollAreaPrimitive.ScrollAreaScrollbar ref={ref} orientation={orientation} className={cn('flex touch-none select-none transition-colors', orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]', orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]', className)} {...props}>
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
)
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName
export { ScrollArea, ScrollBar }
`,
  },
  {
    path: 'src/components/ui/radio-group.tsx',
    content: `import * as React from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

const RadioGroup = React.forwardRef<React.ElementRef<typeof RadioGroupPrimitive.Root>, React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>>(
  ({ className, ...props }, ref) => <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} ref={ref} />
)
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName
const RadioGroupItem = React.forwardRef<React.ElementRef<typeof RadioGroupPrimitive.Item>, React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>>(
  ({ className, ...props }, ref) => (
    <RadioGroupPrimitive.Item ref={ref} className={cn('aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', className)} {...props}>
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
)
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName
export { RadioGroup, RadioGroupItem }
`,
  },
  {
    path: 'src/components/ui/sheet.tsx',
    content: `import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>>(
  ({ className, ...props }, ref) => <SheetPrimitive.Overlay className={cn('fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)} {...props} ref={ref} />
)
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva('fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out', {
  variants: {
    side: {
      top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
      bottom: 'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
      left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
      right: 'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
    },
  },
  defaultVariants: { side: 'right' },
})

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>, VariantProps<typeof sheetVariants> {}
const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side = 'right', className, children, ...props }, ref) => (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        <SheetClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <X className="h-4 w-4" /><span className="sr-only">Close</span>
        </SheetClose>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
)
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
)
SheetHeader.displayName = 'SheetHeader'
const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
)
SheetFooter.displayName = 'SheetFooter'
const SheetTitle = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Title>, React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>>(
  ({ className, ...props }, ref) => <SheetPrimitive.Title ref={ref} className={cn('text-lg font-semibold text-foreground', className)} {...props} />
)
SheetTitle.displayName = SheetPrimitive.Title.displayName
const SheetDescription = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Description>, React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>>(
  ({ className, ...props }, ref) => <SheetPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
)
SheetDescription.displayName = SheetPrimitive.Description.displayName

export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
`,
  },
  {
    path: 'src/components/ui/skeleton.tsx',
    content: `import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}

export { Skeleton }
`,
  },
  {
    path: 'src/components/ui/alert.tsx',
    content: `import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva('relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground', {
  variants: {
    variant: {
      default: 'bg-background text-foreground',
      destructive: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
})

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(
  ({ className, variant, ...props }, ref) => <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
)
Alert.displayName = 'Alert'
const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h5 ref={ref} className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />
)
AlertTitle.displayName = 'AlertTitle'
const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
)
AlertDescription.displayName = 'AlertDescription'
export { Alert, AlertTitle, AlertDescription }
`,
  },
  {
    path: 'src/components/ui/toast.tsx',
    content: `// Toast utility: re-exports sonner's toast() for consistent import path.
// Usage: import { toast } from '@/components/ui/toast'
// Then: toast.success('Done!') / toast.error('Failed') / toast('Message')
// Requires <Toaster /> mounted in src/App.tsx: import { Toaster } from 'sonner'
export { toast } from 'sonner'
export type { ExternalToast } from 'sonner'
`,
  },
]

// Game loop engine — ALWAYS baked into every scaffold (unified). The rAF loop,
// fixed timestep, cleanup, high score, and sound are the #1 source of canvas-game
// bugs (double loops, blank screens, frame-dependent speed). Baking it once means
// the AI only writes update()/draw() — not the error-prone plumbing. Websites and
// webapps that don't import it pay zero bundle cost (Vite tree-shakes it entirely).
const GAME_ENGINE_TS = `import { useEffect, useRef, useState, useCallback } from 'react'

// ── Tuned game constants (IMPORT these — never guess magic numbers) ──
// The loop is fixed-timestep, so these are frame-rate INDEPENDENT: speeds are px/step,
// spawn intervals are ms. Guessing these from prose is the #1 cause of a "turtle-slow"
// or impossible game. Import the entry for your game type and tune from a sane baseline.
export const SPEEDS = {
  flappy: { gravity: 0.5, flap: -8, pipe: 3 },
  runner: { base: 6, gravity: 1.1, jump: -18 },
  snake: { stepMs: 110 },
  pong: { ball: 6, paddle: 8 },
  breakout: { ball: 5, paddle: 9 },
  spaceShooter: { player: 6, bullet: 9, enemy: 2 },
  balloon: { rise: 2.2 },
  platformer: { runAccel: 0.55, runMax: 7, gravity: 0.55, jump: -13, coyoteMs: 120, jumpBufferMs: 100 },
} as const

export const SPAWN = {
  flappyPipeMs: 1500,
  balloonMs: 900,
  asteroidMs: 1100,
  coinMs: 1300,
  enemyMs: 1000,
} as const

// Fixed-timestep game loop with a correct lifecycle. update(stepMs) runs at a fixed
// 1/60s step (frame-rate INDEPENDENT — no double-speed on fast monitors); draw(alpha)
// renders with interpolation. Pass running=false to stop (e.g. GameOver/Paused). The
// rAF is always cancelled on unmount or when running flips — TWO loops can never run.
export function useGameLoop(opts: { update: (stepMs: number) => void; draw: (alpha: number) => void; running: boolean; step?: number }) {
  const { update, draw, running, step = 1000 / 60 } = opts
  const rafRef = useRef<number | null>(null)
  const updRef = useRef(update); updRef.current = update
  const drawRef = useRef(draw); drawRef.current = draw
  useEffect(() => {
    if (!running) return
    let last = performance.now()
    let acc = 0
    const frame = (now: number) => {
      acc += Math.min(now - last, 250) // clamp big gaps (tab switch) so physics never explodes
      last = now
      while (acc >= step) { updRef.current(step); acc -= step }
      drawRef.current(acc / step)
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [running, step])
}

// Persistent high score (localStorage). Returns [high, submit].
export function useHighScore(key: string) {
  const [high, setHigh] = useState(0)
  useEffect(() => { setHigh(Number(localStorage.getItem(key) || 0)) }, [key])
  const submit = useCallback((score: number) => {
    setHigh((h) => { const n = Math.max(h, score); if (n !== h) localStorage.setItem(key, String(n)); return n })
  }, [key])
  return [high, submit] as const
}

// Tiny Web Audio blip — gated behind the first user gesture (autoplay policy). Call
// playTone(440) for jump, etc. Never throws if audio is not yet unlocked.
let _ctx: AudioContext | null = null
function audioCtx(): AudioContext {
  if (!_ctx) _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  return _ctx
}
export function playTone(freq: number, ms = 90, type: OscillatorType = 'square', vol = 0.07) {
  try {
    const c = audioCtx(); const o = c.createOscillator(); const g = c.createGain()
    o.type = type; o.frequency.value = freq; g.gain.value = vol
    o.connect(g); g.connect(c.destination); o.start()
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000)
    o.stop(c.currentTime + ms / 1000)
  } catch { /* audio not unlocked yet */ }
}

// ── Collision — precise, sprite-tight (use these, don't eyeball boxes) ──
export function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}
export function circlesHit(ax: number, ay: number, ar: number, bx: number, by: number, br: number) {
  const dx = ax - bx, dy = ay - by
  return dx * dx + dy * dy <= (ar + br) * (ar + br)
}

// ── Screen shake — add(n) on impact, offset ctx by tick() each frame (decays) ──
export function useShake() {
  const v = useRef(0)
  return {
    add: (n: number) => { v.current = Math.max(v.current, n) },
    tick: () => { v.current *= 0.9; if (v.current < 0.1) v.current = 0; return v.current },
    get value() { return v.current },
  }
}

// ── Pooled particle burst (score/death juice) — no per-frame alloc after warmup ──
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }
export function burst(out: Particle[], x: number, y: number, n: number, color: string) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4
    out.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color, size: 2 + Math.random() * 3 })
  }
}
export function stepParticles(ps: Particle[], gravity = 0.15) {
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i]; p.vy += gravity; p.x += p.vx; p.y += p.vy; p.life -= 0.02
    if (p.life <= 0) ps.splice(i, 1)
  }
}

// ── Vehicle / physics game helpers ───────────────────────────────────────────
// Pre-written for hill-climb, racer, physics-puzzle types.
// generateTerrain returns a Float32Array of canvas y-values (one per x-pixel).
// terrainYAt does linear interpolation for sub-pixel positions.
// Use in update(): const ty = terrainYAt(terrain, vehicle.x); land if vehicle.y+r > ty.

export function generateTerrain(totalWidth: number, canvasH: number, seed = 42): Float32Array {
  const terrain = new Float32Array(totalWidth)
  const baseline = canvasH * 0.62
  let h = baseline, amp = canvasH * 0.18, freq = 0.008, r = seed
  // Seeded LCG so terrain is reproducible
  const rand = () => { r = (r * 1664525 + 1013904223) & 0xffffffff; return (r >>> 0) / 0xffffffff }
  // Layered sine + noise for natural hills
  for (let x = 0; x < totalWidth; x++) {
    const s1 = Math.sin(x * freq + rand() * 0.002) * amp
    const s2 = Math.sin(x * freq * 2.7 + 1.2) * amp * 0.35
    const s3 = Math.sin(x * freq * 0.3 + 4.1) * amp * 0.55
    terrain[x] = Math.max(canvasH * 0.35, Math.min(canvasH * 0.85, baseline + s1 + s2 + s3))
  }
  // Smooth pass (3-sample moving average)
  for (let x = 1; x < totalWidth - 1; x++) terrain[x] = (terrain[x-1] + terrain[x] + terrain[x+1]) / 3
  return terrain
}

export function terrainYAt(terrain: Float32Array, x: number, totalWidth: number): number {
  const xi = Math.max(0, Math.min(totalWidth - 2, Math.floor(x)))
  const t = x - xi
  return terrain[xi] * (1 - t) + terrain[xi + 1] * t
}

// Tuned constants for physics games (px/frame at 60fps):
export const VEHICLE_PHYSICS = {
  gravity: 0.35,    // downward pull each frame
  thrust: 0.18,     // acceleration when gas held
  friction: 0.985,  // vx decay (higher = less slippy)
  bounce: 0.2,      // vy restitution on terrain contact
  crashVy: 9,       // vy threshold for crash on landing
  maxVy: 14,
  wheelR: 18,       // wheel radius (px), used for collision offset
  fuelDrain: 0.14,  // fuel per frame while thrusting
} as const
`

// FILE-BASED ROUTER (scaffold-owned, read-only for ALL project types — Fable step 2/G14).
// Every src/pages/*.tsx is auto-routed by filename: Home.tsx → "/", About.tsx → "/about",
// Menu.tsx → "/menu". Games: src/pages/Home.tsx mounts the canvas — the router renders it
// at "/" exactly like a website page. Optional global chrome lives in src/components/Layout.tsx.
// Model ONLY adds page files + Layout, NEVER writes this file — where recurring App.tsx
// errors originated (unescaped quotes, missing imports, route/import mismatches).
export const APP_TSX_ROUTER = `import { Routes, Route } from 'react-router-dom'
import type { ComponentType, ReactNode } from 'react'
import NotFound from './components/NotFound'

const pageModules = import.meta.glob('./pages/*.tsx', { eager: true }) as Record<string, { default: ComponentType }>
const layoutModules = import.meta.glob('./components/Layout.tsx', { eager: true }) as Record<string, { default: ComponentType<{ children: ReactNode }> }>

const routes = Object.entries(pageModules)
  .map(([file, mod]) => {
    const name = (file.split('/').pop() || '').replace(/\\.tsx$/, '')
    const lower = name.toLowerCase()
    const path = lower === 'home' || lower === 'index' ? '/' : '/' + lower
    return { path, Component: mod && mod.default }
  })
  .filter((r) => Boolean(r.Component))

const Layout = Object.values(layoutModules)[0] && Object.values(layoutModules)[0].default

export default function App() {
  const content = (
    <Routes>
      {routes.map((r) => (
        <Route key={r.path} path={r.path} element={<r.Component />} />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
  return Layout ? <Layout>{content}</Layout> : content
}
`

// Unified scaffold — one set of files for ALL project types (website, webapp, game).
// Classification is advisory for content/skill-pack only; the scaffold is identical.
// A game is just src/pages/Home.tsx mounting a canvas — the router renders it at "/".
// No variant, no branch, no classification error possible.
export function getScaffoldFiles(): Array<{ path: string; content: string }> {
  const mainTsx = { path: 'src/main.tsx', content: makeMainTsx() }
  // Game engine always present — tree-shaken if unused by websites/webapps (~0 bundle cost).
  const engineTs = { path: 'src/components/game/engine.ts', content: GAME_ENGINE_TS }
  return [...SCAFFOLD_FILES, engineTs, mainTsx, { path: 'src/App.tsx', content: APP_TSX_ROUTER }]
}

// Deterministic set of every scaffold file path — used by the import-closure
// pass to know which imported files already exist and must NOT be regenerated.
export const SCAFFOLD_PATH_SET: ReadonlySet<string> = new Set([
  'index.html',
  '.npmrc',
  'package.json',
  'vite.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'src/index.css',
  'src/styles/cm-ui.css',
  'src/main.tsx',
  'src/lib/utils.ts',
  'src/components/__fallback.tsx',
  'src/components/NotFound.tsx',
  'src/components/blocks/index.tsx',
  'src/components/blocks/sections.tsx',
  'src/components/game/engine.ts',
  'public/_redirects',
  'src/components/ui/button.tsx',
  'src/components/ui/card.tsx',
  'src/components/ui/input.tsx',
  'src/components/ui/label.tsx',
  'src/components/ui/badge.tsx',
  'src/components/ui/textarea.tsx',
  'src/components/ui/separator.tsx',
  'src/components/ui/select.tsx',
  'src/components/ui/dialog.tsx',
  'src/components/ui/tabs.tsx',
  'src/components/ui/accordion.tsx',
  'src/components/ui/dropdown-menu.tsx',
  'src/components/ui/switch.tsx',
  'src/components/ui/slider.tsx',
  'src/components/ui/tooltip.tsx',
  'src/components/ui/avatar.tsx',
  'src/components/ui/progress.tsx',
  'src/components/ui/table.tsx',
  'src/components/ui/checkbox.tsx',
  'src/components/ui/popover.tsx',
  'src/components/ui/scroll-area.tsx',
  'src/components/ui/radio-group.tsx',
  'src/components/ui/sheet.tsx',
  'src/components/ui/skeleton.tsx',
  'src/components/ui/alert.tsx',
  'src/components/ui/toast.tsx',
])
