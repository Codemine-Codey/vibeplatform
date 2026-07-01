import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Sparkles, Rocket, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Reveal } from '@/components/marketing/reveal'

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
  },
  {
    icon: Rocket,
    title: 'Real, not a demo',
    body: 'Every project is a real app that runs and deploys to a live URL. No throwaway mockups, no “export and figure it out yourself”.',
  },
  {
    icon: Heart,
    title: 'Delight in the details',
    body: 'Great tools feel effortless. We obsess over speed, taste, and the small moments that make building feel like magic.',
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

        {/* story */}
        <section className="border-y border-black/[0.06] bg-secondary/40">
          <div className="mx-auto max-w-3xl px-5 py-20 lg:py-24">
            <Reveal>
              <p className="text-sm font-medium text-orange-600">Our story</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                From idea to live app, without the gap
              </h2>
            </Reveal>
            <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-neutral-700">
              <Reveal delay={0.05}>
                <p>
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
                  The result is software that used to take weeks and a team, now built in
                  minutes by one person and a sentence. That is the shift we care about:
                  making creation accessible to everyone, not just those who can code.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* values */}
        <section className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-violet-600">What we believe</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              The principles behind every build
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {VALUES.map((value, i) => (
              <Reveal key={value.title} delay={i * 0.1}>
                <div className="flex h-full flex-col rounded-2xl border border-black/[0.07] bg-card p-6 shadow-sm">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-neutral-900 text-white shadow-sm">
                    <value.icon className="size-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-neutral-900">{value.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {value.body}
                  </p>
                </div>
              </Reveal>
            ))}
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
