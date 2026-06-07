import type { Template } from './types'

const BRAND_TS = `
// PERSONALITY FILE 1/2 — AI writes this.
// Colors, fonts, and visual identity derived from the project brief.

export const BRAND = {
  name:    'YourBrand',
  tagline: 'The future of everything',
  accent:  '#6366F1',      // primary CTA / highlights
  accent2: '#A855F7',      // secondary / gradient end
  bg:      '#030712',      // page background
  surface: '#0F172A',      // card / nav background
  border:  '#1E293B',      // dividers, card borders
  text:    '#F8FAFC',      // primary text
  muted:   '#94A3B8',      // secondary text, labels
  success: '#4ADE80',      // pricing checkmarks
  fonts: {
    display: "'Space Grotesk', sans-serif",
    body:    "'Inter', sans-serif",
    mono:    "'JetBrains Mono', monospace",
    import:  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
  },
}
`.trim()

const CONTENT_TS = `
// PERSONALITY FILE 2/2 — AI writes this.
// All copy derived from the project brief — NEVER generic placeholder text.

export const CONTENT = {
  nav: {
    links: ['Features', 'Pricing', 'Docs', 'Blog'],
    cta:   'Get Started Free',
  },
  hero: {
    eyebrow:  'Now in public beta',
    headline: 'Ship faster than\\never before',   // \\n creates a line break
    sub:      'The AI-powered platform that turns ideas into production apps in minutes. No DevOps. No boilerplate. Just results.',
    cta1:     'Start building free',
    cta2:     'See a demo',
    badge:    '2,400+ teams building',
    stat1:    { value: '10×', label: 'faster shipping' },
    stat2:    { value: '99.9%', label: 'uptime SLA' },
    stat3:    { value: '< 2min', label: 'to first deploy' },
  },
  features: {
    title: 'Everything you need,\\nnothing you don\\'t',
    sub:   'Built for modern teams who move fast and ship often.',
    items: [
      { icon: '⚡', title: 'Instant Deploy',    desc: 'Push to main and your app is live in under 60 seconds. Automatic SSL, CDN, and rollback included.' },
      { icon: '🤖', title: 'AI Copilot',        desc: 'Context-aware AI that writes, reviews, and refactors code. Trained on your codebase.' },
      { icon: '🔒', title: 'Zero-Config Auth',  desc: 'OAuth, magic links, and SSO out of the box. Secure by default.' },
      { icon: '📊', title: 'Real-time Analytics', desc: 'Live dashboards, custom metrics, and error tracking with zero instrumentation.' },
      { icon: '🔄', title: 'CI/CD Pipeline',    desc: 'Visual pipeline builder with branch previews, staging, and blue-green deploys.' },
      { icon: '🌍', title: 'Global Edge',       desc: '200+ edge locations. Your app serves from the nearest node, always.' },
    ],
  },
  pricing: {
    title: 'Simple, predictable pricing',
    sub:   'Start free. Scale as you grow. No surprises.',
    tiers: [
      { name: 'Hobby', price: '$0', period: '/mo', features: ['3 projects', '100K req/mo', 'Community support', 'Shared infrastructure'], cta: 'Start free', highlight: false },
      { name: 'Pro', price: '$29', period: '/mo', features: ['Unlimited projects', '5M req/mo', 'Priority support', 'Dedicated resources', 'Custom domains', 'Team collaboration'], cta: 'Start Pro trial', highlight: true },
      { name: 'Enterprise', price: 'Custom', period: '', features: ['Everything in Pro', 'SSO & SAML', 'SLA guarantee', 'Dedicated CSM', 'On-prem option', 'Audit logs'], cta: 'Contact sales', highlight: false },
    ],
  },
  testimonials: [
    { name: 'Sarah K.', role: 'CTO at Luma', quote: 'We cut our deployment time from 45 minutes to under 2. This is what modern infra should feel like.', avatar: 'SK' },
    { name: 'Marcus T.', role: 'Lead Dev at Nexus', quote: 'The AI copilot caught 3 production bugs in our first week. It pays for itself.', avatar: 'MT' },
    { name: 'Priya L.', role: 'Founder, Flowstate', quote: 'Went from idea to first paying customer in 4 days. Literally impossible before this.', avatar: 'PL' },
  ],
  cta: {
    headline: 'Ready to build faster?',
    sub:      'Join 2,400 teams already shipping with us. Free forever on Hobby.',
    button:   'Start building free',
    note:     'No credit card required · Deploy in 60 seconds',
  },
  footer: {
    tagline: 'Built for developers who care about speed.',
    cols: [
      { title: 'Product', links: ['Features', 'Pricing', 'Changelog', 'Roadmap'] },
      { title: 'Company', links: ['About', 'Blog', 'Careers', 'Press'] },
      { title: 'Legal',   links: ['Privacy', 'Terms', 'Security', 'Cookies'] },
    ],
  },
}
`.trim()

const NAV_TSX = /* tsx */ `
import { BRAND } from '../brand'
import { CONTENT } from '../content'

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
      style={{ background: \`\${BRAND.surface}cc\`, backdropFilter: 'blur(20px)', borderBottom: \`1px solid \${BRAND.border}88\` }}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black"
          style={{ background: \`linear-gradient(135deg, \${BRAND.accent}, \${BRAND.accent2})\` }}>
          {BRAND.name[0]}
        </div>
        <span className="font-bold text-sm tracking-tight" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>
          {BRAND.name}
        </span>
      </div>
      <div className="hidden md:flex items-center gap-6">
        {CONTENT.nav.links.map(l => (
          <a key={l} href={\`#\${l.toLowerCase()}\`} className="text-sm transition-colors hover:opacity-100 opacity-60"
            style={{ color: BRAND.text }}>{l}</a>
        ))}
      </div>
      <a href="#pricing"
        className="px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105"
        style={{ background: \`linear-gradient(135deg, \${BRAND.accent}, \${BRAND.accent2})\`, color: '#fff', fontFamily: BRAND.fonts.display }}>
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
      {/* Gradient orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20"
          style={{ background: BRAND.accent }} />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full blur-[100px] opacity-15"
          style={{ background: BRAND.accent2 }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-8"
          style={{ background: \`\${BRAND.accent}22\`, border: \`1px solid \${BRAND.accent}44\`, color: BRAND.accent }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: BRAND.accent }} />
          {h.eyebrow}
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-none mb-6"
          style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>
          {lines.map((line, i) => (
            <span key={i} className="block">
              {i === 1 ? (
                <span style={{ background: \`linear-gradient(90deg, \${BRAND.accent}, \${BRAND.accent2})\`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {line}
                </span>
              ) : line}
            </span>
          ))}
        </h1>

        <p className="text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed" style={{ color: BRAND.muted }}>
          {h.sub}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-14">
          <a href="#pricing"
            className="px-8 py-3.5 rounded-xl font-semibold text-sm transition-all hover:scale-105 hover:shadow-lg"
            style={{ background: \`linear-gradient(135deg, \${BRAND.accent}, \${BRAND.accent2})\`, color: '#fff',
              fontFamily: BRAND.fonts.display, boxShadow: \`0 0 30px \${BRAND.accent}44\` }}>
            {h.cta1}
          </a>
          <a href="#features"
            className="px-8 py-3.5 rounded-xl font-semibold text-sm transition-all hover:bg-white/5"
            style={{ border: \`1px solid \${BRAND.border}\`, color: BRAND.text, fontFamily: BRAND.fonts.display }}>
            {h.cta2} →
          </a>
        </div>

        <div className="flex items-center justify-center gap-8 text-sm">
          {[h.stat1, h.stat2, h.stat3].map((s, i) => (
            <div key={i} className="text-center">
              <p className="text-2xl font-bold" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>{s.value}</p>
              <p style={{ color: BRAND.muted }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce opacity-30">
        <div className="w-5 h-8 rounded-full border-2 flex items-start justify-center pt-1.5" style={{ borderColor: BRAND.muted }}>
          <div className="w-1 h-2 rounded-full" style={{ background: BRAND.muted }} />
        </div>
      </div>
    </section>
  )
}
`.trim()

const FEATURES_TSX = /* tsx */ `
import { BRAND } from '../brand'
import { CONTENT } from '../content'

export function Features() {
  const f = CONTENT.features
  const lines = f.title.split('\\n')
  return (
    <section id="features" className="py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight"
            style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>
            {lines.map((l, i) => <span key={i} className="block">{l}</span>)}
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: BRAND.muted }}>{f.sub}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {f.items.map((item, i) => (
            <div key={i}
              className="group p-6 rounded-2xl transition-all duration-300 hover:scale-[1.02]"
              style={{ background: BRAND.surface, border: \`1px solid \${BRAND.border}\`,
                boxShadow: \`inset 0 1px 0 \${BRAND.border}88\` }}>
              <div className="text-3xl mb-4">{item.icon}</div>
              <h3 className="font-semibold mb-2 text-sm tracking-wide"
                style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>{item.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: BRAND.muted }}>{item.desc}</p>
              <div className="mt-4 w-8 h-0.5 rounded-full transition-all group-hover:w-16"
                style={{ background: \`linear-gradient(90deg, \${BRAND.accent}, \${BRAND.accent2})\` }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
`.trim()

const PRICING_TSX = /* tsx */ `
import { BRAND } from '../brand'
import { CONTENT } from '../content'

export function Pricing() {
  const p = CONTENT.pricing
  return (
    <section id="pricing" className="py-28 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight"
            style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>{p.title}</h2>
          <p className="text-lg" style={{ color: BRAND.muted }}>{p.sub}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {p.tiers.map((tier) => (
            <div key={tier.name} className="relative p-7 rounded-2xl flex flex-col"
              style={{ background: tier.highlight ? \`linear-gradient(145deg, \${BRAND.accent}22, \${BRAND.accent2}11)\` : BRAND.surface,
                border: \`1.5px solid \${tier.highlight ? BRAND.accent : BRAND.border}\`,
                boxShadow: tier.highlight ? \`0 0 40px \${BRAND.accent}22\` : 'none' }}>
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold"
                  style={{ background: \`linear-gradient(90deg, \${BRAND.accent}, \${BRAND.accent2})\`, color: '#fff' }}>
                  Most Popular
                </div>
              )}
              <div className="mb-6">
                <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: BRAND.muted }}>{tier.name}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>{tier.price}</span>
                  {tier.period && <span className="text-sm" style={{ color: BRAND.muted }}>{tier.period}</span>}
                </div>
              </div>
              <ul className="flex-1 space-y-3 mb-8">
                {tier.features.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: BRAND.muted }}>
                    <span className="text-base" style={{ color: BRAND.success }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <a href="#"
                className="block text-center py-3 rounded-xl font-semibold text-sm transition-all hover:scale-105"
                style={{ background: tier.highlight ? \`linear-gradient(135deg, \${BRAND.accent}, \${BRAND.accent2})\` : 'transparent',
                  border: tier.highlight ? 'none' : \`1px solid \${BRAND.border}\`,
                  color: tier.highlight ? '#fff' : BRAND.text, fontFamily: BRAND.fonts.display }}>
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
`.trim()

const TESTIMONIALS_TSX = /* tsx */ `
import { BRAND } from '../brand'
import { CONTENT } from '../content'

export function Testimonials() {
  return (
    <section className="py-20 px-6" style={{ background: BRAND.surface }}>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>
          Loved by developers
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CONTENT.testimonials.map((t) => (
            <div key={t.name} className="p-6 rounded-2xl"
              style={{ background: BRAND.bg, border: \`1px solid \${BRAND.border}\` }}>
              <p className="text-sm leading-relaxed mb-6 italic" style={{ color: BRAND.muted }}>"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: \`linear-gradient(135deg, \${BRAND.accent}, \${BRAND.accent2})\`, color: '#fff' }}>
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: BRAND.text }}>{t.name}</p>
                  <p className="text-xs" style={{ color: BRAND.muted }}>{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
`.trim()

const CTA_TSX = /* tsx */ `
import { BRAND } from '../brand'
import { CONTENT } from '../content'

export function CTA() {
  const c = CONTENT.cta
  return (
    <section className="py-28 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <div className="relative p-12 rounded-3xl overflow-hidden"
          style={{ background: \`linear-gradient(135deg, \${BRAND.accent}33, \${BRAND.accent2}22)\`,
            border: \`1px solid \${BRAND.accent}44\` }}>
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[80px] opacity-20"
            style={{ background: BRAND.accent2 }} />
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 relative z-10"
            style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>{c.headline}</h2>
          <p className="text-lg mb-8 relative z-10" style={{ color: BRAND.muted }}>{c.sub}</p>
          <a href="#"
            className="inline-block px-10 py-4 rounded-xl font-semibold text-sm transition-all hover:scale-105 relative z-10"
            style={{ background: \`linear-gradient(135deg, \${BRAND.accent}, \${BRAND.accent2})\`,
              color: '#fff', fontFamily: BRAND.fonts.display, boxShadow: \`0 0 40px \${BRAND.accent}55\` }}>
            {c.button}
          </a>
          <p className="text-xs mt-4 relative z-10" style={{ color: BRAND.muted }}>{c.note}</p>
        </div>
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
    <footer className="py-14 px-6 border-t" style={{ borderColor: BRAND.border }}>
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black"
                style={{ background: \`linear-gradient(135deg, \${BRAND.accent}, \${BRAND.accent2})\` }}>
                {BRAND.name[0]}
              </div>
              <span className="font-bold text-sm" style={{ fontFamily: BRAND.fonts.display, color: BRAND.text }}>{BRAND.name}</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: BRAND.muted }}>{f.tagline}</p>
          </div>
          {f.cols.map(col => (
            <div key={col.title}>
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: BRAND.muted }}>{col.title}</p>
              <ul className="space-y-2">
                {col.links.map(l => (
                  <li key={l}><a href="#" className="text-sm transition-opacity hover:opacity-100 opacity-50" style={{ color: BRAND.text }}>{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="pt-6 border-t flex flex-col md:flex-row items-center justify-between gap-3"
          style={{ borderColor: BRAND.border }}>
          <p className="text-xs" style={{ color: BRAND.muted }}>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
          <p className="text-xs" style={{ color: BRAND.muted }}>Built with ❤️ and Codemine</p>
        </div>
      </div>
    </footer>
  )
}
`.trim()

const HOME_TSX = /* tsx */ `
import { Hero } from '../components/Hero'
import { Features } from '../components/Features'
import { Testimonials } from '../components/Testimonials'
import { Pricing } from '../components/Pricing'
import { CTA } from '../components/CTA'
import { Footer } from '../components/Footer'

export function Home() {
  return (
    <>
      <Hero />
      <Features />
      <Testimonials />
      <Pricing />
      <CTA />
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
/* Font import injected via brand.ts */
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
    <title>SaaS</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`.trim()

export const saasTemplate: Template = {
  id: 'website-saas',
  name: 'SaaS Landing Page',
  skill: 'website',
  scaffoldFiles: [
    { path: 'index.html',                     content: INDEX_HTML         },
    { path: 'src/main.tsx',                   content: MAIN_TSX           },
    { path: 'src/App.tsx',                    content: APP_TSX            },
    { path: 'src/index.css',                  content: INDEX_CSS          },
    { path: 'src/pages/Home.tsx',             content: HOME_TSX           },
    { path: 'src/components/Nav.tsx',         content: NAV_TSX            },
    { path: 'src/components/Hero.tsx',        content: HERO_TSX           },
    { path: 'src/components/Features.tsx',    content: FEATURES_TSX       },
    { path: 'src/components/Testimonials.tsx',content: TESTIMONIALS_TSX   },
    { path: 'src/components/Pricing.tsx',     content: PRICING_TSX        },
    { path: 'src/components/CTA.tsx',         content: CTA_TSX            },
    { path: 'src/components/Footer.tsx',      content: FOOTER_TSX         },
  ],
  personalityFiles: ['src/brand.ts', 'src/content.ts'],
  instruction:
    'SaaS landing page pre-loaded (Nav, Hero, Features, Testimonials, Pricing, CTA, Footer — DO NOT regenerate). ' +
    'Write src/brand.ts: BRAND.name = exact brandName from brief. Derive accent/accent2 from brief colorPalette. ' +
    'bg/surface = dark for tech/bold brands, light for clean/minimal brands — YOU decide from tone+personality in brief. ' +
    'fonts = Google Font from brief fontPairing. ' +
    'Write src/content.ts: hero headline/sub, feature names+descriptions, pricing tiers, testimonials, footer — ALL specific to this brand, zero generic text. ' +
    'Add Google Font <link> in index.html. Do NOT touch component files.',
}

export const defaultSaasBrand = BRAND_TS
export const defaultSaasContent = CONTENT_TS
