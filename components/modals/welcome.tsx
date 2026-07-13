'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { InfoIcon, GlobeIcon, LayoutDashboardIcon, GamepadIcon, ZapIcon } from 'lucide-react'
import { create } from 'zustand'
import { useEffect } from 'react'

const CAPABILITIES = [
  { icon: GlobeIcon, label: 'Websites', desc: 'Landing pages, portfolios & agency sites with real design and images.' },
  { icon: LayoutDashboardIcon, label: 'Web Apps', desc: 'Functional dashboards, tools & apps with state, routing, persistence.' },
  { icon: GamepadIcon, label: 'Games', desc: 'Playable browser games — Snake, Flappy Bird, Breakout, and more.' },
]

interface State {
  open: boolean | undefined
  setOpen: (open: boolean) => void
}

export const useWelcomeStore = create<State>((set) => ({
  open: undefined,
  setOpen: (open) => set({ open }),
}))

export function Welcome(props: {
  onDismissAction(): void
  defaultOpen: boolean
}) {
  const { open, setOpen } = useWelcomeStore()

  useEffect(() => {
    setOpen(props.defaultOpen)
  }, [setOpen, props.defaultOpen])

  if (!(typeof open === 'undefined' ? props.defaultOpen : open)) {
    return null
  }

  const handleDismiss = () => {
    props.onDismissAction()
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleDismiss} />
      <div
        className="relative bg-background max-w-md w-full mx-4 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-foreground/5 to-foreground/10 px-6 pt-6 pb-5 border-b border-primary/10">
          <div className="flex items-center gap-2 mb-3">
            <ZapIcon className="w-5 h-5" />
            <span className="text-lg font-bold tracking-tight">Codemine</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Describe what you want to build and your AI builder creates it — fully working and live within minutes.
          </p>
        </div>

        {/* Capabilities */}
        <div className="px-6 py-5 grid grid-cols-3 gap-4">
          {CAPABILITIES.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold">{label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
            </div>
          ))}
        </div>

        <footer className="px-6 py-4 border-t border-primary/8 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">No setup needed. Just describe what you want.</p>
          <Button onClick={handleDismiss} size="sm" className="shrink-0 cursor-pointer">
            Start building
          </Button>
        </footer>
      </div>
    </div>
  )
}

export function ToggleWelcome() {
  const { open, setOpen } = useWelcomeStore()
  return (
    <Button
      className="cursor-pointer"
      onClick={() => setOpen(!open)}
      variant="outline"
      size="sm"
    >
      <InfoIcon /> <span className="hidden lg:inline">What&apos;s this?</span>
    </Button>
  )
}

function ExternalLink({
  children,
  href,
}: {
  children: ReactNode
  href: string
}) {
  return (
    <a
      className="underline underline-offset-3 text-primary"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  )
}
