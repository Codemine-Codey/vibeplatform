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
import { cn } from '@/lib/utils'

export function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
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
    </div>
  )
}

/* ------------------------------------------------------------------ HERO */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* warm ambient wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(55% 45% at 50% 0%, rgba(139,92,246,0.10), transparent 60%), radial-gradient(45% 45% at 85% 15%, rgba(251,146,60,0.12), transparent 60%)',
        }}
      />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-5 py-24 text-center lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm"
        >
          <Sparkles className="size-3.5 text-violet-500" />
          From prompt to production in minutes
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 text-4xl font-semibold leading-[1.03] tracking-tight text-neutral-900 sm:text-6xl lg:text-7xl"
        >
          Turn a sentence into a{' '}
          <span className="bg-gradient-to-r from-violet-600 to-orange-500 bg-clip-text text-transparent">
            live web app
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-600"
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
          <Button asChild size="lg" className="h-12 px-7 text-base">
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
          className="mt-4 text-sm text-muted-foreground"
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
    accent: 'from-violet-500 to-violet-400',
  },
  {
    icon: MessageSquare,
    title: 'Build & iterate',
    body: 'Codemine writes the code and runs it. Chat to refine — change colors, add a page, wire up a form.',
    accent: 'from-orange-500 to-amber-400',
  },
  {
    icon: Rocket,
    title: 'Deploy',
    body: 'One click and your app is live on a real URL, ready to share with the world.',
    accent: 'from-emerald-500 to-teal-400',
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
        <p className="text-sm font-medium text-violet-600">How it works</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
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
                    ? 'border-black/[0.09] bg-card shadow-md'
                    : 'border-transparent hover:bg-card/60',
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
                    <span className="text-xs font-semibold text-muted-foreground">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-lg font-semibold text-neutral-900">{step.title}</h3>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                  {isActive && (
                    <motion.div
                      layoutId="how-active-bar"
                      className="mt-3 h-0.5 w-16 rounded-full bg-gradient-to-r from-violet-500 to-orange-500"
                    />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* right — the visual that changes per step */}
        <div className="relative overflow-hidden rounded-2xl border border-black/[0.08] bg-card shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)]">
          {/* window chrome */}
          <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-3">
            <span className="size-3 rounded-full bg-red-400" />
            <span className="size-3 rounded-full bg-amber-400" />
            <span className="size-3 rounded-full bg-green-400" />
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
        <div className="text-xs font-medium text-muted-foreground">Your prompt</div>
        <div className="mt-3 rounded-xl border border-black/[0.1] bg-secondary/50 p-4">
          <p className="min-h-[3.5rem] text-[15px] leading-relaxed text-neutral-900">
            {text}
            <motion.span
              aria-hidden
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
              className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-neutral-900 align-middle"
            />
          </p>
        </div>
        <div className="mt-4 flex justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white">
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

// Step 2 — code appearing one line at a time.
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
        <div className="text-xs font-medium text-muted-foreground">Writing Hero.tsx</div>
        <div className="mt-3 flex-1 overflow-hidden rounded-xl bg-neutral-900 p-4 font-mono text-[12px] leading-6">
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
          <div className="text-xs font-medium text-muted-foreground">Live preview</div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Deployed
          </span>
        </div>
        <div className="mt-3 flex-1 overflow-hidden rounded-xl border border-black/[0.08]">
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
          <div className="space-y-2 p-3">
            {!ready ? (
              <>
                <div className="h-2 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-2 w-full animate-pulse rounded bg-muted" />
                <div className="h-2 w-4/5 animate-pulse rounded bg-muted" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
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
                <div className="mt-2 h-2 w-full rounded bg-muted" />
                <div className="mt-2 h-2 w-4/5 rounded bg-muted" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-1.5 rounded-md bg-secondary p-2">
                      <div className="h-8 rounded bg-gradient-to-br from-amber-100 to-orange-100" />
                      <div className="h-1.5 w-3/4 rounded bg-muted" />
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
const bentoContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1 },
  },
}

const bentoItem = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 100, damping: 10 },
  },
}

function BentoCard({
  icon: Icon,
  title,
  body,
  className,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  body: string
  className?: string
  children?: ReactNode
}) {
  return (
    <motion.div
      variants={bentoItem}
      className={cn(
        'group flex h-full flex-col rounded-2xl border border-black/[0.07] bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-xl bg-neutral-900 text-white shadow-sm">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
      {children}
    </motion.div>
  )
}

function Features() {
  return (
    <section className="border-y border-black/[0.06] bg-secondary/40">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-orange-600">Everything included</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            A full stack, handled for you
          </h2>
          <p className="mt-3 text-muted-foreground">
            The pieces you would normally wire together yourself — already connected.
          </p>
        </Reveal>

        <motion.div
          variants={bentoContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-14 grid auto-rows-[minmax(180px,auto)] grid-cols-1 gap-6 md:grid-cols-3 md:grid-rows-3"
        >
          {/* TALL — Cloud, built in */}
          <BentoCard
            icon={Database}
            title="Cloud, built in"
            body="Database, auth, secrets, and file storage wired up the moment you need them — zero config, zero dashboards."
            className="md:row-span-3"
          >
            <div className="mt-6 flex-1" />
            <ul className="space-y-2.5">
              {[
                'Postgres database, ready to query',
                'Email & social sign-in',
                'Encrypted secrets & env vars',
                'File & image storage',
              ].map((point) => (
                <li key={point} className="flex items-center gap-2.5 text-sm text-neutral-700">
                  <Check className="size-4 shrink-0 text-orange-600" />
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-xl border border-black/[0.06] bg-secondary/60 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
                <Database className="size-3.5" /> users
              </div>
              <div className="mt-2 space-y-1.5">
                <div className="h-2 w-full rounded bg-muted" />
                <div className="h-2 w-4/5 rounded bg-muted" />
                <div className="h-2 w-2/3 rounded bg-muted" />
              </div>
            </div>
          </BentoCard>

          {/* 1x1 cards */}
          <BentoCard
            icon={Eye}
            title="Instant live preview"
            body="Watch your app build and run in real time as it is generated."
          />
          <BentoCard
            icon={Rocket}
            title="One-click deploy"
            body="Ship to a real, shareable URL the moment it is ready."
          />
          <BentoCard
            icon={ImageIcon}
            title="AI images, on brand"
            body="Beautiful, contextual imagery placed automatically — never a grey box."
          />
          <BentoCard
            icon={Globe}
            title="Custom domains"
            body="Point your own domain at your finished app in a few clicks."
          />

          {/* WIDE — Chat to edit */}
          <BentoCard
            icon={Wand2}
            title="Chat to edit"
            body="Describe a change in plain English and watch it happen live — no code, no waiting."
            className="md:col-span-2"
          />
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
  { value: 12000, suffix: '+', label: 'Apps built' },
  { value: 60, prefix: '<', suffix: 's', label: 'To first preview' },
  { value: 120, suffix: '+', label: 'Countries reached' },
  { value: 99.9, suffix: '%', decimals: 1, label: 'Uptime' },
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
    <section className="border-y border-black/[0.06] bg-secondary/40">
      <div className="mx-auto max-w-5xl px-5 py-16 lg:py-20">
        <div className="grid grid-cols-2 gap-8 text-center sm:grid-cols-4">
          {STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.08}>
              <div className="text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
                {stat.prefix ?? ''}
                <CountUp value={stat.value} decimals={stat.decimals ?? 0} />
                {stat.suffix ?? ''}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{stat.label}</div>
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
    <figure className="flex w-[340px] shrink-0 flex-col rounded-2xl border border-black/[0.07] bg-card p-6 shadow-sm">
      <blockquote className="flex-1 text-[15px] leading-relaxed text-neutral-700">
        “{review.quote}”
      </blockquote>
      <figcaption className="mt-5">
        <div className="text-sm font-semibold text-neutral-900">{review.name}</div>
        <div className="text-xs text-orange-600">{review.handle}</div>
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
        <p className="text-sm font-medium text-emerald-600">Testimonials</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          Loved by builders everywhere
        </h2>
        <p className="mt-3 text-muted-foreground">
          From first-time makers to seasoned founders — people are shipping real apps in minutes.
        </p>
      </Reveal>

      <div className="relative mt-14 flex flex-col gap-6">
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />
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
        <div className="relative overflow-hidden rounded-3xl bg-neutral-900 px-6 py-16 text-center shadow-xl sm:px-16">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(50% 60% at 20% 0%, rgba(139,92,246,0.35), transparent 60%), radial-gradient(50% 60% at 85% 100%, rgba(251,146,60,0.3), transparent 60%)',
            }}
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Your next app is one sentence away
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/70">
              Describe it, watch it build, and put it live today. Free to start — no credit card.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="secondary" className="h-12 px-7 text-base">
                <Link href="/signup">
                  Start now
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="h-12 px-7 text-base text-white hover:bg-white/10 hover:text-white"
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
