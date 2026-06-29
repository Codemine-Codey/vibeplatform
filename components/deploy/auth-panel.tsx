'use client'

import { useState } from 'react'
import { KeyRoundIcon, CheckCircle2Icon, UsersIcon, ShieldIcon } from 'lucide-react'
import { useSandboxStore } from '@/app/state'
import { useSharedChatContext } from '@/lib/chat-context'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
}

export function AuthPanel({ className }: Props) {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const authEnabled = useSandboxStore((s) => s.authEnabled)
  const authWorkerUrl = useSandboxStore((s) => s.authWorkerUrl)
  const authAppId = useSandboxStore((s) => s.authAppId)
  const setAuthState = useSandboxStore((s) => s.setAuthState)
  const chatStatus = useSandboxStore((s) => s.chatStatus)

  const { chat } = useSharedChatContext()

  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [users, setUsers] = useState<{ id: string; email: string; name: string; created_at: number }[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  const aiWorking = chatStatus === 'streaming' || chatStatus === 'submitted'

  async function handleEnable() {
    if (!sandboxId) return
    setEnabling(true)
    setError(undefined)
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandboxId }),
      })
      const data = await res.json() as { authUrl?: string; appId?: string; error?: string }
      if (!res.ok || data.error || !data.authUrl || !data.appId) throw new Error(data.error ?? 'Setup failed')
      setAuthState({ authEnabled: true, authWorkerUrl: data.authUrl, authAppId: data.appId })

      const apiBase = `${data.authUrl}/${data.appId}`
      // Auto-trigger the AI to add login/signup to the app — no copy-paste needed.
      chat.sendMessage({
        text: `Auth is now enabled for this project. The auth API base is ${apiBase} with these endpoints:
- POST ${apiBase}/signup — body: { email, password } — returns { token, user }
- POST ${apiBase}/login — body: { email, password } — returns { token, user }
- GET ${apiBase}/me — header: Authorization: Bearer <token> — returns { user }
Logout is client-side: remove the token from localStorage.

Please add login and signup functionality to the app using these exact endpoints. Store the JWT token in localStorage, send it as "Authorization: Bearer <token>", add a login/signup page or modal, protect relevant routes/data, and show the logged-in user's email where appropriate.`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth setup failed')
    } finally {
      setEnabling(false)
    }
  }

  async function fetchUsers() {
    if (!authAppId) return
    setLoadingUsers(true)
    try {
      // Server-side, ownership-scoped users list (never a raw public endpoint).
      const res = await fetch(`/api/auth/users?projectId=${authAppId}`)
      const data = await res.json() as { users?: typeof users }
      setUsers(data.users ?? [])
    } catch {
      // non-fatal
    } finally {
      setLoadingUsers(false)
    }
  }

  if (!sandboxId) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full gap-3 p-6 text-center', className)}>
        <ShieldIcon className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm font-medium">Authentication</p>
        <p className="text-xs text-muted-foreground">Generate a project first to enable auth</p>
      </div>
    )
  }

  if (authEnabled && authWorkerUrl) {
    return (
      <div className={cn('flex flex-col h-full overflow-auto', className)}>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="w-4 h-4 text-green-500 shrink-0" />
            <span className="text-sm font-medium">Auth Active</span>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Auth API base</p>
            <code className="text-xs font-mono bg-secondary px-2 py-1.5 rounded-sm break-all">{authWorkerUrl}/{authAppId}</code>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Endpoints</p>
            {[
              ['POST /signup', 'body: { email, password }'],
              ['POST /login', 'body: { email, password }'],
              ['GET /me', 'header: Authorization: Bearer <token>'],
              ['logout', 'clear token from localStorage'],
            ].map(([ep, desc]) => (
              <div key={ep} className="flex flex-col bg-secondary rounded-sm px-2 py-1.5">
                <code className="text-xs font-mono">{ep}</code>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>

          {aiWorking && (
            <p className="text-xs text-muted-foreground">Adding login/signup to your app...</p>
          )}

          <div className="border-t border-primary/10 pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <UsersIcon className="w-3.5 h-3.5" />
                Users ({users.length})
              </div>
              <button
                type="button"
                onClick={fetchUsers}
                disabled={loadingUsers}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {loadingUsers ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            {users.length > 0 ? (
              <div className="flex flex-col gap-1">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between bg-secondary rounded-sm px-2 py-1.5">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{u.email}</span>
                      {u.name && <span className="text-xs text-muted-foreground">{u.name}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No users yet — click Refresh to check</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col items-center justify-center h-full gap-4 p-6 text-center', className)}>
      <KeyRoundIcon className="w-8 h-8 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">User Authentication</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Let users sign up, log in, and access their data. User accounts are stored in your project database.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">Supports up to 100 users</p>
      {error && <p className="text-xs text-destructive max-w-xs">{error}</p>}
      <button
        type="button"
        onClick={handleEnable}
        disabled={enabling || aiWorking}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {enabling ? (
          <>
            <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
            Setting up...
          </>
        ) : (
          <>
            <KeyRoundIcon className="w-4 h-4" />
            Enable Auth
          </>
        )}
      </button>
    </div>
  )
}
