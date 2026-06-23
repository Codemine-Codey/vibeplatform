'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// Every activity step (workspace, code, install, preview) rises + fades in through
// this one wrapper — the cohesive Lovable "momentum" feel across the whole build.
export function ToolMessage(props: {
  className?: string
  children: ReactNode
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'text-sm px-3.5 py-3 border border-border bg-background rounded-md font-mono',
        props.className
      )}
    >
      {props.children}
    </motion.div>
  )
}
