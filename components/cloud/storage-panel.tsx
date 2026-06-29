'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HardDriveIcon, UploadIcon, XIcon, ExternalLinkIcon, FileIcon } from 'lucide-react'
import { useSandboxStore } from '@/app/state'
import { cn } from '@/lib/utils'

type StoredFile = { name: string; key: string; size: number; modified: string; url?: string }

function fmtSize(n: number): string {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

export function StoragePanel({ className }: { className?: string }) {
  const projectId = useSandboxStore((s) => s.projectId)
  const [files, setFiles] = useState<StoredFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const r = await fetch(`/api/storage?projectId=${projectId}`)
      const d = await r.json()
      setFiles(d.files ?? [])
    } catch { /* ignore */ }
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function upload(file: File) {
    if (!projectId) return
    setUploading(true); setError(undefined)
    try {
      const fd = new FormData()
      fd.append('projectId', projectId)
      fd.append('file', file)
      const r = await fetch('/api/storage', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error ?? 'Upload failed')
      load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed') } finally { setUploading(false) }
  }

  async function remove(key: string) {
    if (!projectId) return
    await fetch('/api/storage', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, key }) })
    load()
  }

  if (!projectId) {
    return <div className={cn('flex items-center justify-center h-full p-6 text-center text-xs text-muted-foreground', className)}>Generate and save a project first to add storage.</div>
  }

  return (
    <div className={cn('flex flex-col gap-4 p-4 overflow-auto', className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <HardDriveIcon className="w-3.5 h-3.5" />
        Files are served from a fast global CDN with zero egress fees.
      </div>

      <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = '' }} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="flex items-center justify-center gap-2 rounded-md border border-dashed border-primary/25 py-6 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50">
        <UploadIcon className="w-4 h-4" />
        {uploading ? 'Uploading…' : 'Click to upload a file'}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-col gap-1.5">
        {files.length === 0 && <p className="text-xs text-muted-foreground">No files yet.</p>}
        {files.map((f) => (
          <div key={f.key} className="flex items-center gap-2 bg-secondary rounded-sm px-2.5 py-1.5">
            <FileIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs truncate flex-1">{f.name}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{fmtSize(f.size)}</span>
            {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0"><ExternalLinkIcon className="w-3.5 h-3.5" /></a>}
            <button type="button" onClick={() => remove(f.key)} className="text-muted-foreground hover:text-destructive shrink-0"><XIcon className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
