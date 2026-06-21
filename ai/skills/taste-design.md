---
name: taste-design
description: Anti-generic visual design grammar for websites and landing pages — banned AI tells, layout variety, and the dials that make output look art-directed instead of templated. Load for any website/landing/marketing build.
---

# Taste — design like a studio, not a template

> Inspired by the open-source taste-skill (Leonxlnx/taste-skill, MIT). Use these as hard law for visual work.

## Before you write a line: declare the read + set the dials
State in one sentence what you're building and the direction, e.g.:
"Reading this as: a premium spa — calm, editorial, restrained motion, generous whitespace."
Then set three dials (1–10) and honor them everywhere:
- **VARIANCE** (how far from convention): minimal/corporate 4–5 · modern brand 6–7 · bold/creative 8–10
- **MOTION** (how much animates): luxury/wellness 2–4 · SaaS/restaurant 5–6 · agency/launch 7–9
- **DENSITY** (how packed): airy editorial 2–4 · standard 5–6 · data/dashboard 7–9

## BANNED — the AI tells that scream "generated" (zero tolerance)
- ❌ Purple/violet gradient on white or dark (the #1 AI tell). Use the brief's palette.
- ❌ The "safe premium" warm beige + brass + oxblood palette as a default (#f5f1ea/#b08947/#1a1714). Only if the brand truly calls for it.
- ❌ Three identical feature cards in a row. Use: 2-col zig-zag, bento grid, asymmetric split, or a stepped list instead.
- ❌ Centered hero with a dark mesh gradient and a tiny tagline under the CTA when VARIANCE > 5.
- ❌ Em-dashes (—) as visual separators anywhere on the page.
- ❌ Section-numbering eyebrows ("001 · Features") on more than 1 in 3 sections.
- ❌ Fake product UI built from divs. Use a real Unsplash image or omit it.
- ❌ Generic names/copy: "Jane Doe", "Acme Inc", "Lorem ipsum", "Dedicated to excellence". Write real, specific, locale-aware copy.
- ❌ Default fonts as the DISPLAY face: Inter, Roboto, Arial, system-ui. Use the brief's pairing.

## Typography
- Display font does the heavy lifting at large scale (text-5xl→text-8xl) with tight tracking. Body font at 16–18px, relaxed leading.
- Serif is not a default "make it fancy" move — use it only when the brand justifies it (editorial, luxury, fashion).
- Establish a real scale: one giant display size, one section-heading size, one body size. Don't drift.

## Layout — earn each section
- Hero fits the viewport without scroll; max top padding ~pt-24. Hero stack ≤ 4 elements.
- Each section uses a DIFFERENT composition (don't paste the same 3-block layout). Rotate: full-bleed image, split, bento, asymmetric, pull-quote band, stat strip, gallery.
- Vary vertical rhythm — no two adjacent sections with identical spacing/structure.
- One accent color, used deliberately for CTAs + key moments — not sprinkled everywhere.

## Motion (scale to the MOTION dial)
- Animate only what you can justify in one sentence (entrance, scroll-reveal, hover-lift). No infinite micro-jitter.
- Use framer-motion: hero entrance (fade+rise), `useInView` scroll reveals with stagger, hover lift on cards.
- Always pair with `prefers-reduced-motion` fallback.
- No `window.addEventListener('scroll')` driving React state — use `useScroll`/`useInView`.

## One theme per page
Light OR dark, committed. No mid-scroll inversion. Define the palette as CSS variables in `src/index.css` and reference token classes — never raw hex in components.

## Pre-ship self-check (fail = fix before finishing)
- [ ] No purple gradient, no default beige-brass unless brand-justified
- [ ] No three-identical-cards row
- [ ] Display font is the brief's pairing, not Inter/Roboto
- [ ] Each section composition is distinct
- [ ] Real copy + real names everywhere, zero lorem
- [ ] One accent color, one theme, consistent token usage
