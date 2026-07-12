# Website Skill Pack — Design & Code Patterns

## Layout Structure
- Sticky/fixed nav → transparent on load, frosted glass on scroll (`backdrop-blur-md bg-white/80 dark:bg-background/80`)
- Hero section first: full-viewport, display heading (`text-6xl` to `text-8xl`), strong background visual (never a flat color block)
- **NEVER stack identical section layouts** — every section must use a DIFFERENT composition
- Footer: multi-column links, brand mark, copyright line

## Typography Rules
- Display headings: use the brief's display font, `font-bold` or `font-black`, tight tracking (`tracking-tight`)
- Body: clean readable size (`text-base` to `text-lg`), `leading-relaxed`, `max-w-[65ch]`
- Section eyebrows: small uppercase mono (`text-xs tracking-widest uppercase opacity-60`) above headings — max 1 in 3 sections
- NEVER use Inter/Roboto as the display face — always apply the brief's font pairing via Google Fonts `@import`

## Color Application
- Map brief's colorPalette to CSS custom properties in `:root` — NEVER hardcode hex in components
- Use semantic tokens only: `bg-background`, `text-foreground`, `bg-primary`, `text-accent`, `border-border`
- Primary CTA: `bg-primary text-primary-foreground`
- Section backgrounds: alternate between `bg-background`, `bg-secondary/40`, `bg-foreground text-background` (for contrast)
- One accent, used deliberately for CTAs + key moments — not sprinkled everywhere

## ⚠️ BANNED LAYOUT PATTERNS (these get removed in review)
- `grid-cols-3` with THREE EQUAL-SIZE feature cards — the #1 AI tell. NEVER.
- Centered hero + dark gradient blob + tiny tagline under CTA (when not editorial)
- Generic filler: "Jane Doe" · "Acme Corp" · "Elevate your workflow" · "Lorem ipsum"
- Anchor links as navigation: `<a href="#menu">` — HARD BAN. All nav items = real routes.

## ✅ LAYOUTS TO USE INSTEAD OF 3-COL GRID

**Asymmetric Bento (replaces feature grid):**
```tsx
// 2 tall left + 2 short right, or 1 wide top + 3 below — never 3 equal columns
<div className="grid grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[220px]">
  <div className="col-span-2 row-span-2 rounded-2xl overflow-hidden relative">
    <img src={img1} className="w-full h-full object-cover" />
    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
      <h3 className="text-white text-2xl font-bold">{feature1.title}</h3>
    </div>
  </div>
  <div className="rounded-2xl bg-primary p-6 flex flex-col justify-between">
    <Icon className="w-8 h-8 text-primary-foreground/70" />
    <div>
      <h3 className="font-semibold text-primary-foreground">{feature2.title}</h3>
      <p className="text-sm text-primary-foreground/70 mt-1">{feature2.desc}</p>
    </div>
  </div>
  <div className="rounded-2xl bg-secondary p-6 flex flex-col justify-between">
    <Icon className="w-8 h-8 text-foreground/40" />
    <div>
      <h3 className="font-semibold">{feature3.title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{feature3.desc}</p>
    </div>
  </div>
</div>
```

**Zig-Zag Alternating Rows (replaces equal card grid):**
```tsx
{features.map((f, i) => (
  <div key={f.id} className={`flex flex-col ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} gap-12 items-center py-16`}>
    <div className="flex-1 rounded-2xl overflow-hidden aspect-[4/3]">
      <img src={f.image} className="w-full h-full object-cover" />
    </div>
    <div className="flex-1 space-y-4">
      <p className="text-xs tracking-widest uppercase text-muted-foreground">{f.eyebrow}</p>
      <h2 className="text-4xl font-bold tracking-tight leading-tight">{f.title}</h2>
      <p className="text-lg text-foreground/70 leading-relaxed">{f.body}</p>
      <a href={f.href} className="inline-flex items-center gap-2 font-medium hover:gap-3 transition-all">
        {f.cta} <ArrowRightIcon className="w-4 h-4" />
      </a>
    </div>
  </div>
))}
```

**Stat Strip (instead of cards):**
```tsx
<div className="border-y border-border py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
  {stats.map(s => (
    <div key={s.label} className="text-center">
      <p className="text-5xl font-black tracking-tight text-foreground">{s.value}</p>
      <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
    </div>
  ))}
</div>
```

**Pull-Quote Band:**
```tsx
<section className="bg-foreground text-background py-20 px-6">
  <blockquote className="max-w-3xl mx-auto text-center">
    <p className="text-3xl md:text-4xl font-semibold leading-snug">"{quote}"</p>
    <footer className="mt-6 text-foreground/60 text-sm">{author} — {role}</footer>
  </blockquote>
</section>
```

## Component Patterns

**Hero (full-bleed image — always):**
```tsx
<section className="relative min-h-[100dvh] flex items-center overflow-hidden">
  {/* Background: full-bleed image with gradient overlay */}
  <div className="absolute inset-0">
    <img src={heroImg} alt="" className="w-full h-full object-cover" />
    <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
  </div>
  {/* Asymmetric content — left-aligned, not centered */}
  <div className="relative z-10 max-w-7xl mx-auto px-6 py-32">
    <p className="text-xs tracking-widest uppercase text-white/60 mb-4">{eyebrow}</p>
    <h1 className="text-6xl md:text-8xl font-black tracking-tight leading-none text-white mb-6 max-w-2xl">{headline}</h1>
    <p className="text-xl text-white/70 max-w-xl mb-10 leading-relaxed">{subheading}</p>
    <div className="flex flex-wrap gap-4">
      <button className="px-8 py-4 bg-white text-black rounded-full font-semibold hover:bg-white/90 transition-colors">{primaryCTA}</button>
      <button className="px-8 py-4 border border-white/40 text-white rounded-full hover:bg-white/10 transition-colors">{secondaryCTA}</button>
    </div>
  </div>
</section>
```

**Testimonial (not 3-col):**
```tsx
{/* Horizontal scroll marquee or 2-col stagger, never 3-equal-cards */}
<div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory">
  {testimonials.map(t => (
    <div key={t.id} className="shrink-0 w-80 snap-center rounded-2xl bg-secondary p-6">
      <p className="text-base leading-relaxed mb-5">"{t.quote}"</p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
          {t.name[0]}
        </div>
        <div>
          <p className="text-sm font-semibold">{t.name}</p>
          <p className="text-xs text-muted-foreground">{t.role}</p>
        </div>
      </div>
    </div>
  ))}
</div>
```

## Navigation — Real Routes ONLY
```tsx
// ✅ CORRECT — real page routes
<nav>
  <Link to="/">Home</Link>
  <Link to="/menu">Menu</Link>
  <Link to="/about">About</Link>
  <Link to="/contact">Contact</Link>
</nav>

// ❌ BANNED — anchor scroll links used as nav items
// <a href="#menu">Menu</a>  ← NEVER
// <a href="#about">About</a>  ← NEVER
```

Mobile: hamburger → full-screen overlay with nav links. Desktop: horizontal links + right-aligned CTA.

## Multi-Page Structure (React Router)
- `/` — Home (Hero + key sections)
- `/about` — Story, team, values — FULL page design
- `/services` or `/menu` or `/work` — detailed listing page — FULL design
- `/contact` — Contact form — FULL design
- Shared: `<Layout>` with Nav + Footer wrapping all pages

## Images
- ALWAYS call `getUnsplashBatch` for hero images, section backgrounds, and context photos
- Query must match the brand: "warm specialty coffee shop interior brick walls" not "coffee"
- Use `object-cover` on all images, always set explicit height or `aspect-[]`
- Every `<img>` from Unsplash needs `onError` to hide or swap to a color block

## ANIMATIONS (framer-motion is pre-installed)

**Hero entrance:**
```tsx
<motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
```

**Scroll reveal (wrap every section below hero):**
```tsx
function FadeIn({ children }: { children: React.ReactNode }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 32 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}
```

**Stagger children (repeating elements):**
```tsx
const container = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }
<motion.ul variants={container} initial="hidden" animate="visible">
  {items.map(i => <motion.li key={i.id} variants={item}>{...}</motion.li>)}
</motion.ul>
```

**Rules:**
- ALWAYS add hero entrance — no static hero
- ALWAYS wrap sections below hero in FadeIn
- Animate transform/opacity only — never layout props
- Respect `prefers-reduced-motion`

## 3D / R3F (React Three Fiber + Drei — pre-installed, use for tech/agency/creative/portfolio brands)

**When to use:** Agency, creative, tech startup, portfolio, fashion, luxury digital brands. NOT for restaurants, cafés, basic e-commerce, or any brand where 3D feels gimmicky.

**Performance rules — always apply:**
- Always wrap `<Canvas>` in a `<Suspense fallback={null}>` boundary
- Always set `dpr={[1, 1.5]}` to cap the pixel ratio (prevents mobile GPU overload)
- Static/idle scenes: add `frameloop="demand"` so R3F only re-renders on change
- Check `prefers-reduced-motion` — if true, render a static fallback instead of the Canvas
- Keep total mesh count under 20 per canvas; use `<instancedMesh>` for repeated geometry
- Always lazy-load: `const SceneHero = lazy(() => import('./SceneHero'))` wrapped in Suspense

**Pattern 1 — Particle field hero background (great for tech/SaaS/agency):**
```tsx
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, useMemo, Suspense } from 'react'
import * as THREE from 'three'

function Particles({ count = 800 }: { count?: number }) {
  const mesh = useRef<THREE.Points>(null)
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 12
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6
    }
    return arr
  }, [count])
  useFrame((state) => {
    if (!mesh.current) return
    mesh.current.rotation.y = state.clock.elapsedTime * 0.04
    mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.02) * 0.1
  })
  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.025} color="hsl(var(--primary, 221 83% 53%))" transparent opacity={0.7} sizeAttenuation />
    </points>
  )
}

export function ParticleHero({ children }: { children: React.ReactNode }) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <section className="relative min-h-[100dvh] flex items-center overflow-hidden bg-background">
      {!prefersReduced && (
        <div className="absolute inset-0">
          <Suspense fallback={null}>
            <Canvas camera={{ position: [0, 0, 5], fov: 60 }} dpr={[1, 1.5]}>
              <Particles />
            </Canvas>
          </Suspense>
        </div>
      )}
      <div className="relative z-10 w-full">{children}</div>
    </section>
  )
}
```

**Pattern 2 — Floating geometric shapes (creative/luxury/fashion brands):**
```tsx
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial } from '@react-three/drei'
import { useRef, Suspense } from 'react'

function FloatingShapes() {
  return (
    <>
      <Float speed={1.4} rotationIntensity={0.8} floatIntensity={1.2}>
        <mesh position={[-2.5, 1, -1]} castShadow>
          <icosahedronGeometry args={[0.8, 0]} />
          <MeshDistortMaterial color="hsl(var(--primary, 221 83% 53%))" distort={0.3} speed={2} roughness={0.1} metalness={0.8} />
        </mesh>
      </Float>
      <Float speed={1.8} rotationIntensity={1.2} floatIntensity={0.9}>
        <mesh position={[2.8, -0.5, -2]}>
          <torusGeometry args={[0.6, 0.2, 16, 32]} />
          <meshStandardMaterial color="hsl(var(--accent, var(--primary, 221 83% 53%)))" roughness={0.05} metalness={0.9} />
        </mesh>
      </Float>
      <Float speed={1.1} rotationIntensity={0.6} floatIntensity={1.5}>
        <mesh position={[0.5, 2, -3]}>
          <octahedronGeometry args={[0.5]} />
          <meshStandardMaterial color="hsl(var(--foreground, 222 84% 5%))" roughness={0.2} metalness={0.6} transparent opacity={0.7} />
        </mesh>
      </Float>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <pointLight position={[-3, 2, 2]} intensity={0.8} color="hsl(var(--primary, 221 83% 53%))" />
    </>
  )
}

export function ShapesBackground({ children }: { children: React.ReactNode }) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <section className="relative min-h-[100dvh] flex items-center overflow-hidden bg-background">
      {!prefersReduced && (
        <div className="absolute inset-0 opacity-60">
          <Suspense fallback={null}>
            <Canvas camera={{ position: [0, 0, 6], fov: 55 }} dpr={[1, 1.5]}>
              <FloatingShapes />
            </Canvas>
          </Suspense>
        </div>
      )}
      <div className="relative z-10 w-full">{children}</div>
    </section>
  )
}
```

**Pattern 3 — Scroll-driven camera flythrough (agency/portfolio — premium impact):**
```tsx
import { Canvas, useFrame } from '@react-three/fiber'
import { ScrollControls, Scroll, useScroll } from '@react-three/drei'
import { useRef, Suspense } from 'react'
import { easing } from 'maath'

function CameraRig() {
  const scroll = useScroll()
  useFrame((state, delta) => {
    const t = scroll.offset
    // Camera arcs forward as user scrolls
    easing.damp3(state.camera.position, [0, 2 - t * 4, 8 - t * 6], 0.25, delta)
    state.camera.lookAt(0, 0, 0)
  })
  return null
}

// Wrap your entire page content in this for scroll-driven 3D depth
export function ScrollScene({ pages = 3, children }: { pages?: number; children: React.ReactNode }) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReduced) return <>{children}</>
  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      <Suspense fallback={null}>
        <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 8], fov: 50 }}>
          <ScrollControls pages={pages} damping={0.1}>
            <CameraRig />
            <Scroll html>{children}</Scroll>
            {/* Add 3D scene objects here */}
          </ScrollControls>
        </Canvas>
      </Suspense>
    </div>
  )
}
```

**When NOT to use R3F:**
- Restaurants, cafés, food brands, wellness/spa — stick to Framer Motion; 3D feels cold/wrong
- Any project where the hero already has a strong Unsplash/Flux photo — don't compete with it
- Mobile-first contexts where GPU budget is tight (check analytics; default to motion instead)
- If the brand brief says "warm", "cozy", "natural", "earthy" — 3D is wrong for those adjectives

## Layout Patterns (Additional)

### Masonry Gallery
```tsx
<div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
  {items.map(item => (
    <div key={item.id} className="break-inside-avoid rounded-xl overflow-hidden">
      <img src={item.image} className="w-full object-cover" alt={item.title} />
      <div className="p-4 bg-card">
        <h3 className="font-semibold">{item.title}</h3>
      </div>
    </div>
  ))}
</div>
```

### Tabbed Content
```tsx
const [tab, setTab] = useState(tabs[0].id)
<div className="flex flex-col gap-8">
  <div className="flex gap-1 p-1 bg-secondary rounded-xl w-fit">
    {tabs.map(t => (
      <button key={t.id} onClick={() => setTab(t.id)}
        className={cn('px-5 py-2 rounded-lg text-sm font-medium transition-all',
          tab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
        {t.label}
      </button>
    ))}
  </div>
  <AnimatePresence mode="wait">
    <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
      {tabs.find(t => t.id === tab)?.content}
    </motion.div>
  </AnimatePresence>
</div>
```

### FAQ Accordion
```tsx
const [open, setOpen] = useState<number | null>(null)
<div className="divide-y divide-border">
  {faqs.map((faq, i) => (
    <div key={i} className="py-5">
      <button onClick={() => setOpen(open === i ? null : i)}
        className="flex items-center justify-between w-full text-left gap-4">
        <span className="font-medium">{faq.question}</span>
        <motion.span animate={{ rotate: open === i ? 45 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-muted-foreground">
          <PlusIcon className="w-4 h-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open === i && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: 'easeInOut' }} className="overflow-hidden">
            <p className="pt-3 text-foreground/70 leading-relaxed">{faq.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  ))}
</div>
```
