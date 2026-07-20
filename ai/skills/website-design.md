---
name: website-design
description: Website/landing design law — sharp rules + creative arsenal, always-injected. Makes output look art-directed and distinctive, not templated. The full taste-skill (loadSkill "taste-design") has the exhaustive version.
---

# Website Design Law — ship art-directed, awwwards-tier, never generic

## 1. Read the room, set the dials
State the direction in one line ("premium spa: calm, editorial, restrained, warm stone palette"). Set three dials and honor them everywhere:
- **VARIANCE** (distance from convention): corporate 4-5 · modern brand 6-7 · bold/creative 8-10
- **MOTION**: luxury/wellness 2-4 · SaaS/restaurant 5-6 · agency/launch 7-9
- **DENSITY**: airy editorial 2-4 · standard 5-6 · data-rich 7-9

**Macrostructure by vertical (use the right one — they are NOT interchangeable):**
- Restaurant/café/bar: "Atmosphere-first" — full-bleed food/interior photography as the hero, menu highlights with real dish names, ambiance texture (grain, warm overlays), a strong reservation or directions CTA. Navigation leads to real pages (/menu, /about, /contact).
- SaaS/software: "Feature showcase" — product UI mockup in hero, feature grid or bento, pricing table, social proof logos. Never use this for food/hospitality.
- Agency/creative: "Portfolio punch" — case study grid, bold type-forward hero, work samples. Not for restaurants.
- E-commerce/retail: "Product catalog" — product imagery grid, collection previews, add-to-cart flow.
- Personal/portfolio: "Minimal editorial" — large name, curated work, subtle transitions.

## 1b. NAVIGATION — every link resolves to something real (no 404s, no dead anchors)

The build is MULTI-PAGE by default (the brief's pageMap lists the pages). The rule is simple and absolute — **every nav link resolves to something that exists:**
- **Link to another PAGE** (a page in the pageMap you actually created) → `<Link to="/about">`, `<Link to="/menu">`. Only for pages you built.
- **Link to a SECTION on the current page** → in-page anchor `<a href="#menu">` / `scrollIntoView` to a `<section id="menu">` that exists on this page.
- **Single-page site** (pageMap has one entry): ALL nav links are anchors to sections on the one page.

**HARD BANS:** a `<Link to="/x">` to a page you did NOT create (→ 404). An `<a href="#x">` where no `<section id="x">` exists (→ dead click). A footer "Terms"/"Privacy" you didn't build → `<button onClick={e => e.preventDefault()}>`, never a broken route.

Pick nav targets deliberately: on a multi-page site the primary nav points to the other PAGES; a page's own sub-sections can still use anchors within that page.

## 2. BANNED — signals that scream "AI-generated" (zero tolerance, with examples)

- **Purple/violet/indigo gradient** on white or dark — the #1 tell.
  ❌ `background: linear-gradient(to bottom, #6366f1, #fff)` ✅ use the brief's actual palette
- **Default "safe premium" warm beige+brass+oxblood** (#f5f1ea / #b08947 / #1a1714) unless the brand truly is that.
- **Three identical cards in a row** — the single most common AI layout crime.
  ❌ `grid-cols-3` with three equal feature cards ✅ 2-col zig-zag, bento mosaic, asymmetric split, stepped list, horizontal scroll
- **Centered hero + dark mesh gradient + tiny tagline under the CTA** (when VARIANCE > 5).
  ❌ Full-width dark bg + centered H1 + colored gradient blob ✅ asymmetric split, editorial type-forward, full-bleed image with overlay
- **Em-dashes as visual separators**; section-number eyebrows ("001 · Features") on more than 1 in 3 sections.
- **Fake product UI built from divs** → use a real Unsplash image or omit entirely.
- **Generic filler content**: "Jane Doe", "Acme Corp", "Lorem ipsum", "Elevate your workflow", "Dedicated to excellence", "Unleash your potential"
  ❌ Generic tagline ✅ Specific, brand-true copy tied to real features or real menu items
- **Inter / Roboto / system-ui as the DISPLAY face.** Pick a Google Font that fits the brand personality.
  ❌ `font-family: Inter, sans-serif` as both display and body ✅ distinctive display face (e.g. Playfair for editorial, Space Grotesk for modern, Fraunces for premium) + clean body
- **Neon outer-glows on restaurant/lifestyle/luxury brands.** Neon is a tech aesthetic.
  ❌ `text-shadow: 0 0 20px #ff0, 0 0 40px #ff0` on a sushi restaurant ✅ warm grain texture, high-contrast image overlays, muted accent lighting
- **SaaS macrostructure on non-SaaS brands** — feature grids, pricing tables, and "social proof logos" for a restaurant.
  ❌ "Features / Pricing / Testimonials" layout for a café ✅ "Atmosphere / Menu preview / Story / Visit us" layout

## 3. Color — tokens only, contrast always
- Set the brief's palette as CSS variables in `src/index.css` `:root`. In components use ONLY token classes (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `bg-primary`, `text-accent`, `border-border`). NEVER hardcode hex or `text-white`/`bg-black`/`text-slate-900` for brand surfaces.
- **One accent**, used deliberately for CTAs + key moments — not sprinkled. **One theme per page** (light OR dark, committed; no mid-scroll inversion).
- Off-black not pure black (zinc-950/charcoal). Desaturate accents to blend with neutrals. Tint shadows to the background hue.
- Headlines/body MUST be high-contrast against their background — never near-background text.

## 4. Typography — the fastest way to look expensive
- Use the brief's Google-Fonts pairing: a **distinctive display face** + a **refined body face**. Define `--font-display` / `--font-body`. Never both generic sans.
- **Type scale**: ONE giant display (text-5xl→text-8xl, `tracking-tight`, `leading-none`), one heading, one body (16-18px, `leading-relaxed`, `max-w-[65ch]`). Don't drift.
- Control hierarchy with **weight + color + size**, not size alone. Serif only when the brand justifies it (editorial/luxury/fashion).

## 5. Layout — earn each section, vary every one
- **Hero** fits the viewport (max ~`pt-24`), stack ≤ 4 elements. Prefer **asymmetric** over centered when VARIANCE > 4: split 50/50, left-text/right-asset, or full-bleed image with a graceful fade into the background color.
- **The hero MUST have a strong background visual — never a flat/empty colour block.** Use ONE of: (a) a full-bleed image (Unsplash photo for real-world brands, or a generated image for bespoke/abstract art) with a dark-to-transparent gradient overlay so text stays legible, OR (b) a rich layered treatment (gradient + grain/noise texture + a subtle animated accent). A bare solid-colour hero with only text reads unfinished — always anchor it with a real visual.
- **6-8 sections, EACH a different composition.** No two adjacent sections with identical structure/spacing. Rotate from the arsenal below.
- CSS **Grid** for structure (`grid-cols-1 md:grid-cols-3`, fractional units `2fr 1fr`), never flex percentage math. `min-h-[100dvh]` not `h-screen`. Mobile-first: high-variance layouts collapse to a clean single column < 768px.
- Implement **every SIGNATURE MOVE** from the brief — required, not optional.

## 6. The creative arsenal — pull from these to look distinctive
Choose what fits the brand; don't use all. **Layout:** Bento grid · Masonry · Split-screen scroll · Sticky-stack cards (cards pin + stack on scroll) · Horizontal-scroll gallery · Asymmetric whitespace. **Hero:** asymmetric split · editorial type-forward · full-bleed image with fade · subtle parallax depth. **Cards/sections:** spotlight-border on cursor · tilt-on-hover · glass panel with 1px inner border + inner shadow (`shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`) · pull-quote band · stat strip · marquee of logos/accolades. **Type:** oversized kinetic headline · text mask over image · gradient-stroke outline (sparingly). **Texture:** fixed grain/noise overlay (`fixed inset-0 pointer-events-none`, NEVER on scrolling containers). **3D (agency/tech/creative/portfolio only):** React Three Fiber particle field as hero background · floating geometric shapes (icosahedron, torus, octahedron) with `Float` + `MeshDistortMaterial` · scroll-driven camera flythrough with `ScrollControls`. All R3F patterns are in the website skill pack — import them as lazy components, always cap `dpr={[1, 1.5]}`, always gate on `prefers-reduced-motion`. NEVER use R3F for restaurants/cafés/wellness/warm brands.

## 6b. SECTION COMPOSITION LIBRARY — vary every section, fill every one
Pick a DIFFERENT pattern for each section so no two look alike. Every section is fully realized (real copy + real image + motion), never a thin placeholder. Concrete patterns (Tailwind):
- **Split hero 60/40** — `grid md:grid-cols-[3fr_2fr]`, headline+CTA left, full-bleed image right that bleeds off the edge.
- **Full-bleed image band** — `relative min-h-[80vh]`, image `absolute inset-0 object-cover`, gradient overlay `bg-gradient-to-t from-background`, content bottom-left.
- **Bento mosaic** — `grid grid-cols-2 md:grid-cols-4 auto-rows-[minmax(140px,auto)]`, feature cards spanning `col-span-2`/`row-span-2` unevenly, `rounded-2xl` + hover lift.
- **Sticky-stack cards** — cards that pin and stack on scroll (`position: sticky; top: 6rem` per card, slight scale/offset).
- **Horizontal scroll gallery** — `flex overflow-x-auto snap-x` row of work/menu cards, or a framer `useScroll` → `x` translate rail.
- **Zig-zag alternating** — alternating `md:flex-row` / `md:flex-row-reverse` image+text pairs (NOT three equal cards).
- **Stat strip** — a band of 3-4 big animated numbers (`react-countup`) over a token-tinted surface.
- **Pull-quote band** — one oversized testimonial in display type, portrait to the side, generous negative space.
- **Marquee row** — `react-fast-marquee` of logos/accolades/menu items.
- **Split feature list** — sticky heading left, a tall scannable list of features right (numbered or iconed).
- **FAQ accordion** + **Contact/CTA** with a real form (labels above inputs).
Rotate ~6-8 of these per page; adjacent sections must differ in structure AND rhythm (tight vs airy).

## 6c. BACKGROUND & AMBIENCE RECIPES (match the brief's backgroundTreatment — modern sites are alive)
- **gradient-mesh** — 2-3 `absolute` radial-gradient blobs (`bg-[radial-gradient(...)]`) in palette hues, `blur-3xl`, low opacity, behind content.
- **noise-grain** — a `fixed inset-0 pointer-events-none` div with a tiny tiling noise data-URI at ~4-8% opacity. NEVER on a scrolling container.
- **animated-gradient** — a gradient with `background-size:200%` animating `background-position` over ~12s `ease-in-out infinite` (CSS keyframes).
- **aurora-glow** — large blurred colour blobs (`blur-[100px]`, palette hues, low opacity) slowly drifting via framer `animate` loop. Premium on dark.
- **scroll-parallax** — `useScroll()` + `useTransform` to translate background layers slower than foreground; or `lenis` for smooth scroll. Cap movement; respect reduced-motion.
- **particles** — `@tsparticles/react` (slim) constellation, OR a small custom `<canvas>` particle field. Subtle, capped count, behind the hero only.
- **3d-scene** — `@react-three/fiber` + `@react-three/drei` (`Float`, `MeshDistortMaterial`, `Environment`) as a hero backdrop; lazy-load, `dpr={[1,1.5]}`, gate on `prefers-reduced-motion`. Agency/tech/product/portfolio only — NEVER restaurants/wellness/warm brands. `cobe` for a globe on SaaS/global brands.
All ambience sits BEHIND content at low opacity and must never hurt legibility or performance.

## 7. Motion (scale to the MOTION dial)
- framer-motion: hero entrance (fade + rise, `staggerChildren` 0.08-0.12s), `useInView` scroll reveals, hover-lift on cards, optional `useScroll`/`useTransform` parallax. Animate transform/opacity ONLY (never layout props). Durations 0.4-0.8s, ease `[0.22,1,0.36,1]`.
- Animate only what you can justify in one sentence. **ONE reveal idiom per page.** Respect `prefers-reduced-motion`. No infinite micro-jitter. Restraint reads premium.

## 8. Structure & a11y
Semantic HTML, single H1, alt text on every image, WCAG-AA contrast both modes, keyboard-navigable, lazy-load heavy media, labels above inputs.
- **Resilient images.** Every `<img>` from a remote/Unsplash source has an `onError` handler that hides it or swaps to a token-colored block, and an explicit `width`/`height` or `aspect-[]` so a slow/failed image never collapses the layout. A broken-image glyph in a hero/grid reads as a broken site.

## 9. Pre-ship self-check (fix before finishing)
No purple gradient · no default beige-brass · no 3-identical-cards · display font is the brief's (not Inter) · every section composition distinct · ≥1 arsenal move used · real copy + specific names + organic numbers · one accent, one theme, tokens only · headlines have contrast · hero is asymmetric (if VARIANCE>4) · every signature move implemented · reduced-motion respected.
