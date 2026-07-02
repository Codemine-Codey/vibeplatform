import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Reveal } from '@/components/marketing/reveal'
import { MarketingRoot } from '@/components/marketing/marketing-shell'
import { POSTS } from './posts'

export const metadata: Metadata = {
  title: 'Blog — Codemine',
  description:
    'Ideas, guides, and stories about building real web apps and websites by simply describing them — no code required.',
}

export default function BlogPage() {
  return (
    <MarketingRoot>
      <SiteNav />
      <div className="relative z-10 px-4 pb-24 pt-32">
        <div className="mx-auto max-w-4xl">
          <Reveal className="mb-14 text-center">
            <p className="text-sm font-medium text-[var(--cm-accent)]">The Codemine blog</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-[var(--cm-heading)] sm:text-5xl">
              Build ideas, not boilerplate
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--cm-muted)]">
              Guides and stories on turning plain-English ideas into real, deployed web apps.
            </p>
          </Reveal>

          <div className="grid gap-5">
            {POSTS.map((post, i) => (
              <Reveal key={post.slug} delay={i * 0.06}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group block rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-card)] p-6 backdrop-blur transition-colors hover:bg-[var(--cm-card-hover)] sm:p-8"
                >
                  <div className="flex items-center gap-3 text-xs font-medium text-[var(--cm-faint)]">
                    <span className="rounded-full bg-[var(--cm-inset)] px-2.5 py-1 text-[var(--cm-accent)]">{post.tag}</span>
                    <span>{new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    <span>· {post.readMins} min read</span>
                  </div>
                  <h2 className="mt-4 text-xl font-semibold tracking-tight text-[var(--cm-heading)] sm:text-2xl">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-[var(--cm-muted)]">{post.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--cm-accent)]">
                    Read more
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
      <SiteFooter />
    </MarketingRoot>
  )
}
