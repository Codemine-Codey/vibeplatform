import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ArrowRight } from 'lucide-react'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Reveal } from '@/components/marketing/reveal'
import { MarketingRoot } from '@/components/marketing/marketing-shell'
import { POSTS, getPost } from '../posts'

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return { title: 'Blog — Codemine' }
  return { title: `${post.title} — Codemine`, description: post.description }
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  return (
    <MarketingRoot>
      <SiteNav />
      <article className="relative z-10 px-4 pb-24 pt-32">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/blog"
            className="group mb-8 inline-flex items-center gap-2 text-sm font-medium text-[var(--cm-muted)] transition-colors hover:text-[var(--cm-heading)]"
          >
            <span className="rounded-full border border-[var(--cm-border)] bg-[var(--cm-card)] p-1 transition-colors group-hover:border-[var(--cm-border-strong)]">
              <ChevronLeft size={16} />
            </span>
            All posts
          </Link>

          <Reveal>
            <div className="flex items-center gap-3 text-xs font-medium text-[var(--cm-faint)]">
              <span className="rounded-full bg-[var(--cm-inset)] px-2.5 py-1 text-[var(--cm-accent)]">{post.tag}</span>
              <span>{new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              <span>· {post.readMins} min read</span>
            </div>
            <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-[var(--cm-heading)] sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-[var(--cm-muted)]">{post.description}</p>
          </Reveal>

          <div className="mt-10 space-y-8">
            {post.body.map((block, i) => (
              <Reveal key={i} delay={i * 0.04}>
                {block.heading && (
                  <h2 className="mb-3 text-xl font-semibold tracking-tight text-[var(--cm-heading)]">{block.heading}</h2>
                )}
                <p className="text-base leading-loose text-[var(--cm-body)]">{block.text}</p>
              </Reveal>
            ))}
          </div>

          <div className="mt-14 rounded-2xl border border-[var(--cm-panel-border)] bg-[var(--cm-panel)] p-8 text-center">
            <h3 className="text-lg font-semibold text-[var(--cm-panel-heading)]">Ready to try it yourself?</h3>
            <p className="mt-2 text-sm text-[var(--cm-panel-body)]">Describe your idea and watch it come to life.</p>
            <Link
              href="/signup"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500"
            >
              Start building
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </article>
      <SiteFooter />
    </MarketingRoot>
  )
}
