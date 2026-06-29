'use client'

import { HardDriveIcon, ImageIcon, FileIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Storage UI (Cloudflare R2). Architecture is decided + the project carries a
// storage_prefix: ONE shared bucket, per-project key prefix (so we never hit CF's
// bucket-count limit at scale). Activation is pending the CF token's R2 scope —
// once enabled, this panel lists/uploads files under the project's prefix.
export function StoragePanel({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center h-full gap-4 p-6 text-center', className)}>
      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
        <HardDriveIcon className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1 max-w-xs">
        <p className="text-sm font-medium">File Storage</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Store images, uploads, and documents for your app — like user avatars or attachments. Backed by global object storage with zero egress fees.
        </p>
      </div>
      <div className="flex items-center gap-4 text-muted-foreground">
        <ImageIcon className="w-4 h-4" />
        <FileIcon className="w-4 h-4" />
      </div>
      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-secondary text-muted-foreground">Activating soon</span>
    </div>
  )
}
