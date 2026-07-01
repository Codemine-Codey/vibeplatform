import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { DarkNoiseBackground } from '@/components/ui/futurastic-hero-section'

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
    <div className="relative min-h-screen bg-[#05070f] text-neutral-100">
      <DarkNoiseBackground />
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-16 lg:py-20">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-neutral-400">Last updated {updated}</p>
        <p className="mt-6 text-[15px] leading-relaxed text-neutral-300">{intro}</p>

        <div className="mt-10 space-y-9">
          {sections.map((s, i) => (
            <section key={s.heading}>
              <h2 className="text-lg font-semibold text-white">
                <span className="text-blue-400">{i + 1}.</span> {s.heading}
              </h2>
              <div className="mt-3 space-y-3">
                {s.body.map((p, j) => (
                  <p key={j} className="text-[15px] leading-relaxed text-neutral-300">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-12 text-sm text-neutral-400">
          Questions? Reach us at{' '}
          <a
            href="mailto:hello@codemine.app"
            className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
          >
            hello@codemine.app
          </a>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  )
}
