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

## 2. BANNED — the AI tells that scream "generated" (zero tolerance)
- **Purple/violet/indigo gradient** on white or dark — the #1 tell. Use the brief's palette.
- The **default "safe premium" warm beige+brass+oxblood** (#f5f1ea / #b08947 / #1a1714) unless the brand truly is that.
- **Three identical cards in a row.** Replace with: 2-col zig-zag, bento grid, asymmetric split, stepped/numbered list, or horizontal scroll.
- **Centered hero + dark mesh gradient + tiny tagline under the CTA** (when VARIANCE > 5).
- **Em-dashes as visual separators**; section-number eyebrows ("001 · Features") on more than 1 in 3 sections.
- **Fake product UI built from divs** → use a real Unsplash image or omit. **Generic content** ("Jane Doe", "Acme", "Lorem ipsum", "Elevate/Seamless/Unleash", "Dedicated to excellence").
- **Inter / Roboto / system-ui as the DISPLAY face.** Pure black `#000`. Neon outer-glows. Oversaturated accents.

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
- **6-8 sections, EACH a different composition.** No two adjacent sections with identical structure/spacing. Rotate from the arsenal below.
- CSS **Grid** for structure (`grid-cols-1 md:grid-cols-3`, fractional units `2fr 1fr`), never flex percentage math. `min-h-[100dvh]` not `h-screen`. Mobile-first: high-variance layouts collapse to a clean single column < 768px.
- Implement **every SIGNATURE MOVE** from the brief — required, not optional.

## 6. The creative arsenal — pull from these to look distinctive
Choose what fits the brand; don't use all. **Layout:** Bento grid · Masonry · Split-screen scroll · Sticky-stack cards (cards pin + stack on scroll) · Horizontal-scroll gallery · Asymmetric whitespace. **Hero:** asymmetric split · editorial type-forward · full-bleed image with fade · subtle parallax depth. **Cards/sections:** spotlight-border on cursor · tilt-on-hover · glass panel with 1px inner border + inner shadow (`shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`) · pull-quote band · stat strip · marquee of logos/accolades. **Type:** oversized kinetic headline · text mask over image · gradient-stroke outline (sparingly). **Texture:** fixed grain/noise overlay (`fixed inset-0 pointer-events-none`, NEVER on scrolling containers).

## 7. Motion (scale to the MOTION dial)
- framer-motion: hero entrance (fade + rise, `staggerChildren` 0.08-0.12s), `useInView` scroll reveals, hover-lift on cards, optional `useScroll`/`useTransform` parallax. Animate transform/opacity ONLY (never layout props). Durations 0.4-0.8s, ease `[0.22,1,0.36,1]`.
- Animate only what you can justify in one sentence. **ONE reveal idiom per page.** Respect `prefers-reduced-motion`. No infinite micro-jitter. Restraint reads premium.

## 8. Structure & a11y
Semantic HTML, single H1, alt text on every image, WCAG-AA contrast both modes, keyboard-navigable, lazy-load heavy media, labels above inputs.

## 9. Pre-ship self-check (fix before finishing)
No purple gradient · no default beige-brass · no 3-identical-cards · display font is the brief's (not Inter) · every section composition distinct · ≥1 arsenal move used · real copy + specific names + organic numbers · one accent, one theme, tokens only · headlines have contrast · hero is asymmetric (if VARIANCE>4) · every signature move implemented · reduced-motion respected.
