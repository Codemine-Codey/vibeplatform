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

      {/* Full overlay: generation or error fix in progress */}
      {isWorking && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white">
          <CubeLoader elapsed={elapsed} label={cubeLabel} />
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
