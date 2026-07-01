'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSandboxStore } from '@/app/state'
import { useSharedChatContext } from '@/lib/chat-context'
import type { ChatUIMessage } from '@/components/chat/types'
import { Loader2Icon } from 'lucide-react'

// Reopen & Continue — when the builder is opened as /?project=<id> (from the dashboard or a
// shared link), rebuild the workspace from the saved snapshot and restore the conversation,
// so the user lands back INSIDE the builder ready to keep editing — not on a blank/raw tab.
export function ProjectLoader() {
  const params = useSearchParams()
  const projectId = params.get('project')
  const { chat } = useSharedChatContext()
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error'>('idle')
  const ranRef = useRef(false)

  const setSandboxId = useSandboxStore((s) => s.setSandboxId)
  const setProjectId = useSandboxStore((s) => s.setProjectId)
  const setProjectName = useSandboxStore((s) => s.setProjectName)
  const setUrl = useSandboxStore((s) => s.setUrl)
  const setStatus = useSandboxStore((s) => s.setStatus)
  const setDatabaseState = useSandboxStore((s) => s.setDatabaseState)
  const setAuthState = useSandboxStore((s) => s.setAuthState)
  const setDeployState = useSandboxStore((s) => s.setDeployState)

  useEffect(() => {
    if (!projectId || ranRef.current) return
    ranRef.current = true
    setPhase('loading')
    ;(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/open`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok || !data.url || !data.sandboxId) {
          setPhase('error')
          return
        }
        // Restore the conversation FIRST so it's present as the workspace comes up.
        if (Array.isArray(data.chatMessages) && data.chatMessages.length > 0) {
          try {
            ;(chat as unknown as { messages: ChatUIMessage[] }).messages = data.chatMessages as ChatUIMessage[]
          } catch {
            /* Chat API shape differs — workspace still restores; chat just starts fresh */
          }
        }
        setProjectId(projectId)
        setSandboxId(data.sandboxId)
        if (data.projectName) setProjectName(data.projectName)
        if (data.databaseId) setDatabaseState({ databaseId: data.databaseId, databaseName: data.databaseName })
        if (data.authEnabled) setAuthState({ authEnabled: data.authEnabled, authWorkerUrl: data.authWorkerUrl, authAppId: data.authAppId })
        if (data.deployedUrl) setDeployState({ deployedUrl: data.deployedUrl, deployStatus: 'done' })
        setUrl(data.url, crypto.randomUUID())
        setStatus('running')
        // Clear the ?project= param so a refresh doesn't rebuild a second sandbox.
        window.history.replaceState({}, '', '/')
        setPhase('idle')
      } catch {
        setPhase('error')
      }
    })()
  }, [projectId, chat, setSandboxId, setProjectId, setProjectName, setUrl, setStatus, setDatabaseState, setAuthState, setDeployState])

  if (phase === 'idle') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 text-center px-8">
        {phase === 'loading' ? (
          <>
            <Loader2Icon className="w-8 h-8 animate-spin text-primary" />
            <div>
              <p className="text-base font-semibold">Restoring your project…</p>
              <p className="text-sm text-muted-foreground mt-1">Bringing your workspace back — this usually takes less than a minute. ✨</p>
            </div>
          </>
        ) : (
          <div>
            <p className="text-base font-semibold">We couldn't reopen this project.</p>
            <p className="text-sm text-muted-foreground mt-1">Its saved files may be unavailable. Try again from the dashboard.</p>
            <a href="/dashboard" className="inline-block mt-4 text-sm font-medium text-primary hover:underline">Back to dashboard</a>
          </div>
        )}
      </div>
    </div>
  )
}
