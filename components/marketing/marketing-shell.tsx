'use client'

/**
 * Marketing theme shell — a LIGHT/DARK theming layer scoped to the marketing
 * site only. It never touches the builder's theme (which toggles `.dark` on
 * <html>). Instead everything here is driven by a `dark` class on a marketing
 * ROOT wrapper (`#cm-site.cm-site`), and the theme-sensitive colours are read
 * from CSS custom properties defined on that wrapper. Flipping the `dark` class
 * flips every token at once.
 *
 * Default is DARK. A tiny inline no-flash script sets the class before paint on
 * first load from localStorage ('cm-site-theme', default 'dark'); an isomorphic
 * layout effect keeps it correct across client-side navigation.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { MoonIcon, SunIcon } from 'lucide-react'
import { StarField } from '@/components/ui/futurastic-hero-section'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'cm-site-theme'

type Theme = 'light' | 'dark'

// Runs before paint on the client, harmlessly falls back on the server.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// Semantic theme tokens. DARK is the default aurora look; LIGHT is a clean,
// warm/cream look. In dark mode the page base is transparent so the fixed
// StarField shows through every section; in light mode it is warm cream.
const THEME_CSS = `
.cm-site {
  --cm-page: #faf9f7;
  --cm-heading: #0f172a;
  --cm-body: #3f3f46;
  --cm-muted: #52525b;
  --cm-faint: #6b7280;
  --cm-accent: #2563eb;
  --cm-card: #ffffff;
  --cm-card-hover: #f6f5f3;
  --cm-inset: rgba(0,0,0,0.03);
  --cm-wash: rgba(120,113,108,0.06);
  --cm-hover: rgba(0,0,0,0.05);
  --cm-nav: rgba(255,255,255,0.72);
  --cm-border: rgba(0,0,0,0.08);
  --cm-border-soft: rgba(0,0,0,0.06);
  --cm-border-strong: rgba(0,0,0,0.16);
  --cm-panel: #ffffff;
  --cm-panel-heading: #0f172a;
  --cm-panel-body: #52525b;
  --cm-panel-border: rgba(0,0,0,0.08);
  --cm-panel-inset: rgba(0,0,0,0.03);
  --cm-panel-bar: rgba(0,0,0,0.10);
  --cm-panel-bar-soft: rgba(0,0,0,0.06);
  --cm-fade: #faf9f7;
  --cm-stat-to: #2563eb;
  /* Hero / brand gradient — deep, saturated blue→indigo→violet for the cream bg. */
  --cm-grad-from: #2563eb;
  --cm-grad-via: #4f46e5;
  --cm-grad-to: #7c3aed;
  color-scheme: light;
}
.cm-site.dark {
  --cm-page: transparent;
  --cm-heading: #ffffff;
  --cm-body: #d4d4d8;
  --cm-muted: #a1a1aa;
  --cm-faint: #71717a;
  --cm-accent: #60a5fa;
  --cm-card: rgba(255,255,255,0.03);
  --cm-card-hover: rgba(255,255,255,0.05);
  --cm-inset: rgba(255,255,255,0.04);
  --cm-wash: rgba(255,255,255,0.02);
  --cm-hover: rgba(255,255,255,0.10);
  --cm-nav: rgba(255,255,255,0.06);
  --cm-border: rgba(255,255,255,0.10);
  --cm-border-soft: rgba(255,255,255,0.06);
  --cm-border-strong: rgba(255,255,255,0.20);
  --cm-panel: #0a0f22;
  --cm-panel-heading: #ffffff;
  --cm-panel-body: rgba(255,255,255,0.70);
  --cm-panel-border: rgba(255,255,255,0.10);
  --cm-panel-inset: rgba(255,255,255,0.04);
  --cm-panel-bar: rgba(255,255,255,0.15);
  --cm-panel-bar-soft: rgba(255,255,255,0.10);
  --cm-fade: #04060f;
  --cm-stat-to: #bfdbfe;
  /* Hero / brand gradient — luminous sky→blue→indigo for the aurora dark bg. */
  --cm-grad-from: #7dd3fc;
  --cm-grad-via: #60a5fa;
  --cm-grad-to: #818cf8;
  color-scheme: dark;
}
/* Starfield + aurora are a dark-mode feature only. */
.cm-site:not(.dark) .cm-starfield,
.cm-site:not(.dark) .cm-aurora { display: none; }
/* Light-mode-only decor (e.g. the light hero wash) is hidden in dark mode. */
.cm-site.dark .cm-light-only { display: none; }
/* Soften the strong blue radial overlays on light panels. */
.cm-site:not(.dark) .cm-panel-glow { opacity: 0.5; }
`

// Sets the class before first paint (default dark). Kept tiny + defensive.
const NO_FLASH = `try{var e=document.getElementById('cm-site');if(e&&localStorage.getItem('${STORAGE_KEY}')==='light'){e.classList.remove('dark')}}catch(_){}`

type Ctx = { theme: Theme; toggle: () => void }
const MarketingThemeContext = createContext<Ctx | null>(null)

export function useMarketingTheme(): Ctx {
  const ctx = useContext(MarketingThemeContext)
  // Tolerate being used outside a provider (no-op) so it never crashes.
  return ctx ?? { theme: 'dark', toggle: () => {} }
}

export function MarketingRoot({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  // Default DARK. SSR + first client render render dark; the no-flash script
  // corrects to light before paint for returning light-mode visitors, and the
  // layout effect below reconciles React state without a flash.
  const [theme, setTheme] = useState<Theme>('dark')

  useIsoLayoutEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setTheme(stored === 'light' ? 'light' : 'dark')
  }, [])

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  return (
    <MarketingThemeContext.Provider value={{ theme, toggle }}>
      <div
        id="cm-site"
        suppressHydrationWarning
        className={cn(
          'cm-site relative min-h-screen bg-[var(--cm-page)] text-[var(--cm-body)]',
          theme === 'dark' && 'dark',
          className,
        )}
      >
        {/* No-flash: applies the saved theme before paint on first load. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
        <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
        <StarField />
        {children}
      </div>
    </MarketingThemeContext.Provider>
  )
}

/**
 * SiteThemeToggle — a small sun/moon button for the marketing nav. Scoped to
 * the marketing theme; it never touches the builder's <html> `.dark` class.
 */
export function SiteThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useMarketingTheme()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
      className={cn(
        'flex size-9 items-center justify-center rounded-full text-[var(--cm-muted)] transition-colors hover:bg-[var(--cm-hover)] hover:text-[var(--cm-heading)]',
        className,
      )}
    >
      {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </button>
  )
}
