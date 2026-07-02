import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, Rocket, Heart, Zap, Globe, Shield } from 'lucide-react'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Reveal } from '@/components/marketing/reveal'
import { DarkNoiseBackground } from '@/components/ui/futurastic-hero-section'

export const metadata: Metadata = {
  title: 'About — Codemine',
  description:
    'Codemine bridges imagination and execution — turning ideas into real, deployed web apps in minutes, powered by AI.',
}

const PRINCIPLES = [
  {
    tag: 'Vision',
    tagColor: 'text-indigo-400',
    title: 'Limitless Creation',
    body: "To become the world's most trusted AI-powered builder, enabling anyone, anywhere, to launch their digital dreams effortlessly and instantly.",
  },
  {
    tag: 'Mission',
    tagColor: 'text-pink-400',
    title: 'Speed of Thought',
    body: 'To abstract away the complexities of development, empowering creators to build, iterate, and deploy at the speed of thought.',
  },
] as const

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-indigo-500/30">
      <DarkNoiseBackground />
      <SiteNav />

      {/* soft brand decor */}
      <div className="pointer-events-none fixed inset-0 -z-[5]">
        <div className="absolute left-[-10%] top-[-20%] h-[600px] w-[600px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-20%] h-[500px] w-[500px] rounded-full bg-purple-600/10 blur-[100px]" />
      </div>

      <div className="relative z-10 px-4 pb-24 pt-32">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/home"
            className="group mb-8 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition-colors hover:text-white"
          >
            <span className="rounded-full border border-zinc-800 bg-zinc-900 p-1 transition-colors group-hover:border-zinc-700">
              <ChevronLeft size={16} />
            </span>
            Back to Home
          </Link>

          {/* Hero */}
          <Reveal className="mb-20 text-center">
            <h1 className="mb-6 bg-gradient-to-b from-white via-zinc-200 to-zinc-500 bg-clip-text text-4xl font-bold tracking-tight text-transparent md:text-6xl">
              Bridging Imagination &amp; Execution
            </h1>
            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-zinc-400">
              We believe creating technology should be as natural as having an idea.
            </p>
          </Reveal>

          {/* Our Story */}
          <Reveal className="mb-24">
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-white">
              <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                <Heart size={18} />
              </span>
              Our Story
            </h2>
            <div className="space-y-6 text-lg leading-loose text-zinc-400">
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

          {/* Guiding Principles */}
          <Reveal className="mb-24">
            <h2 className="mb-8 flex items-center gap-3 text-2xl font-bold text-white">
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Globe size={18} />
              </span>
              Our Guiding Principles
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {PRINCIPLES.map((p) => (
                <div
                  key={p.tag}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-colors hover:bg-zinc-900"
                >
                  <div className={`mb-4 text-xs font-bold uppercase tracking-wider ${p.tagColor}`}>{p.tag}</div>
                  <h3 className="mb-3 text-lg font-bold text-zinc-100">{p.title}</h3>
                  <p className="text-sm leading-relaxed text-zinc-400">{p.body}</p>
                </div>
              ))}
              {/* Values card */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-colors hover:bg-zinc-900">
                <div className="mb-4 text-xs font-bold uppercase tracking-wider text-yellow-400">Values</div>
                <h3 className="mb-3 text-lg font-bold text-zinc-100">Core Pillars</h3>
                <ul className="space-y-2 text-sm text-zinc-400">
                  <li className="flex items-center gap-2">
                    <Zap size={14} className="text-yellow-400" /> <strong className="text-zinc-200">Innovation:</strong> Push boundaries.
                  </li>
                  <li className="flex items-center gap-2">
                    <Heart size={14} className="text-pink-400" /> <strong className="text-zinc-200">Simplicity:</strong> Make tech accessible.
                  </li>
                  <li className="flex items-center gap-2">
                    <Shield size={14} className="text-emerald-400" /> <strong className="text-zinc-200">Trust:</strong> Build reliability.
                  </li>
                </ul>
              </div>
            </div>
          </Reveal>

          {/* Our Commitment */}
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-black p-8 md:p-12">
              <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-indigo-500/5 blur-3xl" />
              <h2 className="relative z-10 mb-6 flex items-center gap-3 text-2xl font-bold text-white">
                <span className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                  <Rocket size={18} />
                </span>
                Our Commitment
              </h2>
              <div className="relative z-10 space-y-6 text-lg leading-loose text-zinc-400">
                <p>
                  Codemine isn&apos;t just another tool — it&apos;s your partner in innovation. By harnessing advanced
                  AI, we make it possible to design, build, and deploy apps and websites at the speed of thought. What
                  once took months of planning, coding, and debugging can now happen in minutes — freeing you to focus
                  on what matters most: your story, your customers, your impact.
                </p>
                <p className="font-medium text-white">
                  Our aim is simple: to remove the gap between having an idea and seeing it live in the world. With
                  Codemine, you don&apos;t just create technology — you unlock possibilities, accelerate your journey,
                  and bring your boldest ideas to life faster than ever before.
                </p>
              </div>
              <div className="relative z-10 mt-8">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-900/40 transition-colors hover:bg-blue-500"
                >
                  Start building
                  <Rocket size={16} />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
