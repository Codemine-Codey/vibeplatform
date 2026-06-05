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
import { useEffect } from 'react'
import useSWR from 'swr'

export function SandboxState() {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const status = useSandboxStore((s) => s.status)
  const setStatus = useSandboxStore((s) => s.setStatus)
  if (status === 'stopped') {
    return (
      <Dialog open>
        <DialogHeader className="sr-only">
          <DialogTitle className="sr-only">
            Session ended
          </DialogTitle>
          <DialogDescription className="sr-only">
            Your Codemine session has ended. Start a new session to continue
            building.
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm font-medium">Your session has ended</p>
          <p className="text-sm text-muted-foreground">
            Codemine sessions have a maximum duration. Start a new session to
            continue building.
          </p>
          <Button onClick={() => window.location.reload()}>
            Start a new session
          </Button>
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
    { refreshInterval: 1000 }
  )

  useEffect(() => {
    if (content.data === 'stopped') {
      setStatus('stopped')
    }
  }, [setStatus, content.data])

  return null
}
