---
name: motion-fx
description: Concrete framer-motion + scroll-animation recipes (hero entrance, scroll reveal, stagger, parallax, marquee, hover lift). Load when a build needs premium motion or the user asks for animations.
---

# Motion FX — copy-ready framer-motion recipes

framer-motion is pre-installed. Import: `import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion'`. Always add a `prefers-reduced-motion` fallback.

## Hero entrance (fade + rise, staggered)
```tsx
const container = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } }
const item = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22,1,0.36,1] } } }
<motion.div variants={container} initial="hidden" animate="show">
  <motion.h1 variants={item}>…</motion.h1>
  <motion.p variants={item}>…</motion.p>
</motion.div>
```

## Scroll reveal (section fades up when it enters view)
```tsx
function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef(null); const inView = useInView(ref, { once: true, margin: '-80px' })
  return <motion.div ref={ref} initial={{ opacity: 0, y: 32 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, ease: 'easeOut' }}>{children}</motion.div>
}
```

## Parallax (subtle depth on scroll)
```tsx
const { scrollYProgress } = useScroll({ target: ref, offset: ['start end','end start'] })
const y = useTransform(scrollYProgress, [0,1], ['-8%','8%'])
<motion.img ref={ref} style={{ y }} />
```

## Infinite marquee (logos / accolades)
```tsx
<motion.div animate={{ x: ['0%','-50%'] }} transition={{ duration: 20, ease: 'linear', repeat: Infinity }} className="flex gap-12 whitespace-nowrap">…</motion.div>
```

## Hover lift (cards)
```tsx
<motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }} className="…">…</motion.div>
```

## Rules
- Durations 0.5–1.0s, easing `[0.22,1,0.36,1]` or `easeOut`. No springs unless MOTION dial ≥ 7.
- Stagger lists by 0.08–0.12s. Animate transform/opacity only (GPU-cheap), never layout properties.
- One reveal style per page — don't mix five animation idioms.
