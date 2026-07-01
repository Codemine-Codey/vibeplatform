'use client'

import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { motion } from 'framer-motion'
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
  Zap,
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
        <Reviews />
        <Pricing />
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
            'radial-gradient(60% 50% at 15% 0%, rgba(139,92,246,0.10), transparent 60%), radial-gradient(50% 50% at 90% 10%, rgba(251,146,60,0.12), transparent 60%)',
        }}
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
        <div>
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
            transition={{ duration: 0.55, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl"
          >
            Turn a sentence into a{' '}
            <span className="relative whitespace-nowrap">
              <span className="relative z-10 bg-gradient-to-r from-violet-600 to-orange-500 bg-clip-text text-transparent">
                live web app
              </span>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 max-w-lg text-lg text-neutral-600"
          >
            Describe what you want to build. Codemine writes the code, runs it, and
            deploys a real, working app you can share — no setup, no boilerplate.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <Link href="/signup">
                Start building
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-6 text-base">
              <Link href="/home#how">See how it works</Link>
            </Button>
          </motion.div>

          <p className="mt-4 text-sm text-muted-foreground">
            No credit card required · Free to start
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <BuilderMock />
        </motion.div>
      </div>
    </section>
  )
}

// Stylised mock of the Codemine builder window.
function BuilderMock() {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-card shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)]">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-3">
        <span className="size-3 rounded-full bg-red-400" />
        <span className="size-3 rounded-full bg-amber-400" />
        <span className="size-3 rounded-full bg-green-400" />
        <span className="ml-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Zap className="size-3" /> codemine.app
        </span>
      </div>

      <div className="grid grid-cols-[1fr_1.2fr]">
        {/* chat side */}
        <div className="space-y-3 border-r border-black/[0.06] p-4">
          <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-neutral-900 px-3 py-2 text-xs text-white">
            Build a coffee shop landing page with a menu
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-violet-500" />
            Designing a warm, editorial layout…
          </div>
          <div className="space-y-1.5">
            {['Writing Hero.tsx', 'Adding Menu section', 'Deploying preview'].map((t, i) => (
              <motion.div
                key={t}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.5, duration: 0.4 }}
                className="flex items-center gap-2 rounded-md bg-secondary px-2.5 py-1.5 text-[11px] text-secondary-foreground"
              >
                <Check className="size-3 text-green-500" />
                {t}
              </motion.div>
            ))}
          </div>
        </div>

        {/* preview side */}
        <div className="p-3">
          <div className="h-full overflow-hidden rounded-lg border border-black/[0.06]">
            <div className="relative h-28 bg-gradient-to-br from-amber-200 via-orange-200 to-rose-200">
              <div className="absolute bottom-3 left-3">
                <div className="text-sm font-semibold text-neutral-900">Roasted &amp; Co.</div>
                <div className="text-[10px] text-neutral-700">Specialty coffee, slow mornings</div>
              </div>
            </div>
            <div className="space-y-2 p-3">
              <div className="h-2 w-2/3 rounded bg-muted" />
              <div className="h-2 w-full rounded bg-muted" />
              <div className="h-2 w-4/5 rounded bg-muted" />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-1.5 rounded-md bg-secondary p-2">
                    <div className="h-8 rounded bg-gradient-to-br from-amber-100 to-orange-100" />
                    <div className="h-1.5 w-3/4 rounded bg-muted" />
                    <div className="h-1.5 w-1/2 rounded bg-muted" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- HOW IT WORKS */
const STEPS = [
  {
    icon: Wand2,
    title: 'Prompt',
    body: 'Describe your idea in plain English. A landing page, a dashboard, a game — whatever you have in mind.',
    accent: 'from-violet-500 to-violet-400',
  },
  {
    icon: MessageSquare,
    title: 'Iterate',
    body: 'Chat to refine. Change the colors, add a page, wire up a form — Codemine edits and re-runs instantly.',
    accent: 'from-orange-500 to-amber-400',
  },
  {
    icon: Rocket,
    title: 'Deploy',
    body: 'One click and your app is live on a real URL, ready to share with the world.',
    accent: 'from-emerald-500 to-teal-400',
  },
]

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium text-violet-600">How it works</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          Three steps from idea to live app
        </h2>
      </Reveal>

      <div className="relative mt-16">
        {/* connecting line (desktop) */}
        <div className="absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-black/10 to-transparent lg:block" />
        <div className="grid gap-8 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.1}>
              <div className="relative flex h-full flex-col rounded-2xl border border-black/[0.07] bg-card p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex size-14 items-center justify-center rounded-xl bg-gradient-to-br ${step.accent} text-white shadow-md`}
                  >
                    <step.icon className="size-6" />
                  </div>
                  <span className="text-5xl font-semibold text-black/[0.08]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-semibold text-neutral-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="absolute -right-6 top-8 hidden size-5 text-black/20 lg:block" />
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
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

/* --------------------------------------------------------------- PRICING */
const PLANS = [
  {
    name: 'Free',
    price: '$0',
    note: 'To get started',
    features: ['Unlimited previews', 'Live editing', '1 deployed app', 'Community support'],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$20',
    note: 'per month',
    features: ['Everything in Free', 'Unlimited deployed apps', 'Custom domains', 'Database & auth', 'Priority builds'],
    cta: 'Go Pro',
    highlight: true,
  },
]

function Pricing() {
  return (
    <section id="pricing" className="border-t border-black/[0.06] bg-secondary/40">
      <div className="mx-auto max-w-5xl px-5 py-20 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-violet-600">Pricing</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Simple, honest pricing
          </h2>
          <p className="mt-3 text-muted-foreground">Start free. Upgrade when you ship.</p>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-3xl gap-6 sm:grid-cols-2">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.1}>
              <div
                className={
                  plan.highlight
                    ? 'relative h-full rounded-2xl border-2 border-neutral-900 bg-card p-7 shadow-lg'
                    : 'h-full rounded-2xl border border-black/[0.07] bg-card p-7 shadow-sm'
                }
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-7 rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-neutral-900">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight text-neutral-900">
                    {plan.price}
                  </span>
                  <span className="text-sm text-muted-foreground">{plan.note}</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-neutral-700">
                      <Check className="size-4 shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={plan.highlight ? 'default' : 'outline'}
                  className="mt-7 h-11 w-full"
                >
                  <Link href="/signup">{plan.cta}</Link>
                </Button>
              </div>
            </Reveal>
          ))}
        </div>
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
                  Start building
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
