'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { SiteThemeToggle } from '@/components/marketing/marketing-shell'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MotionDiv = motion.div as any

const LINKS = [
  { label: 'About', href: '/about' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Contact', href: '/contact' },
]

export function SiteNav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`fixed left-1/2 z-50 w-full -translate-x-1/2 px-4 transition-all duration-300 ${
        scrolled || mobileOpen ? 'top-4 max-w-4xl' : 'top-6 max-w-5xl'
      }`}
    >
      <MotionDiv
        initial={false}
        animate={{ borderRadius: mobileOpen ? 24 : 50 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        style={{ backgroundColor: mobileOpen ? 'var(--cm-panel)' : 'var(--cm-nav)' }}
        className="w-full overflow-hidden border border-[var(--cm-border)] shadow-lg shadow-black/10 backdrop-blur-xl transition-colors"
      >
        <div className="relative flex h-14 items-center justify-between px-4 md:h-16">
          {/* Logo */}
          <Link
            href="/home"
            className="group flex shrink-0 items-center gap-2"
            onClick={() => setMobileOpen(false)}
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-blue-500/20 opacity-0 blur-xl transition-opacity group-hover:opacity-100" />
              <Logo className="relative z-10 h-7 w-7" />
            </div>
            <span className="text-base font-bold tracking-tight text-[var(--cm-heading)] transition-colors group-hover:text-[var(--cm-accent)]">
              Codemine
            </span>
          </Link>

          {/* Center links */}
          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center justify-center gap-1 rounded-full border border-[var(--cm-border-soft)] bg-[var(--cm-inset)] p-1 backdrop-blur-md md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="rounded-full px-4 py-1.5 text-xs font-medium text-[var(--cm-muted)] transition-all hover:bg-[var(--cm-hover)] hover:text-[var(--cm-heading)]"
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Auth + theme toggle */}
          <div className="hidden shrink-0 items-center justify-end gap-2 md:flex">
            <SiteThemeToggle />
            <Link
              href="/login"
              className="px-2 text-xs font-medium text-[var(--cm-muted)] transition-colors hover:text-[var(--cm-heading)]"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-900/20 transition-all hover:scale-105 hover:bg-blue-500 active:scale-95"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 md:hidden">
            <SiteThemeToggle className="size-8" />
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center text-[var(--cm-muted)] transition-colors hover:text-[var(--cm-heading)]"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <MotionDiv
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden border-t border-[var(--cm-border)] md:hidden"
            >
              <div className="flex flex-col gap-2 p-4 pb-6">
                {LINKS.map((l) => (
                  <Link
                    key={l.label}
                    href={l.href}
                    onClick={() => setMobileOpen(false)}
                    className="w-full rounded-xl px-4 py-3 text-left text-sm font-medium text-[var(--cm-body)] transition-colors hover:bg-[var(--cm-hover)] hover:text-[var(--cm-heading)]"
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="my-2 h-px bg-[var(--cm-border)]" />
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="w-full rounded-xl px-4 py-3 text-left text-sm font-medium text-[var(--cm-body)] transition-colors hover:bg-[var(--cm-hover)] hover:text-[var(--cm-heading)]"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 w-full rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white transition-all hover:bg-blue-500"
                >
                  Get Started
                </Link>
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>
      </MotionDiv>
    </nav>
  )
}
