'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSandboxStore } from '@/app/state'
import { useEffect, useState } from 'react'
import useSWR from 'swr'

export function SandboxState() {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const status = useSandboxStore((s) => s.status)
  const setStatus = useSandboxStore((s) => s.setStatus)
  const setUrl = useSandboxStore((s) => s.setUrl)

  const [resuming, setResuming] = useState(false)
  const [resumeFailed, setResumeFailed] = useState(false)

  if (status === 'stopped') {
    const handleResume = async () => {
      if (!sandboxId) return
      setResuming(true)
      setResumeFailed(false)
      try {
        const res = await fetch(`/api/sandboxes/${sandboxId}/resume`, { method: 'POST' })
        const data = await res.json()
        if (data.status === 'ok') {
          // Give Vite a moment to start, then restore preview and close dialog
          await new Promise(r => setTimeout(r, 14000))
          if (data.url) setUrl(data.url, crypto.randomUUID())
          setStatus('running')
        } else {
          setResumeFailed(true)
        }
      } catch {
        setResumeFailed(true)
      } finally {
        setResuming(false)
      }
    }

    return (
      <Dialog open>
        <DialogHeader className="sr-only">
          <DialogTitle className="sr-only">Session ended</DialogTitle>
          <DialogDescription className="sr-only">
            Your Codemine session has ended.
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm font-medium">Your session has ended</p>
          <p className="text-sm text-muted-foreground">
            {resumeFailed
              ? 'This session has fully expired and cannot be resumed. Start a new project to continue building.'
              : 'Your workspace timed out. Try resuming — if it\'s still available, your project will reload.'}
          </p>
          <div className="flex gap-2 flex-wrap">
            {!resumeFailed && (
              <Button onClick={handleResume} disabled={resuming}>
                {resuming ? 'Resuming...' : 'Resume Session'}
              </Button>
            )}
            <Button variant={resumeFailed ? 'default' : 'outline'} onClick={() => window.location.reload()}>
              Start New Project
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return sandboxId ? (
    <DirtyChecker sandboxId={sandboxId} setStatus={setStatus} />
  ) : null
}

interface DirtyCheckerProps {
  sandboxId: string
  setStatus: (status: 'running' | 'stopped') => void
}

function DirtyChecker({ sandboxId, setStatus }: DirtyCheckerProps) {
  const content = useSWR<'ok' | 'stopped'>(
    `/api/sandboxes/${sandboxId}`,
    async (pathname: string, init: RequestInit) => {
      const response = await fetch(pathname, init)
      const { status } = await response.json()
      return status
    },
    { refreshInterval: 30000 }
  )

  useEffect(() => {
    if (content.data === 'stopped') {
      setStatus('stopped')
    }
  }, [setStatus, content.data])

  return null
}
