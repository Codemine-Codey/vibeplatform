'use client'

import { Preview as PreviewComponent } from '@/components/preview/preview'
import { useSandboxStore } from './state'

interface Props {
  className?: string
}

export function Preview({ className }: Props) {
  const status = useSandboxStore((s) => s.status)
  const url = useSandboxStore((s) => s.url)
  const urlUUID = useSandboxStore((s) => s.urlUUID)
  const lastFilesUploadedAt = useSandboxStore((s) => s.lastFilesUploadedAt)
  return (
    <PreviewComponent
      key={urlUUID}
      className={className}
      disabled={status === 'stopped'}
      url={url}
      lastFilesUploadedAt={lastFilesUploadedAt}
    />
  )
}
