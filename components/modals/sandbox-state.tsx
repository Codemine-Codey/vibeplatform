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
import { motion } from 'framer-motion'
import { SparklesIcon, Loader2Icon } from 'lucide-react'
import useSWR from 'swr'

type Phase = 'idle' | 'resuming' | 'rehydrating' | 'failed'

export function SandboxState() {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const projectId = useSandboxStore((s) => s.projectId)
  const status = useSandboxStore((s) => s.status)
  const setStatus = useSandboxStore((s) => s.setStatus)
  const setUrl = useSandboxStore((s) => s.setUrl)
  const setSandboxId = useSandboxStore((s) => s.setSandboxId)

  const [phase, setPhase] = useState<Phase>('idle')

  if (status === 'stopped') {
    // Re-hydrate from the saved snapshot into a FRESH workspace (used when the old
    // one is truly gone). The files persist in storage, so the project comes back.
    const rehydrate = async (): Promise<boolean> => {
      if (!projectId) return false
      setPhase('rehydrating')
      try {
        const res = await fetch(`/api/projects/${projectId}/open`, { method: 'POST' })
        const data = await res.json()
        if (res.ok && data.url && data.sandboxId) {
          setSandboxId(data.sandboxId)
          setUrl(data.url, crypto.randomUUID())
          setStatus('running')
          return true
        }
      } catch {
        /* fall through to failure */
      }
      return false
    }

    const handleResume = async () => {
      setPhase('resuming')
      // 1) Fast path: try to wake the SAME workspace (still paused, not expired).
      if (sandboxId) {
        try {
          const res = await fetch(`/api/sandboxes/${sandboxId}/resume`, { method: 'POST' })
          const data = await res.json()
          if (data.status === 'ok') {
            await new Promise((r) => setTimeout(r, 14000)) // let Vite boot
            if (data.url) setUrl(data.url, crypto.randomUUID())
            setStatus('running')
            return
          }
        } catch {
          /* expired — fall through to re-hydrate */
        }
      }
      // 2) Expired: rebuild a fresh workspace from the saved files.
      const ok = await rehydrate()
      if (!ok) setPhase('failed')
    }

    const busy = phase === 'resuming' || phase === 'rehydrating'

    return (
      <Dialog open>
        <DialogHeader className="sr-only">
          <DialogTitle className="sr-only">Session ended</DialogTitle>
          <DialogDescription className="sr-only">Your Codemine session has ended.</DialogDescription>
        </DialogHeader>
        <DialogContent>
          {phase === 'rehydrating' ? (
            // Fun re-hydrate animation — your project is being rebuilt from saved files.
            <div className="flex flex-col items-center text-center py-4">
              <motion.div
                animate={{ rotate: 360, scale: [1, 1.15, 1] }}
                transition={{ rotate: { duration: 3, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } }}
                className="mb-4"
              >
                <SparklesIcon className="w-10 h-10 text-primary" />
              </motion.div>
              <p className="text-sm font-medium">Spinning up a fresh workspace…</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Your previous workspace expired, so we&apos;re rebuilding it from your saved files. This can take up to 60 seconds — hang tight ✨
              </p>
              <div className="mt-5 h-1 w-48 rounded-full bg-muted overflow-hidden relative">
                <motion.div
                  className="h-full w-1/2 bg-primary rounded-full absolute"
                  initial={{ left: '-50%' }}
                  animate={{ left: '100%' }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium">Your workspace went to sleep</p>
              <p className="text-sm text-muted-foreground">
                {phase === 'failed'
                  ? "We couldn't restore this project automatically. Start a new project to keep building."
                  : projectId
                    ? "It timed out from inactivity. Resume and we'll bring your project right back — rebuilding from your saved files if needed."
                    : "Your workspace timed out. Try resuming — if it's still available, your project will reload."}
              </p>
              <div className="flex gap-2 flex-wrap">
                {phase !== 'failed' && (
                  <Button onClick={handleResume} disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2Icon className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Resuming…
                      </>
                    ) : (
                      'Resume Session'
                    )}
                  </Button>
                )}
                <Button
                  variant={phase === 'failed' ? 'default' : 'outline'}
                  onClick={() => window.location.reload()}
                >
                  Start New Project
                </Button>
              </div>
            </>
          )}
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
