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
  TrendingUpIcon,
  CoinsIcon,
} from 'lucide-react'
import { loadProjects, deleteProject, formatRelativeTime, MAX_PROJECTS, type SavedProject } from '@/lib/projects'
import { cn } from '@/lib/utils'

const SKILL_CONFIG = {
  website: {
    label: 'Website',
    icon: GlobeIcon,
    gradient: 'from-violet-500/20 via-indigo-500/20 to-blue-500/20',
    dot: 'bg-violet-400',
    border: 'border-violet-200/60',
  },
  webapp: {
    label: 'Web App',
    icon: AppWindowIcon,
    gradient: 'from-emerald-500/20 via-teal-500/20 to-cyan-500/20',
    dot: 'bg-emerald-400',
    border: 'border-emerald-200/60',
  },
  game: {
    label: 'Game',
    icon: GamepadIcon,
    gradient: 'from-orange-500/20 via-amber-500/20 to-yellow-500/20',
    dot: 'bg-orange-400',
    border: 'border-orange-200/60',
  },
  unknown: {
    label: 'Project',
    icon: SparklesIcon,
    gradient: 'from-slate-400/15 via-slate-300/15 to-slate-200/15',
    dot: 'bg-slate-400',
    border: 'border-slate-200/60',
  },
} satisfies Record<SavedProject['skill'], { label: string; icon: React.ComponentType<{ className?: string }>; gradient: string; dot: string; border: string }>

function ProjectCard({ project, onDelete }: { project: SavedProject; onDelete: () => void }) {
  const config = SKILL_CONFIG[project.skill]
  const Icon = config.icon

  return (
    <div className={cn(
      'group relative flex flex-col rounded-xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
      config.border
    )}>
      {/* Gradient header */}
      <div className={cn('h-24 bg-gradient-to-br flex items-center justify-center', config.gradient)}>
        <Icon className="w-8 h-8 text-foreground/30" />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-sm font-semibold truncate">{project.name}</p>
            <div className="flex items-center gap-1.5">
              <div className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
              <span className="text-xs text-muted-foreground">{config.label} · {formatRelativeTime(project.createdAt)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-destructive"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          {project.url ? (
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-85 transition-opacity"
            >
              <ExternalLinkIcon className="w-3 h-3" />
              Open
            </a>
          ) : null}
          <Link
            href="/"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 text-xs font-medium hover:bg-accent transition-colors"
          >
            <ZapIcon className="w-3 h-3" />
            New
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  accent?: string
}) {
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
  const [projects, setProjects] = useState<SavedProject[]>([])

  useEffect(() => {
    setProjects(loadProjects())
  }, [])

  function handleDelete(id: string) {
    deleteProject(id)
    setProjects(loadProjects())
  }

  const usedCredits = projects.length * 4 // placeholder: 4 credits per project
  const totalCredits = 100

  return (
    <div className="min-h-screen" style={{ background: 'rgb(250,249,247)' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-primary/8">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <ZapIcon className="w-4 h-4" />
            <span className="text-sm uppercase font-mono font-bold tracking-tight">Codemine</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/6 text-xs text-muted-foreground font-medium">
              <LayoutDashboardIcon className="w-3 h-3" />
              Dashboard
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              New Project
            </Link>
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold select-none shadow-sm">
              S
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-10">
        {/* Welcome */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Good to see you, Shazim</h1>
          <p className="text-sm text-muted-foreground">Your projects and usage at a glance.</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={SparklesIcon}
            label="Projects"
            value={`${projects.length} / ${MAX_PROJECTS}`}
            sub={projects.length >= MAX_PROJECTS ? 'Limit reached' : `${MAX_PROJECTS - projects.length} remaining`}
            accent="bg-violet-50"
          />
          <StatCard
            icon={CoinsIcon}
            label="Credits Used"
            value={`${usedCredits} / ${totalCredits}`}
            sub="Resets monthly"
            accent="bg-amber-50"
          />
          <StatCard
            icon={TrendingUpIcon}
            label="Plan"
            value="Starter"
            sub="Upgrade for more projects & credits"
            accent="bg-emerald-50"
          />
        </div>

        {/* Usage bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Projects used</span>
            <span className="font-medium">{projects.length} / {MAX_PROJECTS}</span>
          </div>
          <div className="h-1.5 rounded-full bg-primary/8 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                projects.length >= MAX_PROJECTS ? 'bg-destructive' : 'bg-foreground'
              )}
              style={{ width: `${Math.min((projects.length / MAX_PROJECTS) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Projects section */}
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Your Projects</h2>
            <Link
              href="/"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <PlusIcon className="w-3 h-3" />
              New
            </Link>
          </div>

          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 rounded-xl border border-dashed border-primary/15 bg-white/50">
              <div className="w-12 h-12 rounded-2xl bg-foreground/6 flex items-center justify-center">
                <SparklesIcon className="w-6 h-6 text-foreground/30" />
              </div>
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-sm font-medium">No projects yet</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Build your first website, web app, or game — it takes under 2 minutes.
                </p>
              </div>
              <Link
                href="/"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <ZapIcon className="w-4 h-4" />
                Start Building
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onDelete={() => handleDelete(project.id)}
                />
              ))}

              {/* Add new card */}
              {projects.length < MAX_PROJECTS && (
                <Link
                  href="/"
                  className="flex flex-col items-center justify-center gap-2 h-full min-h-[180px] rounded-xl border border-dashed border-primary/15 bg-white/50 hover:bg-white hover:border-primary/25 transition-all group"
                >
                  <div className="w-8 h-8 rounded-full bg-foreground/6 flex items-center justify-center group-hover:bg-foreground/10 transition-colors">
                    <PlusIcon className="w-4 h-4 text-foreground/40" />
                  </div>
                  <span className="text-xs text-muted-foreground">New Project</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
