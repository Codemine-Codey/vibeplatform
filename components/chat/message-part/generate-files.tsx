'use client'

import type { DataPart } from '@/ai/messages/data-parts'
import { CheckIcon, FileCode2Icon, XIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Spinner } from './spinner'
import { ToolHeader } from '../tool-header'
import { ToolMessage } from '../tool-message'

// Split "src/components/Hero.tsx" → dir "src/components/" + name "Hero.tsx" so the
// filename reads bold and the folder sits muted — the clean Lovable file-row look.
function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf('/')
  return i === -1
    ? { dir: '', name: path }
    : { dir: path.slice(0, i + 1), name: path.slice(i + 1) }
}

const EASE = [0.22, 1, 0.36, 1] as const

function FileRow({
  path,
  state,
}: {
  path: string
  state: 'done' | 'active' | 'error'
}) {
  const { dir, name } = splitPath(path)
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
      className="flex items-center gap-2 py-0.5"
    >
      {state === 'active' ? (
        <Spinner loading className="shrink-0">
          <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
        </Spinner>
      ) : state === 'error' ? (
        <XIcon className="w-3.5 h-3.5 shrink-0 text-red-600" />
      ) : (
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          className="shrink-0"
        >
          <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
        </motion.span>
      )}
      <FileCode2Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
      <span className="truncate text-[13px]">
        {dir && <span className="text-muted-foreground/55">{dir}</span>}
        <span className="font-medium text-foreground">{name}</span>
      </span>
    </motion.div>
  )
}

export function GenerateFiles(props: {
  className?: string
  message: DataPart['generating-files']
}) {
  const { status, paths } = props.message
  const inProgress = ['error', 'uploading', 'generating'].includes(status)

  const done = inProgress ? paths.slice(0, paths.length - 1) : paths
  const active = inProgress ? (paths[paths.length - 1] ?? '') : null

  return (
    <ToolMessage className={props.className}>
      <ToolHeader>
        <FileCode2Icon className="w-3.5 h-3.5" />
        <motion.span
          key={status === 'done' ? 'done' : 'progress'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={inProgress ? 'animate-pulse' : undefined}
        >
          {status === 'done'
            ? `Built ${paths.length} file${paths.length === 1 ? '' : 's'}`
            : status === 'error'
              ? 'Generation failed'
              : 'Writing code…'}
        </motion.span>
      </ToolHeader>
      <div className="relative min-h-5">
        <AnimatePresence initial={false}>
          {done.map(path => (
            <FileRow key={path} path={path} state="done" />
          ))}
          {typeof active === 'string' && active && (
            <FileRow
              key={active}
              path={active}
              state={status === 'error' ? 'error' : 'active'}
            />
          )}
        </AnimatePresence>
      </div>
    </ToolMessage>
  )
}
