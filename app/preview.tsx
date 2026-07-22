'use client'

import { Preview as PreviewComponent } from '@/components/preview/preview'
import { CubeLoader } from '@/components/preview/cube-loader'
import { useErrorMonitor } from '@/components/error-monitor/error-monitor'
import { useSandboxStore } from './state'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

interface Props {
  className?: string
}

export function Preview({ className }: Props) {
  const status = useSandboxStore((s) => s.status)
  const url = useSandboxStore((s) => s.url)
  const urlUUID = useSandboxStore((s) => s.urlUUID)
  const lastFilesUploadedAt = useSandboxStore((s) => s.lastFilesUploadedAt)
  const chatStatus = useSandboxStore((s) => s.chatStatus)
  const addBrowserError = useSandboxStore((s) => s.addBrowserError)
  const setUrl = useSandboxStore((s) => s.setUrl)
  const projectId = useSandboxStore((s) => s.projectId)
  const [reconnecting, setReconnecting] = useState(false)
  const isWorking = chatStatus === 'streaming' || chatStatus === 'submitted'

  const errorMonitor = useErrorMonitor()
  const isFixingError = errorMonitor.status === 'pending' || errorMonitor.status === 'ready'

  // Track whether the current working state was triggered by an error fix
  const triggeredByErrorRef = useRef(false)
  const prevPending = useRef(false)

  useEffect(() => {
    if (errorMonitor.status === 'pending' && !prevPending.current) {
      triggeredByErrorRef.current = true
    }
    if (!isWorking && errorMonitor.status === 'ready') {
      triggeredByErrorRef.current = false
    }
    prevPending.current = errorMonitor.status === 'pending'
  }, [errorMonitor.status, isWorking])

  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isWorking) {
      setElapsed(0)
      intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isWorking])

  // Receive runtime errors from the generated app iframe
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'cm-error' && typeof e.data.message === 'string') {
        addBrowserError(e.data.message)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [addBrowserError])

  // ── DURABLE PREVIEW: auto-reopen a dead sandbox ──────────────────────────────────
  // Sandboxes are ephemeral (they time out). When a returning user's preview goes dead
  // (502/unreachable), poll the same-origin health probe; if it's down, reopen the project
  // from its saved snapshot into a fresh sandbox and swap the URL — the user never sits on a
  // dead 502 preview. Only runs when a preview is shown and the build isn't actively working.
  useEffect(() => {
    if (!url || isWorking || !projectId) return
    let cancelled = false
    let inFlight = false
    const check = async () => {
      if (inFlight || cancelled) return
      inFlight = true
      try {
        const h = await fetch(`/api/preview-health?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10_000) })
          .then((r) => r.json())
          .catch(() => null)
        if (!cancelled && h && h.alive === false) {
          setReconnecting(true)
          const res = await fetch(`/api/projects/${projectId}/open`, { method: 'POST' })
            .then((r) => r.json())
            .catch(() => null)
          if (!cancelled && res?.url) setUrl(res.url, crypto.randomUUID())
          if (!cancelled) setReconnecting(false)
        }
      } finally {
        inFlight = false
      }
    }
    const id = setInterval(check, 25_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [url, isWorking, projectId, setUrl])

  const showErrorDetected = errorMonitor.status === 'pending' && !isWorking
  const cubeLabel = triggeredByErrorRef.current ? 'Fixing an issue...' : undefined

  return (
    <div className={cn('relative', className)}>
      <PreviewComponent
        key={urlUUID}
        className="w-full h-full"
        disabled={status === 'stopped'}
        url={url}
        lastFilesUploadedAt={lastFilesUploadedAt}
      />

      {/* Full overlay ONLY before a preview URL exists (nothing to show yet). Once the URL
          is emitted, the preview is visible and fills in live via HMR — we never hide a
          loaded preview behind an opaque cover (that looked like "no preview" when a build
          ran long or the stream dropped without cleanly reaching 'ready'). */}
      {isWorking && !url && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background">
          <CubeLoader elapsed={elapsed} label={cubeLabel} />
        </div>
      )}

      {/* Once the preview URL exists but work continues, show only a subtle corner badge so
          the live preview stays visible while later files/fixes land via HMR. */}
      {isWorking && url && (
        <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
          <div className="flex items-center gap-2 bg-black/75 text-white text-xs px-3 py-2 rounded-full backdrop-blur-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {cubeLabel ?? 'Adding the finishing touches…'}
          </div>
        </div>
      )}

      {/* Durable preview: the sandbox went to sleep and we're reopening it from the saved snapshot */}
      {reconnecting && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90">
          <div className="flex items-center gap-2.5 bg-black/80 text-white text-xs px-4 py-2.5 rounded-full backdrop-blur-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            Reconnecting your preview…
          </div>
        </div>
      )}

      {/* Soft overlay: error detected, debouncing before sending to AI */}
      {showErrorDetected && (
        <div className="absolute inset-0 z-10 flex items-end justify-center pb-6 pointer-events-none">
          <div className="flex items-center gap-2.5 bg-black/80 text-white text-xs px-4 py-2.5 rounded-full backdrop-blur-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            An issue was detected — working on a fix
          </div>
        </div>
      )}
    </div>
  )
}
