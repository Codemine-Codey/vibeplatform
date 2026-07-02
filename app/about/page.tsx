import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ArrowRight } from 'lucide-react'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Reveal } from '@/components/marketing/reveal'
import { MarketingRoot } from '@/components/marketing/marketing-shell'

export const metadata: Metadata = {
  title: 'About — Codemine',
  description:
    'Codemine bridges imagination and execution — turning ideas into real, deployed web apps in minutes, powered by AI.',
}

// Guiding principles — icon-light: bold numerals + a coloured accent bar/tag,
// varied layout. No icon squares. Values gets its own big-number treatment.
const PRINCIPLES = [
  {
    no: '01',
    tag: 'Vision',
    tagColor: 'text-indigo-500',
    barColor: 'from-indigo-500 to-blue-400',
    title: 'Limitless Creation',
    body: "To become the world's most trusted AI-powered builder, enabling anyone, anywhere, to launch their digital dreams effortlessly and instantly.",
  },
  {
    no: '02',
    tag: 'Mission',
    tagColor: 'text-blue-500',
    barColor: 'from-blue-500 to-sky-400',
    title: 'Speed of Thought',
    body: 'To abstract away the complexities of development, empowering creators to build, iterate, and deploy at the speed of thought.',
  },
] as const

// Core values — rendered as tagged copy rows, no icons.
const VALUES = [
  { label: 'Innovation', color: 'text-amber-500', body: 'Push boundaries.' },
  { label: 'Simplicity', color: 'text-blue-500', body: 'Make tech accessible.' },
  { label: 'Trust', color: 'text-emerald-500', body: 'Build reliability.' },
] as const

export default function AboutPage() {
  return (
    <MarketingRoot>
      <SiteNav />

      {/* soft blue brand decor — dark-mode only (hidden in light via `cm-aurora`) */}
      <div className="cm-aurora pointer-events-none fixed inset-0 -z-[5]">
        <div className="absolute left-[-10%] top-[-20%] h-[600px] w-[600px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-20%] h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[100px]" />
      </div>

      <div className="relative z-10 px-4 pb-24 pt-32">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/home"
            className="group mb-8 inline-flex items-center gap-2 text-sm font-medium text-[var(--cm-muted)] transition-colors hover:text-[var(--cm-heading)]"
          >
            <span className="rounded-full border border-[var(--cm-border)] bg-[var(--cm-card)] p-1 transition-colors group-hover:border-[var(--cm-border-strong)]">
              <ChevronLeft size={16} />
            </span>
            Back to Home
          </Link>

          {/* Hero */}
          <Reveal className="mb-20 text-center">
            <h1
              className="mb-6 bg-clip-text text-4xl font-bold tracking-tight text-transparent md:text-6xl"
              style={{
                backgroundImage:
                  'linear-gradient(to bottom, var(--cm-heading), var(--cm-stat-to))',
              }}
            >
              Bridging Imagination &amp; Execution
            </h1>
            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-[var(--cm-muted)]">
              We believe creating technology should be as natural as having an idea.
            </p>
          </Reveal>

          {/* Our Story */}
          <Reveal className="mb-24">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-6 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-blue-400" />
              <h2 className="text-2xl font-bold text-[var(--cm-heading)]">Our Story</h2>
            </div>
            <div className="space-y-6 text-lg leading-loose text-[var(--cm-muted)]">
              <p>
                We founded Codemine on a simple but powerful belief: that creating technology should feel as natural
                as having an idea. Too often, we&apos;ve seen brilliant minds held back — not because their vision
                wasn&apos;t strong enough, but because the tools to bring that vision to life were locked behind layers
                of technical barriers, endless complexity, and overwhelming costs.
              </p>
              <p>
                Codemine exists to change that. We built it to be the bridge between imagination and execution — a
                platform where your creativity doesn&apos;t just sit on paper, it comes alive instantly. Whether
                you&apos;re an ambitious founder with a new product idea, a developer tired of repetitive boilerplate,
                or a creator eager to share your vision with the world — Codemine gives you the power to move forward
                without hesitation.
              </p>
            </div>
          </Reveal>

          {/* Guiding Principles — editorial, big-numeral layout, no icon squares */}
          <Reveal className="mb-24">
            <div className="mb-8 flex items-center gap-3">
              <span className="h-6 w-1 rounded-full bg-gradient-to-b from-blue-500 to-sky-400" />
              <h2 className="text-2xl font-bold text-[var(--cm-heading)]">Our Guiding Principles</h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
              {/* Vision + Mission — two big-number blocks spanning most of the row */}
              <div className="grid gap-6 sm:grid-cols-2 lg:col-span-3">
                {PRINCIPLES.map((p) => (
                  <div
                    key={p.tag}
                    className="group relative overflow-hidden rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-card)] p-6 backdrop-blur transition-all hover:-translate-y-1 hover:bg-[var(--cm-card-hover)]"
                  >
                    <span
                      className={`absolute left-0 top-6 h-10 w-1 rounded-r-full bg-gradient-to-b ${p.barColor}`}
                    />
                    <div className="flex items-baseline justify-between">
                      <span className={`text-xs font-bold uppercase tracking-[0.2em] ${p.tagColor}`}>
                        {p.tag}
                      </span>
                      <span className="text-4xl font-black leading-none tracking-tight text-[var(--cm-faint)] tabular-nums opacity-40">
                        {p.no}
                      </span>
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-[var(--cm-heading)]">{p.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--cm-muted)]">{p.body}</p>
                  </div>
                ))}
              </div>

              {/* Values — a distinct accent block with tagged rows, no icons */}
              <div className="relative overflow-hidden rounded-2xl border border-blue-400/25 bg-gradient-to-br from-blue-500/[0.12] to-indigo-500/[0.10] p-6 backdrop-blur lg:col-span-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-blue-500">Values</span>
                  <span className="text-4xl font-black leading-none tracking-tight text-blue-500/30 tabular-nums">
                    03
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-[var(--cm-heading)]">Core Pillars</h3>
                <ul className="mt-4 space-y-3">
                  {VALUES.map((v) => (
                    <li key={v.label} className="flex items-baseline gap-3 text-sm">
                      <span className={`shrink-0 font-semibold ${v.color}`}>{v.label}</span>
                      <span className="h-px flex-1 translate-y-[-2px] bg-[var(--cm-border)]" />
                      <span className="shrink-0 text-[var(--cm-muted)]">{v.body}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>

          {/* Our Commitment — pull-quote treatment, no icon square */}
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-[var(--cm-panel-border)] bg-[var(--cm-panel)] p-8 md:p-12">
              <div className="cm-panel-glow pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

              <div className="relative z-10">
                <div className="mb-6 flex items-center gap-3">
                  <span className="h-6 w-1 rounded-full bg-gradient-to-b from-blue-500 to-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--cm-accent)]">
                    Our Commitment
                  </span>
                </div>

                {/* Big pull-quote — the emotional anchor */}
                <blockquote className="max-w-2xl text-2xl font-semibold leading-snug tracking-tight text-[var(--cm-panel-heading)] md:text-3xl">
                  <span className="mr-1 align-top text-3xl text-blue-500/60">“</span>
                  Remove the gap between having an idea and seeing it live in the world.
                </blockquote>

                <div className="mt-8 grid gap-6 text-lg leading-loose text-[var(--cm-panel-body)] md:grid-cols-2 md:text-base">
                  <p>
                    Codemine isn&apos;t just another tool — it&apos;s your partner in innovation. By harnessing advanced
                    AI, we make it possible to design, build, and deploy apps and websites at the speed of thought. What
                    once took months of planning, coding, and debugging can now happen in minutes — freeing you to focus
                    on what matters most: your story, your customers, your impact.
                  </p>
                  <p className="font-medium text-[var(--cm-panel-heading)]">
                    With Codemine, you don&apos;t just create technology — you unlock possibilities, accelerate your
                    journey, and bring your boldest ideas to life faster than ever before.
                  </p>
                </div>
              </div>

              <div className="relative z-10 mt-10">
                <Link
                  href="/signup"
                  className="group inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-900/30 transition-colors hover:bg-blue-500"
                >
                  Start building
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      <SiteFooter />
    </MarketingRoot>
  )
}
