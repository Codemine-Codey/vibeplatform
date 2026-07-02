'use client'

/**
 * Dark-mode decorative background layers for the marketing site.
 *
 * These are a DARK-MODE feature. They live inside the marketing theme wrapper
 * (`.cm-site`) and are hidden by the wrapper's stylesheet whenever the site is
 * in light mode (`.cm-site:not(.dark) .cm-starfield/.cm-aurora { display:none }`).
 *
 * 1. STARFIELD (`StarField`) — a FULL-PAGE fixed layer that sits behind every
 *    landing section (`fixed inset-0 -z-10`). It paints the deep-navy base for
 *    the whole page and scatters ~130 tiny white dots that drift continuously
 *    UPWARD via one shared CSS keyframe (`cm-star-rise`, translateY upward +
 *    opacity fade at the ends so the loop is seamless). Positions, sizes,
 *    opacities, durations, delays and depth are varied and generated once at
 *    module scope with a seeded PRNG so SSR and client render identically (no
 *    hydration mismatch). The animation only touches transform/opacity, so it
 *    is GPU-friendly, and a single fixed layer covers the entire page (not one
 *    per section). Because it is `fixed`, the starlight stays visible behind
 *    every section as you scroll.
 *
 * 2. AURORA (`AuroraHero`) — soft blue/indigo radial "breathing" glows, plus a
 *    vignette scrim for text contrast. This is concentrated in the HERO only:
 *    it is rendered as an absolute layer inside the hero section, on top of the
 *    global starfield (its base is transparent so the stars show through). No
 *    green / purple / pink ever enters the palette.
 */

import { motion } from 'framer-motion'

// Deterministic PRNG so the star field is identical on server + client.
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Star = {
  left: number
  top: number
  size: number
  opacity: number
  duration: number
  delay: number
  rise: number
}

// ~130 stars — roughly 2x the previous field — spread across the full viewport.
const STARS: Star[] = (() => {
  const rand = mulberry32(0x5eed_1234)
  return Array.from({ length: 130 }, () => {
    const depth = rand() // 0 (far/small/slow) → 1 (near/big/fast)
    return {
      left: rand() * 100,
      top: rand() * 100,
      size: 1 + depth * 2.2, // 1px → ~3.2px
      opacity: 0.22 + depth * 0.62, // fainter when far
      duration: 18 - depth * 9, // near stars drift a touch faster
      delay: -rand() * 22, // negative → mid-flight from the first frame
      rise: 120 + depth * 180, // px travelled upward per loop
    }
  })
})()

/**
 * StarField — the full-page, fixed starlight layer. Render it ONCE per page
 * (the marketing wrapper does this) so it sits behind every section.
 */
export function StarField() {
  return (
    <div
      aria-hidden
      className="cm-starfield pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        // Deep near-black navy base for the whole page.
        background:
          'radial-gradient(120% 90% at 50% -10%, #0b1330 0%, #070a1a 45%, #04060f 100%)',
      }}
    >
      <style>{`
        @keyframes cm-star-rise {
          0%   { transform: translateY(0);            opacity: 0; }
          12%  { opacity: var(--cm-star-o); }
          88%  { opacity: var(--cm-star-o); }
          100% { transform: translateY(var(--cm-star-rise)); opacity: 0; }
        }
      `}</style>

      {STARS.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            // custom props consumed by the keyframe
            ['--cm-star-o' as string]: s.opacity.toFixed(2),
            ['--cm-star-rise' as string]: `-${s.rise}px`,
            boxShadow: '0 0 4px rgba(191,219,254,0.7)',
            animation: `cm-star-rise ${s.duration}s linear ${s.delay}s infinite`,
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  )
}

/**
 * AuroraHero — HERO-only blue/indigo glow. Its base is transparent so the
 * global StarField shows through; only the breathing blobs + a vignette are
 * painted here. Hidden in light mode via the `.cm-aurora` class.
 */
export function AuroraHero() {
  return (
    <div
      aria-hidden
      className="cm-aurora pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* ---- AURORA GLOW (blue / indigo only, breathing) ---- */}
      <motion.div
        className="absolute -top-1/3 left-1/2 h-[80vh] w-[80vh] -translate-x-1/2 rounded-full blur-[90px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(59,130,246,0.55), rgba(37,99,235,0.18) 45%, transparent 70%)',
        }}
        animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0.85, 0.55] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -top-1/4 left-[18%] h-[62vh] w-[62vh] rounded-full blur-[100px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(79,70,229,0.14) 50%, transparent 72%)',
        }}
        animate={{ scale: [1.05, 0.9, 1.05], opacity: [0.4, 0.7, 0.4], x: [0, 30, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -top-1/4 right-[14%] h-[58vh] w-[58vh] rounded-full blur-[100px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(29,78,216,0.5), rgba(30,64,175,0.16) 50%, transparent 72%)',
        }}
        animate={{ scale: [0.95, 1.15, 0.95], opacity: [0.35, 0.65, 0.35], x: [0, -26, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />

      {/* ---- VIGNETTE / SCRIM for text contrast ---- */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 55% at 50% 42%, transparent 0%, rgba(4,6,15,0.35) 78%, rgba(4,6,15,0.7) 100%)',
        }}
      />
      {/* fade into the page background at the bottom edge */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[#04060f]" />
    </div>
  )
}

export default AuroraHero

/**
 * DarkNoiseBackground — a fixed, dark base with a subtle grain/noise texture.
 * (Retained for compatibility; the marketing pages now use the shared StarField
 * layer via the marketing wrapper instead.)
 */
const NOISE_DATA_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export function DarkNoiseBackground() {
  return (
    <div
      aria-hidden
      className="cm-starfield pointer-events-none fixed inset-0 -z-10 bg-[#05070f]"
    >
      {/* soft blue depth wash at the top */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(60% 45% at 50% -5%, rgba(37,99,235,0.16), transparent 60%)',
        }}
      />
      {/* grain overlay */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-screen"
        style={{ backgroundImage: NOISE_DATA_URI, backgroundSize: '160px 160px' }}
      />
    </div>
  )
}
