'use client'

import { useCallback, useEffect, useState } from 'react'
import { LockIcon, PlusIcon, XIcon, ShieldCheckIcon } from 'lucide-react'
import { useSandboxStore } from '@/app/state'
import { cn } from '@/lib/utils'

export function SecretsPanel({ className }: { className?: string }) {
  const projectId = useSandboxStore((s) => s.projectId)
  const [secrets, setSecrets] = useState<{ name: string }[]>([])
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const r = await fetch(`/api/secrets?projectId=${projectId}`)
      const d = await r.json()
      setSecrets(d.secrets ?? [])
    } catch { /* ignore */ }
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!projectId || !name.trim() || !value.trim()) return
    setSaving(true); setError(undefined)
    try {
      const r = await fetch('/api/secrets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, name: name.trim(), value }) })
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error ?? 'Failed')
      setName(''); setValue(''); load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save') } finally { setSaving(false) }
  }

  async function remove(n: string) {
    if (!projectId) return
    await fetch('/api/secrets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, name: n }) })
    load()
  }

  if (!projectId) {
    return <div className={cn('flex items-center justify-center h-full p-6 text-center text-xs text-muted-foreground', className)}>Generate and save a project first to add secrets.</div>
  }

  return (
    <div className={cn('flex flex-col gap-4 p-4 overflow-auto', className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-500" />
        Encrypted at rest (AES-256) · injected into your deployed app · never shown again
      </div>

      <div className="flex flex-col gap-2">
        {secrets.length === 0 && <p className="text-xs text-muted-foreground">No secrets yet.</p>}
        {secrets.map((s) => (
          <div key={s.name} className="flex items-center justify-between bg-secondary rounded-sm px-2.5 py-1.5">
            <code className="text-xs font-mono flex items-center gap-1.5"><LockIcon className="w-3 h-3 text-muted-foreground" />{s.name}</code>
            <button type="button" onClick={() => remove(s.name)} className="text-muted-foreground hover:text-destructive"><XIcon className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-primary/10 pt-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="SECRET_KEY" className="text-xs font-mono bg-secondary rounded-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30" />
        <input value={value} onChange={(e) => setValue(e.target.value)} type="password" placeholder="value (hidden)" className="text-xs font-mono bg-secondary rounded-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30" />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button type="button" onClick={add} disabled={saving || !name.trim() || !value.trim()} className="flex items-center gap-1.5 self-start px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-50">
          <PlusIcon className="w-3 h-3" />{saving ? 'Saving…' : 'Add secret'}
        </button>
      </div>
    </div>
  )
}
