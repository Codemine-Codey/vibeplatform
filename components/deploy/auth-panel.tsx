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
      const data = await res.json() as { authUrl?: string; appId?: string; error?: string; provider?: string }
      if (!res.ok || data.error || !data.authUrl || !data.appId) throw new Error(data.error ?? 'Setup failed')
      setAuthState({ authEnabled: true, authWorkerUrl: data.authUrl, authAppId: data.appId })

      // Better Auth proxy OR legacy CF Worker — both return authUrl as the full base.
      // Better Auth: authUrl IS the full base (e.g. .../api/proxy/{id}/auth)
      // CF Worker: authUrl is the worker base, appId scopes per-project
      const isBetterAuth = data.provider === 'better-auth'
      const authBase = isBetterAuth ? data.authUrl : `${data.authUrl}/${data.appId}`

      chat.sendMessage({
        text: isBetterAuth
          ? `Auth is now enabled (Better Auth). Add login and signup to this app.

const AUTH_BASE = '${authBase}'

Better Auth endpoints (all relative to AUTH_BASE):
- POST \${AUTH_BASE}/sign-up/email  — body: { email, password, name }  — returns { token, user }
- POST \${AUTH_BASE}/sign-in/email  — body: { email, password }        — returns { token, user }
- GET  \${AUTH_BASE}/get-session    — header: Authorization: Bearer <token> — returns { session, user }
- POST \${AUTH_BASE}/sign-out       — header: Authorization: Bearer <token>

Rules:
- Declare AUTH_BASE as a module-level const (e.g. src/lib/auth.ts). Use this literal string — never import.meta.env (those vars are not set in preview).
- Store the token in localStorage under key "cm_token".
- Send it as Authorization: Bearer <token> on every authenticated request.
- Add a Login/Signup page or modal. Protect relevant routes/data. Show the user's email in the nav or header.
- Logout: POST sign-out with the Bearer header, then clear localStorage.`
          : `Auth is now enabled. Add login and signup to this app using these exact endpoints:

const AUTH_BASE = '${authBase}'

- POST \${AUTH_BASE}/signup — body: { email, password } — returns { token, user }
- POST \${AUTH_BASE}/login  — body: { email, password } — returns { token, user }
- GET  \${AUTH_BASE}/me     — header: Authorization: Bearer <token> — returns { user }

Rules:
- Declare AUTH_BASE as a module-level const in your auth utility file (src/lib/auth.ts or similar). Use this literal string — never import.meta.env.VITE_AUTH_API (that env var is not set).
- Store the JWT token in localStorage under the key "cm_token".
- Send it as Authorization: Bearer <token> on every authenticated request.
- Add a Login/Signup page or modal. Protect relevant routes/data. Show the logged-in user's email in the nav or header.
- Logout: remove the key from localStorage, redirect to home.`,
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
            <CheckCircle2Icon className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-sm font-medium">Login & signup is active</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {[
              ['Sign up', 'New users can create an account with email + password'],
              ['Log in', 'Returning users can log back into their account'],
              ['My account', 'Users can view their own profile and data'],
              ['Log out', 'Clears their session from the browser'],
            ].map(([label, desc]) => (
              <div key={label} className="flex flex-col bg-secondary rounded-sm px-3 py-2">
                <span className="text-xs font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>

          {aiWorking && (
            <p className="text-xs text-muted-foreground animate-pulse">Adding login to your app...</p>
          )}

          <div className="border-t border-primary/10 pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <UsersIcon className="w-3.5 h-3.5" />
                Signed-up users ({users.length})
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
                  <div key={u.id} className="flex items-center justify-between bg-secondary rounded-sm px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{u.email}</span>
                      {u.name && <span className="text-xs text-muted-foreground">{u.name}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Joined {new Date(u.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No signups yet. Try it in your app preview.</p>
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
