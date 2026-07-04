'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, type Transition, type TargetAndTransition } from 'framer-motion'
import { cn } from '@/lib/utils'

interface TextRotateProps {
  texts: string[]
  rotationInterval?: number
  initial?: TargetAndTransition
  animate?: TargetAndTransition
  exit?: TargetAndTransition
  staggerDuration?: number
  staggerFrom?: 'first' | 'last' | 'center' | number
  transition?: Transition
  mainClassName?: string
  splitLevelClassName?: string
  elementLevelClassName?: string
}

// Rotates through `texts`, animating each character in/out with a spring + stagger.
// Uses framer-motion (the installed package) — the source snippet's `motion/react` is the
// same API under a different specifier, which is NOT installed in this app.
export function TextRotate({
  texts,
  rotationInterval = 2000,
  initial = { y: '100%' },
  animate = { y: 0 },
  exit = { y: '-120%' },
  staggerDuration = 0.025,
  staggerFrom = 'first',
  transition = { type: 'spring', damping: 30, stiffness: 400 },
  mainClassName,
  splitLevelClassName,
  elementLevelClassName,
}: TextRotateProps) {
  const [index, setIndex] = useState(0)

  // Split the current text into words → characters, so we can stagger per character.
  const words = useMemo(
    () => texts[index].split(' ').map((w) => Array.from(w)),
    [texts, index],
  )
  const totalChars = useMemo(() => words.reduce((s, w) => s + w.length, 0), [words])

  const staggerDelay = useCallback(
    (i: number, total: number) => {
      if (staggerFrom === 'first') return i * staggerDuration
      if (staggerFrom === 'last') return (total - 1 - i) * staggerDuration
      if (staggerFrom === 'center') return Math.abs(Math.floor(total / 2) - i) * staggerDuration
      if (typeof staggerFrom === 'number') return Math.abs(staggerFrom - i) * staggerDuration
      return i * staggerDuration
    },
    [staggerFrom, staggerDuration],
  )

  useEffect(() => {
    const id = setInterval(() => setIndex((p) => (p + 1) % texts.length), rotationInterval)
    return () => clearInterval(id)
  }, [texts.length, rotationInterval])

  let charIndex = 0
  return (
    <motion.span className={cn('flex flex-wrap whitespace-pre-wrap', mainClassName)} layout transition={transition}>
      <span className="sr-only">{texts[index]}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={index} className="flex flex-wrap" aria-hidden layout>
          {words.map((chars, w) => (
            <span key={w} className={cn('inline-flex', splitLevelClassName)}>
              {chars.map((ch, c) => {
                const i = charIndex++
                return (
                  <motion.span
                    key={c}
                    className={cn('inline-block', elementLevelClassName)}
                    initial={initial}
                    animate={animate}
                    exit={exit}
                    transition={{ ...transition, delay: staggerDelay(i, totalChars) }}
                  >
                    {ch}
                  </motion.span>
                )
              })}
              {w < words.length - 1 && <span className="whitespace-pre"> </span>}
            </span>
          ))}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}
