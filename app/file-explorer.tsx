'use client'

import { FileExplorer as FileExplorerComponent } from '@/components/file-explorer/file-explorer'
import { useSandboxStore } from './state'

interface Props {
  className: string
}

export function FileExplorer({ className }: Props) {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const status = useSandboxStore((s) => s.status)
  const paths = useSandboxStore((s) => s.paths)
  return (
    <FileExplorerComponent
      className={className}
      disabled={status === 'stopped'}
      sandboxId={sandboxId}
      paths={paths}
    />
  )
}
