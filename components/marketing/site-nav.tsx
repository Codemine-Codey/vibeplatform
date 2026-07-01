'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const LINKS = [
  { label: 'Home', href: '/home' },
  { label: 'Pricing', href: '/home#pricing' },
]

export function SiteNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-black/[0.06] bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/home" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
            <Zap className="size-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Codemine</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          className="flex size-9 items-center justify-center rounded-md text-foreground md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <div
        className={cn(
          'overflow-hidden border-t border-black/[0.06] md:hidden',
          open ? 'max-h-72' : 'max-h-0 border-transparent'
        )}
        style={{ transition: 'max-height 260ms ease' }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-3">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2">
            <Button asChild variant="outline" onClick={() => setOpen(false)}>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild onClick={() => setOpen(false)}>
              <Link href="/signup">Sign up</Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
