import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Reveal } from '@/components/marketing/reveal'
import { DarkNoiseBackground } from '@/components/ui/futurastic-hero-section'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Pricing — Codemine',
  description:
    'Simple, transparent pricing for Codemine. Start free, upgrade when you ship — unlimited previews, live editing, custom domains, and more.',
}

type Tier = {
  name: string
  price: string
  cadence?: string
  tagline: string
  cta: string
  href: string
  features: string[]
  featured?: boolean
}

const TIERS: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    tagline: 'Everything you need to start turning prompts into real apps.',
    cta: 'Start free',
    href: '/signup',
    features: [
      'Unlimited builds & previews',
      'Live editing by chat',
      '1 deployed app',
      'AI images, on brand',
      'Community support',
    ],
  },
  {
    name: 'Pro',
    price: '$20',
    cadence: 'per month',
    tagline: 'For makers shipping real products, on their own domains.',
    cta: 'Start Pro',
    href: '/signup',
    featured: true,
    features: [
      'Everything in Free',
      'Unlimited deployed apps',
      'Custom domains',
      'Database & auth, built in',
      'Priority builds',
      'Remove Codemine badge',
    ],
  },
  {
    name: 'Team',
    price: '$60',
    cadence: 'per month',
    tagline: 'Build together — shared projects and room to scale.',
    cta: 'Start Team',
    href: '/signup',
    features: [
      'Everything in Pro',
      'Up to 5 seats',
      'Shared projects & workspace',
      'Roles & permissions',
      'Higher usage limits',
      'Priority support',
    ],
  },
]

export default function PricingPage() {
  return (
    <div className="relative min-h-screen bg-[#05070f] text-neutral-100">
      <DarkNoiseBackground />
      <SiteNav />

      <main>
        {/* hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(55% 45% at 50% 0%, rgba(59,130,246,0.16), transparent 60%), radial-gradient(45% 45% at 85% 15%, rgba(79,70,229,0.14), transparent 60%)',
            }}
          />
          <div className="relative mx-auto max-w-3xl px-5 pb-6 pt-16 text-center lg:pt-24">
            <Reveal className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-neutral-300 shadow-sm backdrop-blur">
              <Sparkles className="size-3.5 text-blue-400" />
              Simple, honest pricing
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Start free.{' '}
                <span className="bg-gradient-to-r from-sky-300 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  Upgrade when you ship.
                </span>
              </h1>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-300">
                Build and preview as much as you like on the free plan. Only pay when
                you are ready to put real apps live on your own domains.
              </p>
            </Reveal>
          </div>
        </section>

        {/* tiers */}
        <section className="mx-auto max-w-6xl px-5 pb-8 pt-10 lg:pb-12">
          <div className="grid items-stretch gap-6 lg:grid-cols-3">
            {TIERS.map((tier, i) => (
              <Reveal key={tier.name} delay={i * 0.08} className="h-full">
                <PriceCard tier={tier} />
              </Reveal>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-neutral-400">
            Prices shown are placeholders for launch. No credit card required to start.
          </p>
        </section>

        {/* comparison note / FAQ-lite */}
        <section className="border-t border-white/[0.06] bg-white/[0.02]">
          <div className="mx-auto grid max-w-5xl gap-8 px-5 py-16 md:grid-cols-3 lg:py-20">
            <Reveal>
              <h3 className="text-base font-semibold text-white">Cancel anytime</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                Upgrade, downgrade, or cancel whenever you like. Your projects stay yours.
              </p>
            </Reveal>
            <Reveal delay={0.06}>
              <h3 className="text-base font-semibold text-white">No lock-in</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                Every app is real code on a real URL — export and take it with you at will.
              </p>
            </Reveal>
            <Reveal delay={0.12}>
              <h3 className="text-base font-semibold text-white">Fair usage</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                Generous limits on every plan, with clear upgrades if you outgrow them.
              </p>
            </Reveal>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0f22] px-6 py-16 text-center shadow-xl sm:px-16">
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    'radial-gradient(50% 60% at 20% 0%, rgba(59,130,246,0.4), transparent 60%), radial-gradient(50% 60% at 85% 100%, rgba(79,70,229,0.35), transparent 60%)',
                }}
              />
              <div className="relative">
                <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Your next app is one sentence away
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-white/70">
                  Describe it, watch it build, and put it live today. Free to start — no
                  credit card required.
                </p>
                <div className="mt-8 flex justify-center">
                  <Button
                    asChild
                    size="lg"
                    className="h-12 bg-blue-600 px-7 text-base text-white shadow-lg shadow-blue-900/40 hover:bg-blue-500"
                  >
                    <Link href="/signup">
                      Start now
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

function PriceCard({ tier }: { tier: Tier }) {
  if (tier.featured) {
    // Recommended tier — bright blue, elevated, high-contrast anchor.
    return (
      <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-blue-400/30 bg-[#0a0f22] p-8 text-white shadow-xl shadow-blue-950/40 ring-1 ring-blue-500/20 lg:-my-2">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(55% 45% at 15% 0%, rgba(59,130,246,0.45), transparent 60%), radial-gradient(50% 60% at 100% 100%, rgba(79,70,229,0.4), transparent 60%)',
          }}
        />
        <div className="relative flex flex-1 flex-col">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{tier.name}</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2.5 py-1 text-[11px] font-medium text-blue-200 ring-1 ring-blue-400/30">
              <Sparkles className="size-3" /> Recommended
            </span>
          </div>
          <div className="mt-5 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight">{tier.price}</span>
            {tier.cadence && <span className="text-sm text-white/60">{tier.cadence}</span>}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/70">{tier.tagline}</p>

          <ul className="mt-7 space-y-3">
            {tier.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-white/85">
                <Check className="mt-0.5 size-4 shrink-0 text-blue-400" />
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-8">
            <Button
              asChild
              size="lg"
              className="h-11 w-full bg-blue-600 text-base text-white shadow-lg shadow-blue-900/40 hover:bg-blue-500"
            >
              <Link href={tier.href}>
                {tier.cta}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.05]">
      <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight text-white">{tier.price}</span>
        {tier.cadence && <span className="text-sm text-neutral-400">{tier.cadence}</span>}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-neutral-400">{tier.tagline}</p>

      <ul className="mt-7 space-y-3">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-neutral-300">
            <Check
              className={cn(
                'mt-0.5 size-4 shrink-0',
                tier.name === 'Team' ? 'text-indigo-400' : 'text-sky-400',
              )}
            />
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <Button
          asChild
          variant="outline"
          size="lg"
          className="h-11 w-full border-white/15 bg-transparent text-base text-neutral-100 hover:bg-white/10 hover:text-white"
        >
          <Link href={tier.href}>
            {tier.cta}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
