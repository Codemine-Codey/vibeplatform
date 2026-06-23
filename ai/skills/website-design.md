---
name: website-design
description: Compressed website/landing design law — sharp, anti-slop, always-injected. The full taste-skill (loadSkill "taste-design") has the deep version; this is the tight one the writer follows to the letter.
---

# Website Design Law — make it look art-directed, not generated

## First: read the room, set the dials
State the direction in one line (e.g. "premium spa: calm, editorial, restrained"). Set three dials and honor them:
- **VARIANCE** (how far from convention): corporate 4-5 · modern brand 6-7 · bold/creative 8-10
- **MOTION**: luxury/wellness 2-4 · SaaS/restaurant 5-6 · agency/launch 7-9
- **DENSITY**: airy editorial 2-4 · standard 5-6 · data-rich 7-9

## BANNED — the AI tells that scream "generated" (zero tolerance)
- Purple/violet gradient on white or dark (the #1 tell). Use the brief's palette.
- The "safe premium" warm beige + brass + oxblood as a default. Only if the brand truly calls for it.
- Three identical cards in a row → use 2-col zig-zag, bento, asymmetric split, or a stepped list.
- Centered hero with a dark mesh gradient + tiny tagline under the CTA (when VARIANCE > 5).
- Em-dashes as visual separators on the page. Section-numbering eyebrows ("001 · Features") on more than 1 in 3 sections.
- Fake product UI built from divs (use a real Unsplash image or omit). Generic copy/names ("Jane Doe", "Acme", "Lorem ipsum", "Dedicated to excellence").
- Inter/Roboto/system-ui as the DISPLAY face.

## Color — tokens only, contrast always
- Set the brief's palette as CSS variables in `src/index.css` `:root`; in components use ONLY token classes (`bg-background`, `text-foreground`, `bg-primary`, `text-accent`, `border-border`). NEVER hardcode hex or `text-white`/`bg-black`/`text-slate-900` for brand surfaces.
- One accent color used deliberately for CTAs + key moments — not sprinkled. One theme per page (light OR dark, committed).
- Headlines/body MUST be high-contrast against their background — never near-background text.

## Typography
- Use the brief's Google-Fonts pairing: a distinctive display face + a refined body face. Define `--font-display`/`--font-body`.
- Real type scale: ONE giant display size (text-5xl→text-8xl, tight tracking), one heading size, one body size (16-18px, relaxed leading). Don't drift.
- Serif only when the brand justifies it (editorial/luxury/fashion) — never as a default "fancy" move.

## Layout — earn each section, vary every one
- Hero fits the viewport (max ~pt-24), stack ≤ 4 elements.
- 6-8 sections, EACH a DIFFERENT composition (rotate: full-bleed image, split, bento, asymmetric, pull-quote band, stat strip, gallery). No two adjacent sections with identical structure/spacing.
- Use CSS Grid for structure (`grid-cols-1 md:grid-cols-3`), never flex percentage math. `min-h-[100dvh]` not `h-screen`.
- Implement every SIGNATURE MOVE from the brief (hero treatment, scroll effect, texture, unusual grid) — required.

## Motion (scale to the MOTION dial)
- framer-motion: hero entrance (fade+rise, stagger), `useInView` scroll reveals, hover-lift on cards. Animate transform/opacity only. Durations 0.4-0.8s, ease-out.
- Animate only what you can justify in one sentence. ONE reveal idiom per page. Respect `prefers-reduced-motion`. No infinite micro-jitter.

## Structure & a11y
- Semantic HTML, single H1, alt text, WCAG-AA contrast, mobile-first responsive, lazy-load heavy media.

## Pre-ship self-check (fix before finishing)
No purple gradient · no default beige-brass · no 3-identical-cards · display font is the brief's (not Inter) · every section composition distinct · real copy + names · one accent, one theme, tokens only · text has contrast · every signature move implemented.
