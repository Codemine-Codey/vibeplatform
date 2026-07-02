import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Reveal } from '@/components/marketing/reveal'
import { MarketingRoot } from '@/components/marketing/marketing-shell'

export const metadata: Metadata = {
  title: 'Guides — Codemine',
  description:
    'Step-by-step guides for getting the most out of Codemine — from writing a great prompt to deploying and connecting a custom domain.',
}

const GUIDES = [
  {
    step: '01',
    title: 'Writing a great prompt',
    body: 'The clearer your description, the closer your first result. Say who it is for, what it should do, and the feeling you want — plain language beats jargon. Example: “a calm, minimal habit tracker where I tap to mark a day done and see a streak.”',
  },
  {
    step: '02',
    title: 'Refining by chat',
    body: 'Your first build is a starting point. Ask for changes the way you would ask a teammate — “make the header warmer”, “add a contact page”, “the total is wrong, it should sum the items” — and each change applies live.',
  },
  {
    step: '03',
    title: 'Adding data, sign-in & storage',
    body: 'When your app needs to remember things or let people log in, just ask. Codemine Cloud wires up a real database, authentication, secrets, and file storage automatically — no setup or separate dashboards.',
  },
  {
    step: '04',
    title: 'Deploying & custom domains',
    body: 'When it looks right, one click publishes your project to a live URL you can share. Point your own domain at it from the dashboard whenever you are ready.',
  },
  {
    step: '05',
    title: 'Reopening & continuing later',
    body: 'Your projects are saved. Open one from your dashboard any time to pick up exactly where you left off and keep building.',
  },
]

export default function GuidesPage() {
  return (
    <MarketingRoot>
      <SiteNav />
      <div className="relative z-10 px-4 pb-24 pt-32">
        <div className="mx-auto max-w-3xl">
          <Reveal className="mb-14 text-center">
            <p className="text-sm font-medium text-[var(--cm-accent)]">Guides</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-[var(--cm-heading)] sm:text-5xl">
              Get the most out of Codemine
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--cm-muted)]">
              Short, practical guides — from your first prompt to a deployed app on your own domain.
            </p>
          </Reveal>

          <div className="space-y-5">
            {GUIDES.map((g, i) => (
              <Reveal key={g.step} delay={i * 0.05}>
                <div className="flex gap-5 rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-card)] p-6 backdrop-blur sm:p-7">
                  <div className="text-2xl font-bold text-[var(--cm-faint)]">{g.step}</div>
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-[var(--cm-heading)]">{g.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--cm-muted)]">{g.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500"
            >
              Start your first project
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </MarketingRoot>
  )
}
