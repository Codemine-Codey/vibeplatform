'use client'

import Link from 'next/link'
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
const FEATURES = [
  { icon: Eye, title: 'Instant preview', body: 'Watch your app build and run live as it is generated.' },
  { icon: Rocket, title: 'One-click deploy', body: 'Ship to a real URL the moment it is ready.' },
  { icon: Database, title: 'Built-in database & auth', body: 'Sign-in and persistence wired up, no config.' },
  { icon: ImageIcon, title: 'AI images', body: 'Beautiful, on-brand imagery placed automatically.' },
  { icon: Globe, title: 'Custom domains', body: 'Point your own domain at your finished app.' },
  { icon: Wand2, title: 'Live editing', body: 'Refine anything by chatting — no code required.' },
]

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

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.08}>
              <div className="group h-full rounded-2xl border border-black/[0.07] bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
                <div className="flex size-11 items-center justify-center rounded-lg bg-neutral-900 text-white">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-neutral-900">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- REVIEWS */
const REVIEWS = [
  {
    name: 'Maya Chen',
    role: 'Indie founder',
    quote:
      'I shipped my landing page and waitlist in an afternoon. It felt less like coding and more like describing what I wanted.',
    color: 'bg-violet-500',
  },
  {
    name: 'Dev Patel',
    role: 'Product designer',
    quote:
      'The live preview sold me. I iterate on layout by just chatting, and it looks genuinely designed — not a template.',
    color: 'bg-orange-500',
  },
  {
    name: 'Sara Lindqvist',
    role: 'Startup PM',
    quote:
      'We prototyped three internal tools in a week. Deploy is one click and the database was already there.',
    color: 'bg-emerald-500',
  },
]

function Reviews() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium text-emerald-600">Loved by builders</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          People are shipping faster
        </h2>
      </Reveal>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {REVIEWS.map((r, i) => (
          <Reveal key={r.name} delay={i * 0.1}>
            <figure className="flex h-full flex-col rounded-2xl border border-black/[0.07] bg-card p-6 shadow-sm">
              <blockquote className="flex-1 text-[15px] leading-relaxed text-neutral-700">
                “{r.quote}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span
                  className={`flex size-10 items-center justify-center rounded-full ${r.color} text-sm font-semibold text-white`}
                >
                  {r.name.charAt(0)}
                </span>
                <div>
                  <div className="text-sm font-semibold text-neutral-900">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.role}</div>
                </div>
              </figcaption>
            </figure>
          </Reveal>
        ))}
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
