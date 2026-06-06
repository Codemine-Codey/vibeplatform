'use client'

import { XIcon } from 'lucide-react'
import { useState } from 'react'

interface Props {
  defaultOpen: boolean
  onDismiss: () => void
}

export function Banner({ defaultOpen, onDismiss }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  if (!open) {
    return null
  }

  return (
    <div className="relative full text-xs border border-dashed border-blue-400 bg-blue-50 py-2 pl-2 pr-8">
      <strong>Codemine Beta</strong> — Describe what you want to build and your AI builder will create it for you. Websites, web apps, and web games — fully working and deployed instantly.
      <button
        aria-label="Close Banner"
        className="absolute top-2 right-2 text-yellow-700 hover:text-yellow-900 transition-colors cursor-pointer"
        onClick={() => {
          onDismiss()
          setOpen(false)
        }}
      >
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  )
}
