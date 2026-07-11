'use client'

import type { DataPart } from '@/ai/messages/data-parts'
import { CheckIcon, FileCode2Icon, XIcon, ChevronRightIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
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
const noCopy = { onCopy: (e: React.ClipboardEvent) => e.preventDefault(), onCut: (e: React.ClipboardEvent) => e.preventDefault(), onContextMenu: (e: React.MouseEvent) => e.preventDefault() }

function FileRow({
  path,
  state,
  sandboxId,
  autoOpen,
}: {
  path: string
  state: 'done' | 'active' | 'error'
  sandboxId?: string
  autoOpen: boolean
}) {
  const { dir, name } = splitPath(path)
  const [userToggled, setUserToggled] = useState<boolean | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const canView = state === 'done' && !!sandboxId
  // Effective open = the user's explicit choice if they made one, else the auto-open
  // (which follows the file currently being written, then closes when the build ends).
  const open = canView && (userToggled !== null ? userToggled : autoOpen)

  // Fetch the code lazily whenever it first opens (auto or manual).
  useEffect(() => {
    if (open && code === null && sandboxId) {
      setLoading(true)
      fetch(`/api/sandboxes/${sandboxId}/files?path=${encodeURIComponent(path)}`)
        .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
        .then(setCode)
        .catch((status) => setCode(
          status === 404
            ? '// File no longer available — it may be from an earlier build attempt.'
            : '// Unable to load file right now.'
        ))
        .finally(() => setLoading(false))
    }
  }, [open, code, sandboxId, path])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
    >
      <button
        type="button"
        onClick={() => canView && setUserToggled(!open)}
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
            <pre
              {...noCopy}
              className="mt-1 mb-1.5 ml-5 max-h-44 select-none overflow-auto rounded-md border border-zinc-200 !bg-white p-2.5 font-mono text-[10px] leading-relaxed !text-emerald-700"
            >
              <code className="!text-emerald-700 !bg-transparent">{loading ? 'Loading…' : code}</code>
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

  // Auto-open follows the latest file that just finished WHILE building, then closes for
  // everyone once the build completes — the live "watch it write" feel.
  const autoOpenPath = inProgress ? (done[done.length - 1] ?? null) : null

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
            <FileRow key={path} path={path} state="done" sandboxId={sandboxId} autoOpen={path === autoOpenPath} />
          ))}
          {typeof active === 'string' && active && (
            <FileRow
              key={active}
              path={active}
              state={status === 'error' ? 'error' : 'active'}
              sandboxId={sandboxId}
              autoOpen={false}
            />
          )}
        </AnimatePresence>
      </div>
    </ToolMessage>
  )
}
