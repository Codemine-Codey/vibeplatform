import type { Template } from './types'

const BRAND_TS = `
// PERSONALITY FILE 1/2 — AI writes this.

export const BRAND = {
  name:      'Ember & Oak',
  tagline:   'Wood-fired. Soul-fed.',
  accent:    '#D97706',   // warm amber
  accent2:   '#92400E',   // deep mahogany
  bg:        '#0C0A07',
  surface:   '#1A1410',
  surface2:  '#251C14',
  border:    '#3D2E1E',
  text:      '#FEF3C7',
  muted:     '#92816A',
  fonts: {
    display: "'Playfair Display', serif",
    body:    "'Lato', sans-serif",
    accent:  "'Cormorant Garamond', serif",
    import:  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lato:wght@300;400;700&family=Cormorant+Garamond:ital,wght@0,300;1,400&display=swap",
  },
}
`.trim()

const CONTENT_TS = `
// PERSONALITY FILE 2/2 — AI writes this.

export const CONTENT = {
  nav: {
    links: ['Menu', 'About', 'Reservations', 'Contact'],
    cta:   'Reserve a Table',
  },
  hero: {
    eyebrow:  'Est. 2019 · Wood-Fired Kitchen',
    headline: 'Where every\nmeal becomes\na memory',
    sub:      'Slow-cooked, fire-kissed, and crafted with ingredients from local farms within 50 miles.',
    cta1:     'Reserve a Table',
    cta2:     'View Menu',
    badge1:   { value: '4.9★', label: 'Guest Rating' },
    badge2:   { value: '8 min', label: 'Avg. wait' },
    badge3:   { value: '100%', label: 'Local sourced' },
  },
  about: {
    eyebrow:  'Our Story',
    headline: 'Cooking with fire,\nserving with heart',
    body:     [
      'We believe food is a language. At Ember & Oak, every dish speaks of the land it came from — the farmers who rose at dawn, the seasons that shaped each ingredient.',
      'Our wood-fired hearth burns oak and cherry wood, coaxing flavors that no gas flame can replicate. This is slow food in a fast world.',
    ],
    stats: [
      { value: '12', label: 'Local Farm Partners' },
      { value: '5', label: 'Years of Craft' },
      { value: '32', label: 'Menu Staples' },
    ],
  },
  menu: {
    title: 'Curated Flavors',
    sub:   'Our menu changes with the seasons. These are today\\'s signatures.',
    categories: [
      {
        name: 'Small Plates',
        items: [
          { name: 'Ember-Roasted Beet', price: '$14', desc: 'Aged goat cheese, walnut crumble, wildflower honey' },
          { name: 'Wood-Fired Sourdough', price: '$9', desc: 'House-cultured butter, flaked sea salt, fresh herbs' },
          { name: 'Coal-Seared Scallops', price: '$22', desc: 'Saffron beurre blanc, microgreens, lemon zest' },
        ],
      },
      {
        name: 'Mains',
        items: [
          { name: 'Ribeye au Feu', price: '$58', desc: '42-day dry-aged, oak-smoked compound butter, roasted marrow' },
          { name: 'Roasted Lamb Rack', price: '$46', desc: 'Herb crust, pomegranate jus, roasted root vegetables' },
          { name: 'Foragers Risotto', price: '$32', desc: 'Wild mushroom, truffle oil, aged parmesan, herb oil (v)' },
        ],
      },
      {
        name: 'Desserts',
        items: [
          { name: 'Burnt Honey Tart', price: '$14', desc: 'Mascarpone, candied walnuts, honeycomb' },
          { name: 'Smoked Chocolate', price: '$12', desc: 'Cherry compote, crème fraîche, cocoa tuile' },
        ],
      },
    ],
  },
  gallery: [
    { caption: 'The hearth' },
    { caption: 'Seasonal ingredients' },
    { caption: 'Private dining' },
    { caption: 'Chef at work' },
  ],
  reservations: {
    title: 'Secure Your Table',
    sub:   'We seat 48 guests. Reservations are strongly recommended.',
    hours: [
      { days: 'Tue – Thu', time: '5:30 PM – 10:00 PM' },
      { days: 'Fri – Sat', time: '5:00 PM – 11:00 PM' },
      { days: 'Sunday',    time: '4:00 PM – 9:00 PM'  },
    ],
    phone: '+1 (555) 291-4830',
    note:  'For groups of 8+, please call us directly.',
  },
  footer: {
    address: '142 Oak Street, Portland, OR 97201',
    phone:   '+1 (555) 291-4830',
    email:   'hello@emberoakpdx.com',
    social:  ['Instagram', 'Facebook', 'Yelp'],
  },
}
`.trim()

const NAV_TSX = /* tsx */ `
import { BRAND } from '../brand'
import { CONTENT } from '../content'

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5"
      style={{ background: \`\${BRAND.bg}e8\`, backdropFilter: 'blur(16px)', borderBottom: \`1px solid \${BRAND.border}55\` }}>
      <a href="#" className="flex flex-col leading-none">
        <span className="text-xl font-bold tracking-tight" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>{BRAND.name}</span>
        <span className="text-xs tracking-[0.2em] uppercase" style={{ color: BRAND.muted, fontFamily: BRAND.fonts.body }}>{BRAND.tagline}</span>
      </a>
      <div className="hidden md:flex items-center gap-7">
        {CONTENT.nav.links.map(l => (
          <a key={l} href={\`#\${l.toLowerCase()}\`} className="text-sm tracking-wide transition-colors hover:opacity-100 opacity-50"
            style={{ color: BRAND.text, fontFamily: BRAND.fonts.body }}>{l}</a>
        ))}
      </div>
      <a href="#reservations"
        className="px-5 py-2.5 rounded-none text-xs font-semibold tracking-[0.15em] uppercase transition-all hover:opacity-90"
        style={{ background: BRAND.accent, color: BRAND.bg, fontFamily: BRAND.fonts.body }}>
        {CONTENT.nav.cta}
      </a>
    </nav>
  )
}
`.trim()

const HERO_TSX = /* tsx */ `
import { BRAND } from '../brand'
import { CONTENT } from '../content'

export function Hero() {
  const h = CONTENT.hero
  const lines = h.headline.split('\\n')
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-20 overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute inset-0" style={{ background: \`radial-gradient(ellipse at 50% 30%, \${BRAND.accent}18 0%, transparent 70%)\` }} />
        <div className="absolute bottom-0 left-0 right-0 h-40"
          style={{ background: \`linear-gradient(transparent, \${BRAND.bg})\` }} />
      </div>

      <div className="relative z-10 max-w-3xl">
        <p className="text-xs tracking-[0.3em] uppercase mb-6"
          style={{ color: BRAND.accent, fontFamily: BRAND.fonts.body }}>{h.eyebrow}</p>

        <h1 className="mb-8 leading-tight"
          style={{ fontFamily: BRAND.fonts.display, color: BRAND.text, fontSize: 'clamp(3rem, 8vw, 6rem)', fontStyle: 'italic' }}>
          {lines.map((line, i) => <span key={i} className="block">{line}</span>)}
        </h1>

        <p className="text-lg mb-10 max-w-xl mx-auto leading-relaxed"
          style={{ color: BRAND.muted, fontFamily: BRAND.fonts.body, fontWeight: 300 }}>{h.sub}</p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-14">
          <a href="#reservations"
            className="px-10 py-4 text-sm font-semibold tracking-[0.15em] uppercase transition-all hover:opacity-90"
            style={{ background: BRAND.accent, color: BRAND.bg, fontFamily: BRAND.fonts.body }}>
            {h.cta1}
          </a>
          <a href="#menu"
            className="px-10 py-4 text-sm tracking-[0.15em] uppercase transition-all hover:border-current"
            style={{ border: \`1px solid \${BRAND.border}\`, color: BRAND.text, fontFamily: BRAND.fonts.body }}>
            {h.cta2}
          </a>
        </div>

        <div className="flex items-center justify-center gap-10">
          {[h.badge1, h.badge2, h.badge3].map((b, i) => (
            <div key={i} className="text-center">
              <p className="text-2xl font-bold" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>{b.value}</p>
              <p className="text-xs tracking-wide" style={{ color: BRAND.muted }}>{b.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
`.trim()

const MENU_TSX = /* tsx */ `
import { BRAND } from '../brand'
import { CONTENT } from '../content'

export function Menu() {
  const m = CONTENT.menu
  return (
    <section id="menu" className="py-28 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs tracking-[0.3em] uppercase mb-3" style={{ color: BRAND.accent, fontFamily: BRAND.fonts.body }}>Seasonal Selection</p>
          <h2 className="text-4xl md:text-5xl mb-4" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text, fontStyle: 'italic' }}>{m.title}</h2>
          <p style={{ color: BRAND.muted }}>{m.sub}</p>
        </div>

        <div className="space-y-12">
          {m.categories.map(cat => (
            <div key={cat.name}>
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px flex-1" style={{ background: BRAND.border }} />
                <p className="text-xs tracking-[0.3em] uppercase" style={{ color: BRAND.muted, fontFamily: BRAND.fonts.body }}>{cat.name}</p>
                <div className="h-px flex-1" style={{ background: BRAND.border }} />
              </div>
              <div className="space-y-4">
                {cat.items.map(item => (
                  <div key={item.name} className="flex items-start justify-between gap-6 py-3"
                    style={{ borderBottom: \`1px solid \${BRAND.border}55\` }}>
                    <div className="flex-1">
                      <p className="font-semibold mb-0.5" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>{item.name}</p>
                      <p className="text-sm" style={{ color: BRAND.muted, fontFamily: BRAND.fonts.body }}>{item.desc}</p>
                    </div>
                    <p className="font-semibold shrink-0" style={{ color: BRAND.accent, fontFamily: BRAND.fonts.display }}>{item.price}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
`.trim()

const ABOUT_TSX = /* tsx */ `
import { BRAND } from '../brand'
import { CONTENT } from '../content'

export function About() {
  const a = CONTENT.about
  const lines = a.headline.split('\\n')
  return (
    <section id="about" className="py-28 px-6" style={{ background: BRAND.surface }}>
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-xs tracking-[0.3em] uppercase mb-4" style={{ color: BRAND.accent }}>{a.eyebrow}</p>
          <h2 className="text-4xl leading-tight mb-6" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text, fontStyle: 'italic' }}>
            {lines.map((l, i) => <span key={i} className="block">{l}</span>)}
          </h2>
          {a.body.map((p, i) => (
            <p key={i} className="mb-4 leading-relaxed" style={{ color: BRAND.muted, fontFamily: BRAND.fonts.body, fontWeight: 300 }}>{p}</p>
          ))}
        </div>
        <div className="space-y-6">
          {a.stats.map(s => (
            <div key={s.label} className="p-6 rounded-sm flex gap-5 items-center"
              style={{ background: BRAND.surface2, borderLeft: \`3px solid \${BRAND.accent}\` }}>
              <p className="text-5xl font-bold" style={{ fontFamily: BRAND.fonts.display, color: BRAND.accent }}>{s.value}</p>
              <p className="text-sm" style={{ color: BRAND.muted }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
`.trim()

const RESERVATIONS_TSX = /* tsx */ `
import { BRAND } from '../brand'
import { CONTENT } from '../content'

export function Reservations() {
  const r = CONTENT.reservations
  return (
    <section id="reservations" className="py-28 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-xs tracking-[0.3em] uppercase mb-3" style={{ color: BRAND.accent }}>{r.title}</p>
        <h2 className="text-4xl md:text-5xl mb-4 italic" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>{r.title}</h2>
        <p className="mb-12" style={{ color: BRAND.muted }}>{r.sub}</p>

        <div className="mb-10 space-y-3">
          {r.hours.map(h => (
            <div key={h.days} className="flex items-center justify-between py-3 px-6 rounded-sm"
              style={{ background: BRAND.surface, border: \`1px solid \${BRAND.border}\` }}>
              <p className="text-sm font-semibold" style={{ color: BRAND.text }}>{h.days}</p>
              <p className="text-sm" style={{ color: BRAND.muted }}>{h.time}</p>
            </div>
          ))}
        </div>

        <a href={\`tel:\${r.phone}\`}
          className="inline-block px-12 py-4 text-sm font-semibold tracking-[0.15em] uppercase transition-all hover:opacity-90 mb-4"
          style={{ background: BRAND.accent, color: BRAND.bg }}>
          Call {r.phone}
        </a>
        <p className="text-xs" style={{ color: BRAND.muted }}>{r.note}</p>
      </div>
    </section>
  )
}
`.trim()

const FOOTER_TSX = /* tsx */ `
import { BRAND } from '../brand'
import { CONTENT } from '../content'

export function Footer() {
  const f = CONTENT.footer
  return (
    <footer className="py-14 px-6 text-center" style={{ background: BRAND.surface, borderTop: \`1px solid \${BRAND.border}\` }}>
      <p className="text-2xl italic mb-2" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>{BRAND.name}</p>
      <p className="text-xs tracking-[0.2em] uppercase mb-6" style={{ color: BRAND.muted }}>{BRAND.tagline}</p>
      <p className="text-sm mb-1" style={{ color: BRAND.muted }}>{f.address}</p>
      <a href={\`tel:\${f.phone}\`} className="text-sm transition-opacity hover:opacity-100 opacity-70" style={{ color: BRAND.muted }}>{f.phone}</a>
      <div className="flex items-center justify-center gap-4 mt-6">
        {f.social.map(s => (
          <a key={s} href="#" className="text-xs tracking-widest uppercase transition-opacity hover:opacity-100 opacity-40"
            style={{ color: BRAND.text }}>{s}</a>
        ))}
      </div>
      <p className="text-xs mt-8 opacity-30" style={{ color: BRAND.muted }}>© {new Date().getFullYear()} {BRAND.name}</p>
    </footer>
  )
}
`.trim()

const HOME_TSX = /* tsx */ `
import { Hero } from '../components/Hero'
import { Menu } from '../components/Menu'
import { About } from '../components/About'
import { Reservations } from '../components/Reservations'
import { Footer } from '../components/Footer'

export function Home() {
  return (
    <>
      <Hero />
      <Menu />
      <About />
      <Reservations />
      <Footer />
    </>
  )
}
`.trim()

const APP_TSX = /* tsx */ `
import { Nav } from './components/Nav'
import { Home } from './pages/Home'
import { BRAND } from './brand'

export default function App() {
  return (
    <div style={{ background: BRAND.bg, fontFamily: BRAND.fonts.body, color: BRAND.text }}>
      <Nav />
      <Home />
    </div>
  )
}
`.trim()

const INDEX_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{-webkit-font-smoothing:antialiased}
`.trim()

const MAIN_TSX = `
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
`.trim()

const INDEX_HTML = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Restaurant</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`.trim()

export const restaurantTemplate: Template = {
  id: 'website-restaurant',
  name: 'Restaurant Website',
  skill: 'website',
  scaffoldFiles: [
    { path: 'index.html',                        content: INDEX_HTML         },
    { path: 'src/main.tsx',                      content: MAIN_TSX           },
    { path: 'src/App.tsx',                       content: APP_TSX            },
    { path: 'src/index.css',                     content: INDEX_CSS          },
    { path: 'src/pages/Home.tsx',                content: HOME_TSX           },
    { path: 'src/components/Nav.tsx',            content: NAV_TSX            },
    { path: 'src/components/Hero.tsx',           content: HERO_TSX           },
    { path: 'src/components/Menu.tsx',           content: MENU_TSX           },
    { path: 'src/components/About.tsx',          content: ABOUT_TSX          },
    { path: 'src/components/Reservations.tsx',   content: RESERVATIONS_TSX   },
    { path: 'src/components/Footer.tsx',         content: FOOTER_TSX         },
  ],
  personalityFiles: ['src/brand.ts', 'src/content.ts'],
  instruction:
    'Restaurant website scaffold pre-loaded (Nav, Hero, Menu, About, Reservations, Footer — elegant dark editorial style). ' +
    'Write src/brand.ts — set BRAND.name, tagline, accent (warm color), bg, fonts. ' +
    'Write src/content.ts — fill hero, menu categories with REAL dishes from the brief, about, reservations hours, footer. ' +
    'Add <link> for Google Font in index.html. Do NOT touch component files.',
}

export const defaultRestaurantBrand = BRAND_TS
export const defaultRestaurantContent = CONTENT_TS
