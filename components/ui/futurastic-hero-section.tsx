'use client'

/**
 * AuroraHero — a dark, premium hero background layer.
 *
 * Two things happen here, both blue-only and performant:
 *
 * 1. AURORA GLOW — a set of soft radial gradients in nothing but blue/indigo
 *    shades (blue-500/600/700 + indigo). Framer Motion slowly scales, shifts
 *    and fades them so the glow "breathes" over ~14-20s loops. No green / purple
 *    / pink ever enters the palette.
 *
 * 2. STAR FIELD — ~56 tiny white dots that drift continuously UPWARD via a
 *    single shared CSS keyframe (`cm-star-rise`, translateY upward + opacity
 *    fade at the ends so the loop is seamless). Positions, sizes, opacities,
 *    durations and delays are varied for depth and are generated once at module
 *    scope with a seeded PRNG so SSR and client render identically (no
 *    hydration mismatch). Star count stays modest and the animation only
 *    touches transform/opacity, so it's GPU-friendly.
 *
 * It renders as an absolutely-positioned, pointer-events-none background. Hero
 * content should sit in a sibling with `relative z-10` on top of it. A vignette
 * scrim is included so light text stays high-contrast over the glow.
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

const STARS: Star[] = (() => {
  const rand = mulberry32(0x5eed_1234)
  return Array.from({ length: 56 }, () => {
    const depth = rand() // 0 (far/small/slow) → 1 (near/big/fast)
    return {
      left: rand() * 100,
      top: rand() * 100,
      size: 1 + depth * 2.2, // 1px → ~3.2px
      opacity: 0.25 + depth * 0.6, // fainter when far
      duration: 16 - depth * 8, // near stars drift a touch faster
      delay: -rand() * 20, // negative → mid-flight from the first frame
      rise: 120 + depth * 160, // px travelled upward per loop
    }
  })
})()

export function AuroraHero() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        // Deep near-black navy base.
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

      {/* ---- STAR FIELD (white dots drifting upward) ---- */}
      <div className="absolute inset-0">
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
 *
 * Used by the secondary marketing pages (about / pricing / terms / privacy) —
 * the aurora is reserved for the landing hero only. The grain is an inline
 * SVG feTurbulence data-URI tiled at low opacity over a deep navy-black base,
 * plus one soft blue radial wash at the top for a hint of depth. Pointer-events
 * are off and it sits behind page content (fixed, -z-10).
 */
const NOISE_DATA_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export function DarkNoiseBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[#05070f]">
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

