import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { MarketingRoot } from '@/components/marketing/marketing-shell'

export interface LegalSection {
  heading: string
  body: string[]
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
}) {
  return (
    <MarketingRoot>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-28 lg:py-32">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--cm-muted)] transition-colors hover:text-[var(--cm-heading)]"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[var(--cm-heading)] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-[var(--cm-muted)]">Last updated {updated}</p>
        <p className="mt-6 text-[15px] leading-relaxed text-[var(--cm-body)]">{intro}</p>

        <div className="mt-10 space-y-9">
          {sections.map((s, i) => (
            <section key={s.heading}>
              <h2 className="text-lg font-semibold text-[var(--cm-heading)]">
                <span className="text-[var(--cm-accent)]">{i + 1}.</span> {s.heading}
              </h2>
              <div className="mt-3 space-y-3">
                {s.body.map((p, j) => (
                  <p key={j} className="text-[15px] leading-relaxed text-[var(--cm-body)]">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-12 text-sm text-[var(--cm-muted)]">
          Questions? Reach us at{' '}
          <a
            href="mailto:hello@codemine.app"
            className="text-[var(--cm-accent)] underline underline-offset-2 hover:opacity-80"
          >
            hello@codemine.app
          </a>
          .
        </p>
      </main>
      <SiteFooter />
    </MarketingRoot>
  )
}
