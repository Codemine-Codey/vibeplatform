'use client'

import type { DataPart } from '@/ai/messages/data-parts'
import { CheckIcon, FileCode2Icon, XIcon, ChevronRightIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { Spinner } from './spinner'
import { ToolHeader } from '../tool-header'
import { ToolMessage } from '../tool-message'
import { useSandboxStore } from '@/app/state'
import { cn } from '@/lib/utils'

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
  sandboxId,
}: {
  path: string
  state: 'done' | 'active' | 'error'
  sandboxId?: string
}) {
  const { dir, name } = splitPath(path)
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Only finished files are viewable — the active one is still streaming to disk.
  const canView = state === 'done' && !!sandboxId

  async function toggle() {
    if (!canView) return
    const next = !open
    setOpen(next)
    if (next && code === null) {
      setLoading(true)
      try {
        const res = await fetch(`/api/sandboxes/${sandboxId}/files?path=${encodeURIComponent(path)}`)
        setCode(res.ok ? await res.text() : '// Could not load this file.')
      } catch {
        setCode('// Could not load this file.')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'flex w-full items-center gap-2 py-0.5 text-left',
          canView ? 'cursor-pointer hover:opacity-75 transition-opacity' : 'cursor-default'
        )}
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
        {canView && (
          <ChevronRightIcon
            className={cn('ml-auto w-3 h-3 shrink-0 text-muted-foreground/50 transition-transform', open && 'rotate-90')}
          />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="code"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <pre className="mt-1 mb-1.5 ml-5 max-h-64 overflow-auto rounded-md bg-zinc-900 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
              <code>{loading ? 'Loading…' : code}</code>
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function GenerateFiles(props: {
  className?: string
  message: DataPart['generating-files']
}) {
  const { status, paths } = props.message
  const sandboxId = useSandboxStore((s) => s.sandboxId)
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
          {done.map((path) => (
            <FileRow key={path} path={path} state="done" sandboxId={sandboxId} />
          ))}
          {typeof active === 'string' && active && (
            <FileRow
              key={active}
              path={active}
              state={status === 'error' ? 'error' : 'active'}
              sandboxId={sandboxId}
            />
          )}
        </AnimatePresence>
      </div>
    </ToolMessage>
  )
}
