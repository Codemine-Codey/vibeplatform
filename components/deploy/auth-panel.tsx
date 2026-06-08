'use client'

import { useState } from 'react'
import { KeyRoundIcon, CheckCircle2Icon, UsersIcon, CopyIcon, ShieldIcon } from 'lucide-react'
import { useSandboxStore } from '@/app/state'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
}

export function AuthPanel({ className }: Props) {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const databaseId = useSandboxStore((s) => s.databaseId)
  const deployProjectName = useSandboxStore((s) => s.deployProjectName)
  const authEnabled = useSandboxStore((s) => s.authEnabled)
  const authWorkerUrl = useSandboxStore((s) => s.authWorkerUrl)
  const setAuthState = useSandboxStore((s) => s.setAuthState)

  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [copied, setCopied] = useState(false)
  const [users, setUsers] = useState<{ id: string; email: string; name: string; created_at: number }[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  async function handleEnable() {
    if (!sandboxId || !databaseId) return
    setEnabling(true)
    setError(undefined)
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandboxId, databaseId, projectName: deployProjectName }),
      })
      const data = await res.json() as { workerUrl?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Setup failed')
      setAuthState({ authEnabled: true, authWorkerUrl: data.workerUrl })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth setup failed')
    } finally {
      setEnabling(false)
    }
  }

  async function fetchUsers() {
    if (!authWorkerUrl) return
    setLoadingUsers(true)
    try {
      const res = await fetch(`${authWorkerUrl}/users`)
      const data = await res.json() as { users?: typeof users }
      setUsers(data.users ?? [])
    } catch {
      // non-fatal
    } finally {
      setLoadingUsers(false)
    }
  }

  function copyConfig() {
    const config = {
      authApiUrl: authWorkerUrl,
      endpoints: {
        register: `POST ${authWorkerUrl}/register  →  body: { email, password, name? }  →  returns { token, user }`,
        login: `POST ${authWorkerUrl}/login  →  body: { email, password }  →  returns { token, user }`,
        me: `GET ${authWorkerUrl}/me  →  header: Authorization: Bearer <token>  →  returns { user }`,
        logout: 'client-side: remove token from localStorage',
      },
      usage: 'Store token in localStorage. Pass as Authorization: Bearer <token> on protected requests.',
    }
    navigator.clipboard.writeText(JSON.stringify(config, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // No sandbox yet
  if (!sandboxId) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full gap-3 p-6 text-center', className)}>
        <ShieldIcon className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm font-medium">Authentication</p>
        <p className="text-xs text-muted-foreground">Generate a project first to enable auth</p>
      </div>
    )
  }

  // No database yet
  if (!databaseId) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full gap-3 p-6 text-center', className)}>
        <ShieldIcon className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm font-medium">Authentication</p>
        <p className="text-xs text-muted-foreground">Add a database first — auth stores users in your D1 database</p>
      </div>
    )
  }

  // Auth enabled
  if (authEnabled && authWorkerUrl) {
    return (
      <div className={cn('flex flex-col h-full overflow-auto', className)}>
        <div className="flex flex-col gap-4 p-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="w-4 h-4 text-green-500 shrink-0" />
            <span className="text-sm font-medium">Auth Active</span>
          </div>

          {/* Worker URL */}
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Auth API</p>
            <code className="text-xs font-mono bg-secondary px-2 py-1.5 rounded-sm break-all">{authWorkerUrl}</code>
          </div>

          {/* Endpoints */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Endpoints</p>
            {[
              ['POST /register', 'body: { email, password, name? }'],
              ['POST /login', 'body: { email, password }'],
              ['GET /me', 'header: Authorization: Bearer <token>'],
              ['DELETE /logout', 'client-side: clear token'],
            ].map(([ep, desc]) => (
              <div key={ep} className="flex flex-col bg-secondary rounded-sm px-2 py-1.5">
                <code className="text-xs font-mono">{ep}</code>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>

          {/* Copy config for AI */}
          <button
            type="button"
            onClick={copyConfig}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-primary/20 text-xs hover:bg-accent transition-colors"
          >
            <CopyIcon className="w-3.5 h-3.5" />
            {copied ? 'Copied!' : 'Copy Config for AI'}
          </button>
          <p className="text-xs text-muted-foreground -mt-2">
            Paste this in chat and ask: &ldquo;add login/signup using this auth config&rdquo;
          </p>

          {/* Users */}
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

  // Ready to enable
  return (
    <div className={cn('flex flex-col items-center justify-center h-full gap-4 p-6 text-center', className)}>
      <KeyRoundIcon className="w-8 h-8 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">User Authentication</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Let users sign up, log in, and access their data. Runs on Cloudflare Workers — users are stored in your D1 database.
        </p>
      </div>
      {error && <p className="text-xs text-destructive max-w-xs">{error}</p>}
      <button
        type="button"
        onClick={handleEnable}
        disabled={enabling}
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
