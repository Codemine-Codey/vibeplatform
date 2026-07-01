'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ZapIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  PlusIcon,
  TrashIcon,
  ExternalLinkIcon,
  GamepadIcon,
  AppWindowIcon,
  SparklesIcon,
  CoinsIcon,
  Loader2Icon,
} from 'lucide-react'
import { getBrowserSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Project {
  id: string
  name: string
  skill: 'website' | 'webapp' | 'game' | null
  preview_url: string | null
  snapshot_path: string | null
  tokens_used: number
  created_at: string
}

const SKILL_CONFIG = {
  website: { label: 'Website', icon: GlobeIcon, gradient: 'from-violet-500/20 via-indigo-500/20 to-blue-500/20', dot: 'bg-violet-400', border: 'border-violet-200/60' },
  webapp: { label: 'Web App', icon: AppWindowIcon, gradient: 'from-emerald-500/20 via-teal-500/20 to-cyan-500/20', dot: 'bg-emerald-400', border: 'border-emerald-200/60' },
  game: { label: 'Game', icon: GamepadIcon, gradient: 'from-orange-500/20 via-amber-500/20 to-yellow-500/20', dot: 'bg-orange-400', border: 'border-orange-200/60' },
  unknown: { label: 'Project', icon: SparklesIcon, gradient: 'from-slate-400/15 via-slate-300/15 to-slate-200/15', dot: 'bg-slate-400', border: 'border-slate-200/60' },
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(diff / 86400000)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const config = SKILL_CONFIG[project.skill ?? 'unknown']
  const Icon = config.icon
  const [opening, setOpening] = useState(false)

  function handleOpen() {
    // Open the project INSIDE the builder (chat + preview + code + cloud), not the raw
    // preview URL. The builder's ProjectLoader rebuilds the workspace from the snapshot and
    // restores the conversation. Navigating there shows a "Restoring…" state (no blank tab).
    setOpening(true)
    window.location.href = `/?project=${project.id}`
  }

  return (
    <div className={cn('group relative flex flex-col rounded-xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5', config.border)}>
      <div className={cn('h-24 bg-gradient-to-br flex items-center justify-center', config.gradient)}>
        <Icon className="w-8 h-8 text-foreground/30" />
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-sm font-semibold truncate">{project.name}</p>
            <div className="flex items-center gap-1.5">
              <div className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
              <span className="text-xs text-muted-foreground">{config.label} · {relativeDate(project.created_at)}</span>
            </div>
          </div>
          <button type="button" onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-destructive">
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CoinsIcon className="w-3 h-3" />
          <span>{formatTokens(project.tokens_used)} tokens used</span>
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={handleOpen}
            disabled={opening || !project.snapshot_path}
            title={project.snapshot_path ? 'Reopen in a fresh workspace' : 'No saved snapshot for this project'}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-85 transition-opacity disabled:opacity-50"
          >
            {opening ? <Loader2Icon className="w-3 h-3 animate-spin" /> : <ExternalLinkIcon className="w-3 h-3" />}
            {opening ? 'Opening…' : 'Open'}
          </button>
        </div>
      </div>

      {opening && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 px-8 py-7 rounded-2xl bg-white shadow-xl border border-primary/10 max-w-sm mx-4 text-center">
            <Loader2Icon className="w-8 h-8 animate-spin text-foreground/70" />
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold">Starting your workspace, please wait…</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We&apos;re fetching your project files and spinning up a fresh live preview. This can take up to a minute.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-3 p-5 rounded-xl bg-white border border-primary/10">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', accent ?? 'bg-foreground/6')}>
          <Icon className="w-3.5 h-3.5 text-foreground/60" />
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const sb = getBrowserSupabase()
    const { data } = await sb
      .from('projects')
      .select('id,name,skill,preview_url,snapshot_path,tokens_used,created_at')
      .order('updated_at', { ascending: false })
    setProjects((data as Project[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDelete(id: string) {
    const sb = getBrowserSupabase()
    await sb.from('projects').delete().eq('id', id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }

  const totalTokens = projects.reduce((sum, p) => sum + (p.tokens_used ?? 0), 0)

  return (
    <div className="min-h-screen" style={{ background: 'rgb(250,249,247)' }}>
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-primary/8">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <ZapIcon className="w-4 h-4" />
            <span className="text-sm uppercase font-mono font-bold tracking-tight">Codemine</span>
          </Link>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/6 text-xs text-muted-foreground font-medium">
            <LayoutDashboardIcon className="w-3 h-3" />
            Dashboard
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity">
              <PlusIcon className="w-3.5 h-3.5" />
              New Project
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Your projects</h1>
          <p className="text-sm text-muted-foreground">Everything you&apos;ve built, with usage at a glance.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={SparklesIcon} label="Projects" value={String(projects.length)} sub={projects.length === 1 ? '1 project' : `${projects.length} projects`} accent="bg-violet-50" />
          <StatCard icon={CoinsIcon} label="Tokens Used" value={formatTokens(totalTokens)} sub="Across all projects" accent="bg-amber-50" />
          <StatCard icon={LayoutDashboardIcon} label="Plan" value="Starter" sub="Pricing coming soon" accent="bg-emerald-50" />
        </div>

        <div className="flex flex-col gap-5">
          <h2 className="text-base font-semibold">Your Projects</h2>
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2Icon className="w-5 h-5 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 rounded-xl border border-dashed border-primary/15 bg-white/50">
              <div className="w-12 h-12 rounded-2xl bg-foreground/6 flex items-center justify-center">
                <SparklesIcon className="w-6 h-6 text-foreground/30" />
              </div>
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-sm font-medium">No projects yet</p>
                <p className="text-xs text-muted-foreground max-w-xs">Build your first website, web app, or game — it takes under 2 minutes.</p>
              </div>
              <Link href="/" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
                <ZapIcon className="w-4 h-4" />
                Start Building
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} onDelete={() => handleDelete(project.id)} />
              ))}
              <Link href="/" className="flex flex-col items-center justify-center gap-2 h-full min-h-[180px] rounded-xl border border-dashed border-primary/15 bg-white/50 hover:bg-white hover:border-primary/25 transition-all group">
                <div className="w-8 h-8 rounded-full bg-foreground/6 flex items-center justify-center group-hover:bg-foreground/10 transition-colors">
                  <PlusIcon className="w-4 h-4 text-foreground/40" />
                </div>
                <span className="text-xs text-muted-foreground">New Project</span>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
