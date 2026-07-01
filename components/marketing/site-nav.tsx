'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const LINKS = [
  { label: 'Home', href: '/home' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
]

export function SiteNav() {
  const [open, setOpen] = useState(false)

  return (
    // Floating, centered glass pill. `sticky` keeps it in normal flow so the
    // content below is never hidden behind it.
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div className="mx-auto flex max-w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-2 py-2 text-neutral-100 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:gap-4">
        {/* logo */}
        <Link href="/home" className="flex shrink-0 items-center gap-2 pl-2 pr-1">
          <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md shadow-blue-900/40">
            <Zap className="size-4" />
          </span>
          <span className="text-base font-semibold tracking-tight text-white">Codemine</span>
        </Link>

        {/* centered links */}
        <nav className="hidden items-center md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="rounded-full px-3.5 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* auth actions */}
        <div className="hidden items-center gap-1.5 pl-1 md:flex">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="rounded-full text-neutral-200 hover:bg-white/10 hover:text-white"
          >
            <Link href="/login">Sign in</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="rounded-full bg-blue-600 text-white hover:bg-blue-500"
          >
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>

        {/* mobile trigger */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          className="flex size-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* mobile sheet — a compact card that drops under the pill */}
      <div
        className={cn(
          'mx-auto mt-2 max-w-fit overflow-hidden rounded-3xl border bg-[#0a0f22]/95 shadow-lg backdrop-blur-xl transition-all md:hidden',
          open
            ? 'max-h-96 border-white/10 opacity-100'
            : 'pointer-events-none max-h-0 border-transparent opacity-0',
        )}
        style={{ transition: 'max-height 260ms ease, opacity 200ms ease' }}
      >
        <div className="flex w-64 flex-col gap-1 p-3">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm text-neutral-300 hover:bg-white/10 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2">
            <Button
              asChild
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-white/15 bg-transparent text-neutral-100 hover:bg-white/10 hover:text-white"
            >
              <Link href="/login">Sign in</Link>
            </Button>
            <Button
              asChild
              onClick={() => setOpen(false)}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              <Link href="/signup">Sign up</Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
