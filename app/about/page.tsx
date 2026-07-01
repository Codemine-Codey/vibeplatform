import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Sparkles, Rocket, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Reveal } from '@/components/marketing/reveal'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'About — Codemine',
  description:
    'Codemine makes building real, deployed web apps as easy as describing them — no code, no setup, powered by AI.',
}

const VALUES = [
  {
    icon: Sparkles,
    title: 'Anyone can build',
    body: 'You should not need to be an engineer to ship software. If you can describe it, you can build it — Codemine handles the rest.',
    accent: 'from-violet-600 to-violet-400',
  },
  {
    icon: Rocket,
    title: 'Real, not a demo',
    body: 'Every project is a real app that runs and deploys to a live URL. No throwaway mockups, no “export and figure it out yourself”.',
    accent: 'from-orange-500 to-amber-400',
  },
  {
    icon: Heart,
    title: 'Delight in the details',
    body: 'Great tools feel effortless. We obsess over speed, taste, and the small moments that make building feel like magic.',
    accent: 'from-emerald-500 to-teal-400',
  },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <main>
        {/* hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(55% 45% at 50% 0%, rgba(139,92,246,0.10), transparent 60%), radial-gradient(45% 45% at 85% 15%, rgba(251,146,60,0.12), transparent 60%)',
            }}
          />
          <div className="relative mx-auto max-w-3xl px-5 py-20 text-center lg:py-28">
            <Reveal className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              <Sparkles className="size-3.5 text-violet-500" />
              Our mission
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
                Building the web should be as easy as{' '}
                <span className="bg-gradient-to-r from-violet-600 to-orange-500 bg-clip-text text-transparent">
                  describing it
                </span>
              </h1>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-600">
                Codemine turns plain-English ideas into real, deployed web apps — no
                code, no config, no boilerplate. We are here to put the power of a full
                engineering team into a single sentence.
              </p>
            </Reveal>
          </div>
        </section>

        {/* story — asymmetric: sticky heading + pull-quote + stats on the left,
            the narrative on the right */}
        <section className="border-y border-black/[0.06] bg-secondary/40">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:py-24">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <Reveal>
                <p className="text-sm font-medium text-orange-600">Our story</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                  From idea to live app, without the gap
                </h2>
              </Reveal>
              <Reveal delay={0.08}>
                <figure className="mt-8 rounded-2xl border-l-4 border-orange-500 bg-card p-6 shadow-sm">
                  <blockquote className="text-lg font-medium leading-relaxed text-neutral-900">
                    “Software that used to take weeks and a team, now built in minutes by
                    one person and a sentence.”
                  </blockquote>
                </figure>
              </Reveal>
              <Reveal delay={0.14}>
                <div className="mt-8 flex gap-10">
                  <div>
                    <div className="text-3xl font-semibold tracking-tight text-neutral-900">
                      Minutes
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      not weeks, prompt to live
                    </div>
                  </div>
                  <div>
                    <div className="text-3xl font-semibold tracking-tight text-neutral-900">
                      Zero
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      setup, servers, boilerplate
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>

            <div className="space-y-5 text-[15px] leading-relaxed text-neutral-700">
              <Reveal delay={0.05}>
                <p className="text-lg leading-relaxed text-neutral-900">
                  For most people, the distance between an idea and a working product is
                  enormous — languages to learn, frameworks to wire up, servers to
                  configure, deploys to babysit. Brilliant ideas die in that gap every
                  day.
                </p>
              </Reveal>
              <Reveal delay={0.1}>
                <p>
                  We built Codemine to close it. You describe what you want, and Codemine
                  writes the code, runs it, wires up the database and auth, places the
                  images, and deploys a real app you can share — all while you watch it
                  come together live. When you want a change, you just say so.
                </p>
              </Reveal>
              <Reveal delay={0.15}>
                <p>
                  The result is a shift we care deeply about: making creation accessible
                  to everyone, not just those who can code. One person and a sentence can
                  now do what once took a whole team a whole quarter.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* values — alternating editorial rows, not three identical columns */}
        <section className="mx-auto max-w-5xl px-5 py-20 lg:py-28">
          <Reveal className="max-w-2xl">
            <p className="text-sm font-medium text-violet-600">What we believe</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              The principles behind every build
            </h2>
          </Reveal>

          <div className="mt-12 space-y-4">
            {VALUES.map((value, i) => {
              const flip = i % 2 === 1
              return (
                <Reveal key={value.title} delay={i * 0.08}>
                  <div className="grid items-center gap-6 rounded-3xl border border-black/[0.07] bg-card p-6 shadow-sm sm:p-8 md:grid-cols-2 md:gap-10">
                    {/* emphasis side — big index + accent icon */}
                    <div className={cn('flex items-center gap-5', flip && 'md:order-2')}>
                      <span className="text-5xl font-semibold tabular-nums text-neutral-200 sm:text-6xl">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div
                        className={cn(
                          'flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md',
                          value.accent,
                        )}
                      >
                        <value.icon className="size-6" />
                      </div>
                    </div>
                    {/* text side */}
                    <div className={cn(flip && 'md:order-1')}>
                      <h3 className="text-xl font-semibold text-neutral-900">{value.title}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                        {value.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-20 lg:pb-24">
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
                  Come build something real
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-white/70">
                  Describe your idea and watch it become a live app. Free to start — no
                  credit card required.
                </p>
                <div className="mt-8 flex justify-center">
                  <Button asChild size="lg" variant="secondary" className="h-12 px-7 text-base">
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
