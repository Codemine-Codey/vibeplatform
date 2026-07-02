import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Reveal } from '@/components/marketing/reveal'
import { MarketingRoot } from '@/components/marketing/marketing-shell'

export const metadata: Metadata = {
  title: 'FAQ — Codemine',
  description:
    'Frequently asked questions about Codemine — building web apps, websites, and games by describing them, with no code required.',
}

const FAQS = [
  {
    q: 'Do I need to know how to code?',
    a: 'No. You describe what you want in plain English and Codemine writes, runs, and deploys it. Your job is deciding what to build and how it should look and feel — not writing code.',
  },
  {
    q: 'What can I build?',
    a: 'Websites, web apps, and web games. From a bakery site to a habit tracker to an arcade game — if you can describe it, Codemine can build a real, working version of it.',
  },
  {
    q: 'Is it a real app or just a template?',
    a: 'Real code on a real URL — not a locked template. Features actually work, and when your app needs data, sign-in, or storage, Codemine Cloud wires them up automatically.',
  },
  {
    q: 'Can I change things after it is built?',
    a: 'Yes — that is the main way you work. Ask for any change by chatting (“make it warmer”, “add a page”, “fix the total”) and it applies live.',
  },
  {
    q: 'Can I use my own domain?',
    a: 'Yes. Deploy to a live URL in one click, then connect your own custom domain from the dashboard whenever you are ready.',
  },
  {
    q: 'Does my app get AI features?',
    a: 'Yes. Codemine Codey AI can power your app’s own AI features — chat, summaries, and more — built in, with no separate AI account or key to manage.',
  },
  {
    q: 'Will I lose my work if I close the tab?',
    a: 'No. Your projects are saved and you can reopen them from your dashboard to continue exactly where you left off.',
  },
  {
    q: 'How long does it take?',
    a: 'A first version usually takes a few minutes. From there, changes are near-instant, so you can shape and ship in a single sitting.',
  },
]

export default function FaqPage() {
  return (
    <MarketingRoot>
      <SiteNav />
      <div className="relative z-10 px-4 pb-24 pt-32">
        <div className="mx-auto max-w-3xl">
          <Reveal className="mb-14 text-center">
            <p className="text-sm font-medium text-[var(--cm-accent)]">FAQ</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-[var(--cm-heading)] sm:text-5xl">
              Questions, answered
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--cm-muted)]">
              Everything you might want to know before you start building.
            </p>
          </Reveal>

          <div className="space-y-4">
            {FAQS.map((f, i) => (
              <Reveal key={f.q} delay={i * 0.04}>
                <div className="rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-card)] p-6 backdrop-blur">
                  <h2 className="text-base font-semibold text-[var(--cm-heading)]">{f.q}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--cm-muted)]">{f.a}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-[var(--cm-muted)]">
            Still have a question?{' '}
            <Link href="/contact" className="font-medium text-[var(--cm-accent)] hover:underline">
              Get in touch
            </Link>
            .
          </p>
        </div>
      </div>
      <SiteFooter />
    </MarketingRoot>
  )
}
