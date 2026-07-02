import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, Mail, MessageSquare, Sparkles, ArrowRight } from 'lucide-react'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Reveal } from '@/components/marketing/reveal'
import { MarketingRoot } from '@/components/marketing/marketing-shell'

export const metadata: Metadata = {
  title: 'Contact — Codemine',
  description:
    'Get in touch with the Codemine team. Questions, feedback, partnerships, or support — we would love to hear from you.',
}

const REACH = [
  {
    label: 'Email us',
    value: 'hello@codemine.app',
    body: 'The fastest way to reach a human. We reply to every message.',
    href: 'mailto:hello@codemine.app',
    icon: Mail,
    accent: 'from-blue-500 to-indigo-400',
  },
  {
    label: 'Support & feedback',
    value: 'Tell us what you are building',
    body: 'Hit a snag, or have an idea to make Codemine better? We are all ears.',
    href: 'mailto:hello@codemine.app?subject=Feedback',
    icon: MessageSquare,
    accent: 'from-indigo-500 to-violet-400',
  },
] as const

export default function ContactPage() {
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
          <Reveal className="mb-14 text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--cm-border)] bg-[var(--cm-card)] px-3 py-1.5 text-xs font-medium text-[var(--cm-body)] shadow-sm backdrop-blur">
              <Sparkles className="size-3.5 text-[var(--cm-accent)]" />
              We usually reply within a day
            </div>
            <h1
              className="mb-6 bg-clip-text text-4xl font-bold tracking-tight text-transparent md:text-6xl"
              style={{
                backgroundImage:
                  'linear-gradient(to bottom, var(--cm-heading), var(--cm-stat-to))',
              }}
            >
              Get in touch
            </h1>
            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-[var(--cm-muted)]">
              Questions, feedback, partnerships, or just want to say hello? Send us a note and
              a real person will get back to you.
            </p>
          </Reveal>

          <div className="grid gap-8 lg:grid-cols-5">
            {/* Ways to reach us */}
            <Reveal className="flex flex-col gap-5 lg:col-span-2">
              {REACH.map((r) => (
                <Link
                  key={r.label}
                  href={r.href}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-card)] p-6 backdrop-blur transition-all hover:-translate-y-1 hover:border-[var(--cm-border-strong)] hover:bg-[var(--cm-card-hover)]"
                >
                  <div
                    className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${r.accent} text-white shadow-md`}
                  >
                    <r.icon className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[var(--cm-heading)]">{r.label}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--cm-muted)]">{r.body}</p>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--cm-accent)]">
                    {r.value}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </Reveal>

            {/* Contact form (mailto-backed — no backend yet, but fully styled) */}
            <Reveal delay={0.08} className="lg:col-span-3">
              <form
                action="mailto:hello@codemine.app"
                method="post"
                encType="text/plain"
                className="relative overflow-hidden rounded-3xl border border-[var(--cm-panel-border)] bg-[var(--cm-panel)] p-6 shadow-xl md:p-8"
              >
                <div className="cm-panel-glow pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
                <div className="relative z-10">
                  <h2 className="text-xl font-semibold tracking-tight text-[var(--cm-panel-heading)]">
                    Send us a message
                  </h2>
                  <p className="mt-1.5 text-sm text-[var(--cm-panel-body)]">
                    Fill this in and we will get right back to you.
                  </p>

                  <div className="mt-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="name"
                        className="text-sm font-medium text-[var(--cm-panel-heading)]"
                      >
                        Name
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        placeholder="Ada Lovelace"
                        className="h-11 rounded-xl border border-[var(--cm-panel-border)] bg-[var(--cm-panel-inset)] px-3.5 text-sm text-[var(--cm-panel-heading)] outline-none transition-colors placeholder:text-[var(--cm-faint)] focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="email"
                        className="text-sm font-medium text-[var(--cm-panel-heading)]"
                      >
                        Email
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        placeholder="you@example.com"
                        className="h-11 rounded-xl border border-[var(--cm-panel-border)] bg-[var(--cm-panel-inset)] px-3.5 text-sm text-[var(--cm-panel-heading)] outline-none transition-colors placeholder:text-[var(--cm-faint)] focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="message"
                        className="text-sm font-medium text-[var(--cm-panel-heading)]"
                      >
                        Message
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        required
                        rows={5}
                        placeholder="Tell us what you have in mind…"
                        className="resize-none rounded-xl border border-[var(--cm-panel-border)] bg-[var(--cm-panel-inset)] px-3.5 py-3 text-sm text-[var(--cm-panel-heading)] outline-none transition-colors placeholder:text-[var(--cm-faint)] focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <button
                      type="submit"
                      className="group mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-900/30 transition-colors hover:bg-blue-500"
                    >
                      Send message
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </button>

                    <p className="text-center text-xs text-[var(--cm-panel-body)]">
                      Prefer email? Reach us any time at{' '}
                      <a
                        href="mailto:hello@codemine.app"
                        className="font-medium text-[var(--cm-accent)] hover:underline"
                      >
                        hello@codemine.app
                      </a>
                    </p>
                  </div>
                </div>
              </form>
            </Reveal>
          </div>
        </div>
      </div>

      <SiteFooter />
    </MarketingRoot>
  )
}
