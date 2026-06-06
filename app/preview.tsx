'use client'

import { Preview as PreviewComponent } from '@/components/preview/preview'
import { CubeLoader } from '@/components/preview/cube-loader'
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

  // Plan D: receive runtime errors from the generated app iframe
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'cm-error' && typeof e.data.message === 'string') {
        addBrowserError(e.data.message)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [addBrowserError])

  return (
    <div className={cn('relative', className)}>
      <PreviewComponent
        key={urlUUID}
        className="w-full h-full"
        disabled={status === 'stopped'}
        url={url}
        lastFilesUploadedAt={lastFilesUploadedAt}
      />
      {isWorking && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white">
          <CubeLoader elapsed={elapsed} />
        </div>
      )}
    </div>
  )
}
