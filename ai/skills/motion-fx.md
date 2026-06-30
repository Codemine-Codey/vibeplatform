---
name: motion-fx
description: Premium motion with framer-motion — principles (timing/easing/intent) + copy-ready recipes (hero entrance, scroll reveal, stagger, parallax, marquee, hover, page + layout transitions, text reveal). Load when a build needs strong, tasteful animation.
---

# Motion FX — animate with intent, not noise

framer-motion is pre-installed: `import { motion, AnimatePresence, useInView, useScroll, useTransform, useSpring } from 'framer-motion'`. Always pair non-essential motion with a `prefers-reduced-motion` fallback.

## Principles (taste > quantity)
- **Intent**: one well-timed hero/entrance beats ten scattered micro-interactions. Animate only what you can justify in a sentence.
- **Timing**: entrances *decelerate* (ease-out), exits *accelerate* (ease-in). Durations 0.4-0.8s for sections, 0.15-0.25s for hover/tap. Stagger lists 0.08-0.12s.
- **Easing**: `[0.22,1,0.36,1]` (premium ease-out) or springs (`stiffness:100, damping:20`) for interactive elements. Never linear except marquees.
- **Performance**: animate **transform/opacity only**, never layout props (width/height/top/left). Use `will-change` sparingly. One reveal idiom per page.

## Recipes

### Hero entrance (fade + rise, staggered)
```tsx
const container = { hidden:{}, show:{ transition:{ staggerChildren:0.12 } } }
const item = { hidden:{ opacity:0, y:24 }, show:{ opacity:1, y:0, transition:{ duration:0.7, ease:[0.22,1,0.36,1] } } }
<motion.div variants={container} initial="hidden" animate="show">
  <motion.h1 variants={item}>…</motion.h1><motion.p variants={item}>…</motion.p>
</motion.div>
```

### Scroll reveal (section fades up on enter)
```tsx
function Reveal({ children }:{ children:React.ReactNode }) {
  const ref = useRef(null); const inView = useInView(ref,{ once:true, margin:'-80px' })
  return <motion.div ref={ref} initial={{ opacity:0, y:32 }} animate={inView?{ opacity:1, y:0 }:{}} transition={{ duration:0.6, ease:'easeOut' }}>{children}</motion.div>
}
```

### Parallax (subtle depth on scroll)
```tsx
const { scrollYProgress } = useScroll({ target:ref, offset:['start end','end start'] })
const y = useTransform(scrollYProgress,[0,1],['-8%','8%'])
<motion.img ref={ref} style={{ y }} />
```

### Infinite marquee (logos/accolades)
```tsx
<motion.div animate={{ x:['0%','-50%'] }} transition={{ duration:20, ease:'linear', repeat:Infinity }} className="flex gap-12 whitespace-nowrap">…</motion.div>
```

### Hover lift / tap (cards, buttons)
```tsx
<motion.div whileHover={{ y:-4 }} whileTap={{ scale:0.98 }} transition={{ type:'spring', stiffness:300, damping:20 }} />
```

### Page / route transition
```tsx
<AnimatePresence mode="wait">
  <motion.div key={pathname} initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.25 }}>{children}</motion.div>
</AnimatePresence>
```

### Shared-element / layout
Use `layout` + `layoutId` for smooth reorder/resize/shared transitions across state changes (e.g. a card morphing into a modal).

### Text reveal (word-by-word)
```tsx
{words.map((w,i)=>(<motion.span key={i} initial={{ opacity:0, y:'0.4em' }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.04, duration:0.5 }} className="inline-block mr-[0.25em]">{w}</motion.span>))}
```

### Magnetic button (MOTION dial ≥ 7) — NEVER use useState for this
Use `useMotionValue` + `useTransform` outside the render cycle (`useSpring` to smooth); translate the button slightly toward the cursor on mouse-move.

## Rules
- Reduced-motion: gate scroll/parallax/continuous motion behind `prefers-reduced-motion`; keep essential feedback (hover/tap) only.
- Don't mix GSAP/Three with framer-motion in the same component tree. Default to framer-motion for UI.
- Don't animate everything — deliberate stillness makes the motion that exists feel premium.
- **AnimatePresence children need a stable key + must be direct children.** Every direct child of `<AnimatePresence>` MUST have a unique stable key and be a DIRECT child (no wrapper element between), or exit animations never fire. Single conditional: `{open && <motion.div key="x" exit={...} />}`; lists key by item id, never array index.
- **Reveal animations must NEVER permanently hide content.** Pair every `initial={{opacity:0}}` with `viewport={{ once: true }}` and a reduced-motion branch that renders fully visible. Content visibility must not depend on an animation firing.
