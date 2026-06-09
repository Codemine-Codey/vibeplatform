# Website Skill Pack — Design & Code Patterns

## Layout Structure
- Sticky/fixed nav → transparent, frosted glass on scroll (`backdrop-blur-md bg-white/80`)
- Hero section first: full-width, display heading (`text-6xl` to `text-8xl`), subheading, 1–2 CTAs
- Alternating content blocks (image left / text right, then flip) — never stack identical layouts
- Footer: multi-column links, social icons, copyright line

## Typography Rules
- Display headings: use the brief's display font, `font-bold` or `font-black`, tight tracking (`tracking-tight`)
- Body: clean readable size (`text-base` to `text-lg`), `leading-relaxed`
- Section labels: small uppercase mono (`text-xs tracking-widest uppercase opacity-60`) above headings
- Never use default system fonts — always apply the brief's fontPairing via Google Fonts

## Color Application
- Map brief's colorPalette to CSS custom properties in `:root` — never hardcode hex everywhere
- Primary CTA: most saturated brand color, white text
- Secondary CTA: outlined, transparent bg
- Section backgrounds: alternate between white, light tint of primary, and dark (for contrast sections)
- Text on dark backgrounds: pure white for headings, `text-white/80` for body

## Component Patterns

**Hero:**
```jsx
// Full viewport height, centered content, background image or gradient
<section className="relative min-h-screen flex items-center">
  <div className="max-w-7xl mx-auto px-6 py-24">
    <p className="text-xs tracking-widest uppercase opacity-60 mb-4">Label</p>
    <h1 className="text-7xl font-black tracking-tight leading-none mb-6">Headline</h1>
    <p className="text-xl text-foreground/70 max-w-2xl mb-10">Subheading</p>
    <div className="flex gap-4">
      <button className="px-8 py-4 bg-primary text-white rounded-full font-semibold">Primary CTA</button>
      <button className="px-8 py-4 border border-current rounded-full">Secondary</button>
    </div>
  </div>
</section>
```

**Feature Grid:**
```jsx
// 3-column grid on desktop, stacked on mobile
<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
  {features.map(f => (
    <div className="p-8 rounded-2xl border bg-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
        {f.icon}
      </div>
      <h3 className="text-xl font-semibold mb-3">{f.title}</h3>
      <p className="text-foreground/60 leading-relaxed">{f.description}</p>
    </div>
  ))}
</div>
```

**Testimonial:**
```jsx
<div className="p-8 rounded-2xl bg-secondary">
  <p className="text-lg leading-relaxed mb-6 italic">"{quote}"</p>
  <div className="flex items-center gap-4">
    <img src={avatar} className="w-12 h-12 rounded-full object-cover" />
    <div><p className="font-semibold">{name}</p><p className="text-sm opacity-60">{role}</p></div>
  </div>
</div>
```

## Images
- ALWAYS call `get_unsplash` for hero images, section backgrounds, and team photos
- Query should match the brand: "luxury spa interior", "modern software team", not just "people"
- Use `object-cover` on all images, always set explicit height

## Animations
- Hover on cards: `hover:-translate-y-1 hover:shadow-xl transition-all duration-300`
- Buttons: `hover:scale-105 active:scale-95 transition-transform`
- Sections fade in: add `animate-in fade-in slide-in-from-bottom-4 duration-700` on section entry
- Never use JS animation libraries — CSS transitions only for performance

## Navigation
- Mobile: hamburger menu, full-screen overlay or slide-in drawer
- Desktop: horizontal links, CTA button right-aligned
- Active state: underline or color change on current section
- Smooth scroll: `scroll-behavior: smooth` on html element, anchor links

## Multi-Page Structure (React Router)
- `/` — Home (Hero + all sections)
- `/about` — Story, team, values
- `/services` or `/work` — Portfolio or service detail
- `/contact` — Contact form
- Shared: `<Layout>` with Nav + Footer wrapping all pages

## LAYOUT PATTERNS — USE THESE, NOT GENERIC GRIDS

### Masonry Grid
Use for portfolios, galleries, press/blog grids — irregular card heights look editorial and intentional.
```tsx
// CSS-only masonry via columns (no JS library needed)
<div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
  {items.map(item => (
    <div key={item.id} className="break-inside-avoid rounded-xl overflow-hidden">
      <img src={item.image} className="w-full object-cover" />
      <div className="p-4 bg-card">
        <h3 className="font-semibold">{item.title}</h3>
        <p className="text-sm text-muted-foreground">{item.desc}</p>
      </div>
    </div>
  ))}
</div>
```

### Timeline Layout
Use for history, process steps, roadmap, blog — gives a strong vertical narrative.
```tsx
<div className="relative pl-8 border-l-2 border-border space-y-10">
  {events.map((event, i) => (
    <motion.div key={i} className="relative" initial={{ opacity: 0, x: -16 }}
      animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ delay: i * 0.12 }}>
      {/* Dot on the line */}
      <div className="absolute -left-[2.35rem] top-1 w-4 h-4 rounded-full bg-primary border-2 border-background" />
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{event.date}</p>
      <h3 className="text-lg font-semibold mb-2">{event.title}</h3>
      <p className="text-foreground/70 leading-relaxed">{event.body}</p>
    </motion.div>
  ))}
</div>
```

### Tabbed Content Sections
Use for menus, service categories, portfolio filters — keeps pages shorter without losing depth.
```tsx
const [tab, setTab] = useState(tabs[0].id)
<div className="flex flex-col gap-8">
  {/* Tab bar */}
  <div className="flex gap-1 p-1 bg-secondary rounded-xl w-fit">
    {tabs.map(t => (
      <button key={t.id} onClick={() => setTab(t.id)}
        className={cn('px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200',
          tab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
        {t.label}
      </button>
    ))}
  </div>
  {/* Animated panel */}
  <AnimatePresence mode="wait">
    <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
      {tabs.find(t => t.id === tab)?.content}
    </motion.div>
  </AnimatePresence>
</div>
```

### Accordion / FAQ Sections
Use for FAQs, specs, policies — saves vertical space, feels polished with smooth animation.
```tsx
const [open, setOpen] = useState<number | null>(null)
<div className="divide-y divide-border">
  {faqs.map((faq, i) => (
    <div key={i} className="py-5">
      <button onClick={() => setOpen(open === i ? null : i)}
        className="flex items-center justify-between w-full text-left gap-4">
        <span className="font-medium">{faq.question}</span>
        <motion.span animate={{ rotate: open === i ? 45 : 0 }} transition={{ duration: 0.2 }}
          className="shrink-0 text-muted-foreground">
          <PlusIcon className="w-4 h-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open === i && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="overflow-hidden">
            <p className="pt-3 text-foreground/70 leading-relaxed">{faq.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  ))}
</div>
```

### Pricing Table — Two Variants

**Cards variant** (3 tiers side by side — best for marketing sites):
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
  {plans.map((plan, i) => (
    <div key={i} className={cn('rounded-2xl border p-8 flex flex-col gap-6',
      plan.featured ? 'bg-foreground text-background border-foreground scale-105 shadow-2xl' : 'bg-card')}>
      <div>
        <p className="text-sm font-medium opacity-60 mb-1">{plan.name}</p>
        <p className="text-4xl font-black">{plan.price}<span className="text-base font-normal opacity-60">/mo</span></p>
        <p className="text-sm opacity-70 mt-2">{plan.desc}</p>
      </div>
      <ul className="space-y-3 flex-1">
        {plan.features.map((f, j) => (
          <li key={j} className="flex items-center gap-2 text-sm">
            <CheckIcon className="w-4 h-4 shrink-0" />{f}
          </li>
        ))}
      </ul>
      <button className={cn('w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90',
        plan.featured ? 'bg-background text-foreground' : 'bg-foreground text-background')}>
        {plan.cta}
      </button>
    </div>
  ))}
</div>
```

**Comparison table variant** (many features vs. few tiers — best for SaaS with many features):
```tsx
<div className="overflow-x-auto rounded-2xl border">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b">
        <th className="p-5 text-left font-semibold w-1/3">Features</th>
        {plans.map(p => (
          <th key={p.name} className={cn('p-5 text-center font-semibold', p.featured && 'bg-primary/5')}>
            <p className="text-base">{p.name}</p>
            <p className="text-2xl font-black mt-1">{p.price}</p>
          </th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y">
      {features.map(feat => (
        <tr key={feat} className="hover:bg-muted/30 transition-colors">
          <td className="p-4 font-medium">{feat}</td>
          {plans.map(p => (
            <td key={p.name} className={cn('p-4 text-center', p.featured && 'bg-primary/5')}>
              {p.includes(feat) ? <CheckIcon className="w-4 h-4 mx-auto text-primary" /> : <span className="text-muted-foreground/40">—</span>}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### Full-Page Scroll Snapping
Use for immersive storytelling, product showcases, portfolio with distinct chapters.
```tsx
// Container: snap mandatory, overflow scroll, full height
<div className="h-screen overflow-y-scroll snap-y snap-mandatory">
  {sections.map((section, i) => (
    <section key={i}
      className="h-screen snap-start snap-always flex items-center justify-center relative overflow-hidden">
      {section.content}
    </section>
  ))}
</div>
// Each section fills exactly one viewport height and snaps into place on scroll.
// Works with keyboard arrow keys and touch swipe natively — no JS needed.
// Add a dot-nav for visual progress:
<nav className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2">
  {sections.map((_, i) => (
    <button key={i} onClick={() => scrollToSection(i)}
      className={cn('w-2 h-2 rounded-full transition-all duration-300',
        activeSection === i ? 'bg-foreground scale-150' : 'bg-foreground/30')} />
  ))}
</nav>
```

## Anti-Patterns to Avoid
- No full-page loading spinners for a static site
- No Lorem Ipsum — write real placeholder copy matching the brand
- No stock blue/grey unless brief explicitly calls for it
- No inaccessible contrast (text must pass WCAG AA)
- No images without alt text

## MOTION & ANIMATION

framer-motion is pre-installed. Use it for all animations. Import: `import { motion, AnimatePresence, useInView } from 'framer-motion'`

**Hero entrance (always use this on every hero):**
```tsx
const heroVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.25, 0.1, 0, 1] } }
}
<motion.div variants={heroVariants} initial="hidden" animate="visible">
```

**Scroll reveal (use on every section below the hero):**
```tsx
function FadeInSection({ children }: { children: React.ReactNode }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 32 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}
```

**Stagger children (for card grids, feature lists):**
```tsx
const container = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }
const item = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }
<motion.ul variants={container} initial="hidden" animate="visible">
  {items.map(i => <motion.li key={i.id} variants={item}>...)
</motion.ul>
```

**Hover lift (cards, buttons, image blocks):**
```tsx
<motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }} whileTap={{ scale: 0.98 }}>
```

**Rules:**
- ALWAYS add hero entrance animation — no static hero ever
- ALWAYS wrap sections in FadeInSection for scroll reveal
- Use stagger on any repeating element group (cards, features, menu items, testimonials)
- Keep easing curves sophisticated: `[0.25, 0.1, 0, 1]` (ease-out) or `[0.43, 0.13, 0.23, 0.96]` (snappy)
- `motionIntensity` from the brief controls scale: subtle = duration 0.6/y:20, moderate = duration 0.8/y:32, dramatic = duration 1.0/y:60 with spring physics
