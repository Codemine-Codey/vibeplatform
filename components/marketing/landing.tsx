'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { motion, AnimatePresence, useInView, animate } from 'framer-motion'
import {
  ArrowRight,
  Sparkles,
  MessageSquare,
  Rocket,
  Eye,
  Database,
  Image as ImageIcon,
  Globe,
  Wand2,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Reveal } from '@/components/marketing/reveal'
import { MarketingRoot } from '@/components/marketing/marketing-shell'
import { AuroraHero } from '@/components/ui/futurastic-hero-section'
import { cn } from '@/lib/utils'

export function Landing() {
  return (
    <MarketingRoot>
      <SiteNav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Stats />
        <Reviews />
        <ClosingCTA />
      </main>
      <SiteFooter />
    </MarketingRoot>
  )
}

/* ------------------------------------------------------------------ HERO */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* dark aurora background layer (blue glow) — hidden in light mode by the shell */}
      <AuroraHero />

      {/* light-mode-only hero wash — a clean warm/blue gradient so light looks intentional */}
      <div
        aria-hidden
        className="cm-light-only pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(60% 55% at 50% -8%, rgba(37,99,235,0.10), transparent 60%), radial-gradient(50% 50% at 85% 10%, rgba(124,58,237,0.08), transparent 60%)',
        }}
      />

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-5 py-28 text-center lg:py-40">
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 text-4xl font-semibold leading-[1.03] tracking-tight text-[var(--cm-heading)] sm:text-6xl lg:text-7xl"
        >
          Turn your idea into a{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                'linear-gradient(to right, var(--cm-grad-from), var(--cm-grad-via), var(--cm-grad-to))',
            }}
          >
            live web app
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--cm-body)]"
        >
          Describe what you want. Codemine writes the code, runs it, and deploys a
          real, working app you can share — no setup, no boilerplate.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="mt-9"
        >
          <Button
            asChild
            size="lg"
            className="h-12 bg-blue-600 px-7 text-base text-white shadow-lg shadow-blue-900/30 hover:bg-blue-500"
          >
            <Link href="/signup">
              Start now
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-4 text-sm text-[var(--cm-muted)]"
        >
          No credit card required · Free to start
        </motion.p>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------- HOW IT WORKS */
const HOW_STEPS = [
  {
    icon: Wand2,
    title: 'Prompt',
    body: 'Describe your idea in plain English — a landing page, a dashboard, a game. Whatever you have in mind.',
    accent: 'from-sky-500 to-blue-400',
  },
  {
    icon: MessageSquare,
    title: 'Build & iterate',
    body: 'Codemine writes the code and runs it. Chat to refine — change colors, add a page, wire up a form.',
    accent: 'from-blue-500 to-indigo-400',
  },
  {
    icon: Rocket,
    title: 'Deploy',
    body: 'One click and your app is live on a real URL, ready to share with the world.',
    accent: 'from-indigo-500 to-blue-400',
  },
] as const

function HowItWorks() {
  const [active, setActive] = useState(0)
  const sectionRef = useRef<HTMLDivElement>(null)
  const inView = useInView(sectionRef, { margin: '-120px' })

  // Auto-advance the active step while the section is on screen.
  useEffect(() => {
    if (!inView) return
    const id = setInterval(() => {
      setActive((a) => (a + 1) % HOW_STEPS.length)
    }, 3400)
    return () => clearInterval(id)
  }, [inView])

  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium text-[var(--cm-accent)]">How it works</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--cm-heading)] sm:text-4xl">
          Three steps from idea to live app
        </h2>
      </Reveal>

      <div
        ref={sectionRef}
        className="mt-12 grid items-center gap-8 lg:mt-16 lg:grid-cols-2 lg:gap-16"
      >
        {/* left — the steps */}
        <div className="flex flex-col gap-3">
          {HOW_STEPS.map((step, i) => {
            const isActive = i === active
            return (
              <button
                key={step.title}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  'group relative flex gap-4 rounded-2xl border p-5 text-left transition-all',
                  isActive
                    ? 'border-[var(--cm-border)] bg-[var(--cm-card)] shadow-lg shadow-black/10'
                    : 'border-transparent hover:bg-[var(--cm-wash)]',
                )}
              >
                <div
                  className={cn(
                    'flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-opacity',
                    step.accent,
                    isActive ? 'opacity-100' : 'opacity-45',
                  )}
                >
                  <step.icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--cm-faint)]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-lg font-semibold text-[var(--cm-heading)]">{step.title}</h3>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--cm-muted)]">
                    {step.body}
                  </p>
                  {isActive && (
                    <motion.div
                      layoutId="how-active-bar"
                      className="mt-3 h-0.5 w-16 rounded-full bg-gradient-to-r from-sky-400 to-indigo-400"
                    />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* right — the visual that changes per step */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-card)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)] backdrop-blur">
          {/* window chrome */}
          <div className="flex items-center gap-2 border-b border-[var(--cm-border-soft)] px-4 py-3">
            <span className="size-3 rounded-full bg-red-400/80" />
            <span className="size-3 rounded-full bg-amber-400/80" />
            <span className="size-3 rounded-full bg-green-400/80" />
          </div>
          <div className="relative h-[320px]">
            <AnimatePresence mode="wait">
              {active === 0 && <PromptVisual key="prompt" />}
              {active === 1 && <CodeVisual key="code" />}
              {active === 2 && <PreviewVisual key="preview" />}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}

function VisualShell({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0 p-5"
    >
      {children}
    </motion.div>
  )
}

const PROMPT_TEXT = 'Build a coffee shop landing page with an online menu'

// Step 1 — a prompt typing itself into a fake input.
function PromptVisual() {
  const [text, setText] = useState('')

  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i += 1
      setText(PROMPT_TEXT.slice(0, i))
      if (i >= PROMPT_TEXT.length) clearInterval(id)
    }, 45)
    return () => clearInterval(id)
  }, [])

  return (
    <VisualShell>
      <div className="flex h-full flex-col justify-center">
        <div className="text-xs font-medium text-[var(--cm-muted)]">Your prompt</div>
        <div className="mt-3 rounded-xl border border-[var(--cm-border)] bg-[var(--cm-inset)] p-4">
          <p className="min-h-[3.5rem] text-[15px] leading-relaxed text-[var(--cm-heading)]">
            {text}
            <motion.span
              aria-hidden
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
              className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-blue-400 align-middle"
            />
          </p>
        </div>
        <div className="mt-4 flex justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white">
            <Sparkles className="size-3.5" /> Generate
          </span>
        </div>
      </div>
    </VisualShell>
  )
}

type CodeSpan = { text: string; className?: string }

const CODE_LINES: CodeSpan[][] = [
  [
    { text: 'export default function ', className: 'text-violet-400' },
    { text: 'Hero', className: 'text-sky-300' },
    { text: '() {' },
  ],
  [{ text: '  return (', className: 'text-neutral-500' }],
  [
    { text: '    <section ', className: 'text-orange-300' },
    { text: 'className', className: 'text-sky-300' },
    { text: '=', className: 'text-neutral-500' },
    { text: '"hero"', className: 'text-emerald-300' },
    { text: '>' },
  ],
  [
    { text: '      <h1>', className: 'text-orange-300' },
    { text: 'Roasted & Co.' },
    { text: '</h1>', className: 'text-orange-300' },
  ],
  [
    { text: '      <p>', className: 'text-orange-300' },
    { text: 'Specialty coffee, slow mornings' },
    { text: '</p>', className: 'text-orange-300' },
  ],
  [{ text: '    </section>', className: 'text-orange-300' }],
  [{ text: '  )', className: 'text-neutral-500' }],
  [{ text: '}' }],
]

// Step 2 — code appearing one line at a time. Rendered on a fixed dark editor
// surface in both themes (a code editor reads well dark on a light page).
function CodeVisual() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= CODE_LINES.length) {
          clearInterval(id)
          return c
        }
        return c + 1
      })
    }, 240)
    return () => clearInterval(id)
  }, [])

  return (
    <VisualShell>
      <div className="flex h-full flex-col">
        <div className="text-xs font-medium text-[var(--cm-muted)]">Writing Hero.tsx</div>
        <div className="mt-3 flex-1 overflow-hidden rounded-xl border border-[var(--cm-border)] bg-[#0b1020] p-4 font-mono text-[12px] leading-6">
          {CODE_LINES.slice(0, count).map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="whitespace-pre"
            >
              <span className="mr-3 select-none text-neutral-600">
                {String(i + 1).padStart(2, '0')}
              </span>
              {line.map((span, j) => (
                <span key={j} className={span.className ?? 'text-neutral-100'}>
                  {span.text}
                </span>
              ))}
            </motion.div>
          ))}
        </div>
      </div>
    </VisualShell>
  )
}

// Step 3 — skeleton blocks assembling into a little app preview.
function PreviewVisual() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setReady(true), 950)
    return () => clearTimeout(id)
  }, [])

  return (
    <VisualShell>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-[var(--cm-muted)]">Live preview</div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500 ring-1 ring-emerald-400/20">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Deployed
          </span>
        </div>
        <div className="mt-3 flex-1 overflow-hidden rounded-xl border border-[var(--cm-border)]">
          <div className="relative h-24 overflow-hidden bg-gradient-to-br from-amber-200 via-orange-200 to-rose-200">
            <AnimatePresence>
              {ready && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="absolute bottom-3 left-3"
                >
                  <div className="text-sm font-semibold text-neutral-900">Roasted &amp; Co.</div>
                  <div className="text-[10px] text-neutral-700">Specialty coffee, slow mornings</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="space-y-2 bg-white p-3">
            {!ready ? (
              <>
                <div className="h-2 w-2/3 animate-pulse rounded bg-neutral-200" />
                <div className="h-2 w-full animate-pulse rounded bg-neutral-200" />
                <div className="h-2 w-4/5 animate-pulse rounded bg-neutral-200" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 animate-pulse rounded-md bg-neutral-200" />
                  ))}
                </div>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
              >
                <div className="h-2 w-2/3 rounded bg-neutral-300" />
                <div className="mt-2 h-2 w-full rounded bg-neutral-200" />
                <div className="mt-2 h-2 w-4/5 rounded bg-neutral-200" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-1.5 rounded-md bg-neutral-100 p-2">
                      <div className="h-8 rounded bg-gradient-to-br from-amber-100 to-orange-100" />
                      <div className="h-1.5 w-3/4 rounded bg-neutral-200" />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </VisualShell>
  )
}

/* -------------------------------------------------------------- FEATURES */
// features-8 style: an asymmetric bento — one large spotlight anchor, a couple
// of medium cards, one wide accent card, and a compact numbered strip. Varied
// sizes + icons give it editorial rhythm rather than an even grid.
const bentoContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
}

const bentoItem = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 100, damping: 12 },
  },
}

// A translucent bento card that reads in both themes.
function BentoCard({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <motion.div
      variants={bentoItem}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-3xl border border-[var(--cm-border)] bg-[var(--cm-card)] p-7 shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:border-[var(--cm-border-strong)] hover:bg-[var(--cm-card-hover)]',
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

// A compact, index-numbered feature — used in the editorial bottom strip.
function FeatureLine({
  index,
  icon: Icon,
  title,
  body,
  accent,
}: {
  index: number
  icon: ComponentType<{ className?: string }>
  title: string
  body: string
  accent: string
}) {
  return (
    <motion.div
      variants={bentoItem}
      className="group relative flex flex-col rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-card)] p-6 shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:border-[var(--cm-border-strong)] hover:bg-[var(--cm-card-hover)]"
    >
      <span
        className={cn(
          'absolute left-0 top-6 h-9 w-1 rounded-r-full bg-gradient-to-b',
          accent,
        )}
      />
      <div className="flex items-center justify-between">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--cm-inset)] text-[var(--cm-accent)] ring-1 ring-[var(--cm-border)]">
          <Icon className="size-5" />
        </div>
        <span className="text-sm font-semibold tabular-nums text-[var(--cm-faint)]">
          {String(index).padStart(2, '0')}
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold text-[var(--cm-heading)]">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--cm-muted)]">{body}</p>
    </motion.div>
  )
}

function Features() {
  return (
    <section className="border-y border-[var(--cm-border-soft)] bg-[var(--cm-wash)]">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium text-[var(--cm-accent)]">Everything included</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--cm-heading)] sm:text-4xl">
            A full stack, handled for you
          </h2>
          <p className="mt-3 max-w-lg text-[var(--cm-muted)]">
            The pieces you would normally wire together yourself — already connected, from the very first prompt.
          </p>
        </Reveal>

        <motion.div
          variants={bentoContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-14 grid auto-rows-auto gap-5 lg:grid-cols-12"
        >
          {/* SPOTLIGHT — large highlighted feature (Cloudmine), the anchor */}
          <motion.div
            variants={bentoItem}
            className="group relative flex flex-col overflow-hidden rounded-3xl border border-[var(--cm-panel-border)] bg-[var(--cm-panel)] p-8 shadow-xl lg:col-span-7 lg:row-span-2"
          >
            <div
              className="cm-panel-glow pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(60% 60% at 12% 0%, rgba(59,130,246,0.4), transparent 60%), radial-gradient(55% 65% at 100% 100%, rgba(79,70,229,0.32), transparent 60%)',
              }}
            />
            <div className="relative flex flex-1 flex-col">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-medium text-[var(--cm-accent)] ring-1 ring-blue-400/25">
                <Sparkles className="size-3" /> Cloudmine
              </span>
              <div className="mt-5 flex size-12 items-center justify-center rounded-2xl bg-[var(--cm-panel-inset)] text-[var(--cm-panel-heading)] ring-1 ring-[var(--cm-panel-border)] backdrop-blur">
                <Database className="size-6" />
              </div>
              <h3 className="mt-6 text-2xl font-semibold tracking-tight text-[var(--cm-panel-heading)]">
                Database, auth &amp; storage — built in
              </h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--cm-panel-body)]">
                Cloudmine wires up a real database, sign-in, secrets, and file storage
                the moment you need them — zero config, zero dashboards.
              </p>
              <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {[
                  'Postgres database, ready to query',
                  'Email & social sign-in',
                  'Encrypted secrets & env vars',
                  'File & image storage',
                ].map((point) => (
                  <li
                    key={point}
                    className="flex items-center gap-2.5 text-sm text-[var(--cm-panel-body)]"
                  >
                    <Check className="size-4 shrink-0 text-blue-400" />
                    {point}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <div className="rounded-2xl border border-[var(--cm-panel-border)] bg-[var(--cm-panel-inset)] p-4 backdrop-blur">
                  <div className="flex items-center gap-2 text-xs font-medium text-[var(--cm-panel-body)]">
                    <Database className="size-3.5" /> users
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-2 w-full rounded bg-[var(--cm-panel-bar)]" />
                    <div className="h-2 w-4/5 rounded bg-[var(--cm-panel-bar-soft)]" />
                    <div className="h-2 w-2/3 rounded bg-[var(--cm-panel-bar-soft)]" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* WIDE ACCENT — Chat to edit (branded gradient, both themes) */}
          <motion.div
            variants={bentoItem}
            className="group relative flex flex-col overflow-hidden rounded-3xl border border-blue-400/25 bg-gradient-to-br from-blue-500/[0.14] to-indigo-500/[0.10] p-7 shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:border-blue-400/40 lg:col-span-5"
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-md shadow-blue-900/30">
              <Wand2 className="size-5" />
            </div>
            <h3 className="mt-4 text-xl font-semibold text-[var(--cm-heading)]">Chat to edit</h3>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--cm-body)]">
              Describe a change in plain English and watch it happen live — no code, no
              waiting. &ldquo;Make the hero warmer&rdquo; just works.
            </p>
          </motion.div>

          {/* MEDIUM — Instant live preview */}
          <BentoCard className="lg:col-span-5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-[var(--cm-inset)] text-[var(--cm-accent)] ring-1 ring-[var(--cm-border)]">
              <Eye className="size-5" />
            </div>
            <h3 className="mt-4 text-xl font-semibold text-[var(--cm-heading)]">
              Instant live preview
            </h3>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--cm-muted)]">
              Watch your app build and run in real time as it is generated — every change,
              on screen the moment it lands.
            </p>
          </BentoCard>

          {/* EDITORIAL STRIP — three compact, numbered features */}
          <div className="grid gap-5 sm:grid-cols-3 lg:col-span-12">
            <FeatureLine
              index={1}
              icon={Rocket}
              title="One-click deploy"
              body="Ship to a real, shareable URL the moment it is ready."
              accent="from-sky-500 to-blue-400"
            />
            <FeatureLine
              index={2}
              icon={ImageIcon}
              title="AI images, on brand"
              body="Contextual imagery placed automatically — never a grey box."
              accent="from-blue-500 to-indigo-400"
            />
            <FeatureLine
              index={3}
              icon={Globe}
              title="Custom domains"
              body="Point your own domain at the finished app in a few clicks."
              accent="from-indigo-500 to-violet-400"
            />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- STATS */
type Stat = {
  value: number
  label: string
  prefix?: string
  suffix?: string
  decimals?: number
}

const STATS: Stat[] = [
  { value: 5000, suffix: '+', label: 'Apps built' },
  { value: 300, prefix: '<', suffix: 's', label: 'To first preview' },
  { value: 98, suffix: '%', label: 'Uptime' },
]

// Counts up from 0 to `value` once it scrolls into view.
function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const [display, setDisplay] = useState(() =>
    (0).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
  )

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        setDisplay(
          latest.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          }),
        )
      },
    })
    return () => controls.stop()
  }, [inView, value, decimals])

  return <span ref={ref}>{display}</span>
}

function Stats() {
  return (
    <section className="border-y border-[var(--cm-border-soft)] bg-[var(--cm-wash)]">
      <div className="mx-auto max-w-5xl px-5 py-16 lg:py-20">
        <div className="grid grid-cols-1 gap-8 text-center sm:grid-cols-3">
          {STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.08}>
              <div
                className="bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl"
                style={{
                  backgroundImage:
                    'linear-gradient(to bottom, var(--cm-heading), var(--cm-stat-to))',
                }}
              >
                {stat.prefix ?? ''}
                <CountUp value={stat.value} decimals={stat.decimals ?? 0} />
                {stat.suffix ?? ''}
              </div>
              <div className="mt-2 text-sm text-[var(--cm-muted)]">{stat.label}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- REVIEWS */
type Review = { name: string; handle: string; quote: string }

const REVIEWS: Review[] = [
  {
    name: 'Ayesha Khan',
    handle: '@ayeshabuilds',
    quote:
      'I described a bakery site and watched it appear, section by section. Live in under ten minutes — I still can’t believe I wrote zero code.',
  },
  {
    name: 'Bilal Ahmed',
    handle: '@bilaldev',
    quote:
      'Built and deployed my portfolio during a lunch break. Typed “make the hero warmer” and it just… happened, right in front of me.',
  },
  {
    name: 'Fatima Riaz',
    handle: '@fatimar',
    quote:
      'The database and login were already there. No config, no dashboards — I just asked for a waitlist and it saved signups instantly.',
  },
  {
    name: 'Usman Malik',
    handle: '@usmanm',
    quote:
      'Shipped a working invoice app for my shop in an afternoon. Editing by chatting feels like magic — describe it, it changes.',
  },
  {
    name: 'David Park',
    handle: '@davidpark',
    quote:
      'I made a little browser game with my kid on a Sunday. From idea to a real URL we could share, no setup at all.',
  },
  {
    name: 'Zara Sheikh',
    handle: '@zarasheikh',
    quote:
      'The live preview sold me. I iterate on layout just by talking to it, and the result looks designed — not a template.',
  },
  {
    name: 'Hamza Iqbal',
    handle: '@hamzaiqbal',
    quote:
      'One click and my app was live on a real domain. My co-founder thought we hired an agency.',
  },
  {
    name: 'Sana Tariq',
    handle: '@sanatariq',
    quote:
      'Prototyped three internal tools in a week. Deploy is one button and everything just works on the first try.',
  },
  {
    name: 'Sofia Rodriguez',
    handle: '@sofiacodes',
    quote:
      'I’m a designer, not an engineer. Codemine let me ship a real, working product without ever opening a code editor.',
  },
  {
    name: 'Ali Raza',
    handle: '@aliraza',
    quote:
      'Asked for a dashboard with charts and it built the whole thing — data, auth, deploy. Minutes, not weeks.',
  },
  {
    name: 'Mahnoor Aslam',
    handle: '@mahnooraslam',
    quote:
      'The AI edits live while I watch. I changed the entire color scheme by just saying so. Genuinely the fastest I’ve ever shipped.',
  },
]

function ReviewCard({ review }: { review: Review }) {
  return (
    <figure className="flex w-[340px] shrink-0 flex-col rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-card)] p-6 shadow-sm backdrop-blur">
      <blockquote className="flex-1 text-[15px] leading-relaxed text-[var(--cm-body)]">
        “{review.quote}”
      </blockquote>
      <figcaption className="mt-5">
        <div className="text-sm font-semibold text-[var(--cm-heading)]">{review.name}</div>
        <div className="text-xs text-[var(--cm-accent)]">{review.handle}</div>
      </figcaption>
    </figure>
  )
}

function MarqueeRow({
  reviews,
  reverse = false,
}: {
  reviews: Review[]
  reverse?: boolean
}) {
  return (
    <div className="group flex overflow-hidden [--gap:1.5rem] [--speed:60s]">
      {[0, 1].map((dup) => (
        <div
          key={dup}
          aria-hidden={dup === 1}
          className={cn(
            'flex shrink-0 gap-[var(--gap)] pr-[var(--gap)]',
            reverse ? 'animate-cm-marquee-reverse' : 'animate-cm-marquee',
            'group-hover:[animation-play-state:paused]',
          )}
        >
          {reviews.map((r, i) => (
            <ReviewCard key={`${r.handle}-${i}`} review={r} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Reviews() {
  const firstRow = REVIEWS.slice(0, Math.ceil(REVIEWS.length / 2))
  const secondRow = REVIEWS.slice(Math.ceil(REVIEWS.length / 2))

  return (
    <section className="overflow-hidden py-20 lg:py-28">
      <style>{`
        @keyframes cm-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(calc(-100% - var(--gap))); }
        }
        @keyframes cm-marquee-reverse {
          from { transform: translateX(calc(-100% - var(--gap))); }
          to { transform: translateX(0); }
        }
        .animate-cm-marquee { animation: cm-marquee var(--speed) linear infinite; }
        .animate-cm-marquee-reverse { animation: cm-marquee-reverse var(--speed) linear infinite; }
      `}</style>

      <Reveal className="mx-auto max-w-2xl px-5 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-[var(--cm-heading)] sm:text-4xl">
          Loved by builders everywhere
        </h2>
        <p className="mt-3 text-[var(--cm-muted)]">
          From first-time makers to seasoned founders — people are shipping real apps in minutes.
        </p>
      </Reveal>

      <div className="relative mt-14 flex flex-col gap-6">
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[var(--cm-fade)] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[var(--cm-fade)] to-transparent" />
        <MarqueeRow reviews={firstRow} />
        <MarqueeRow reviews={secondRow} reverse />
      </div>
    </section>
  )
}

/* ----------------------------------------------------------- CLOSING CTA */
function ClosingCTA() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-[var(--cm-panel-border)] bg-[var(--cm-panel)] px-6 py-16 text-center shadow-xl sm:px-16">
          <div
            className="cm-panel-glow pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(50% 60% at 20% 0%, rgba(59,130,246,0.4), transparent 60%), radial-gradient(50% 60% at 85% 100%, rgba(79,70,229,0.35), transparent 60%)',
            }}
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-[var(--cm-panel-heading)] sm:text-4xl">
              Your next app is one sentence away
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-[var(--cm-panel-body)]">
              Describe it, watch it build, and put it live today. Free to start — no credit card.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 bg-blue-600 px-7 text-base text-white shadow-lg shadow-blue-900/30 hover:bg-blue-500"
              >
                <Link href="/signup">
                  Start now
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="h-12 px-7 text-base text-[var(--cm-panel-heading)] hover:bg-[var(--cm-panel-inset)] hover:text-[var(--cm-panel-heading)]"
              >
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
