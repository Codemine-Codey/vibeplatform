'use client'

import { useState } from 'react'
import {
  LayoutDashboardIcon, RocketIcon, DatabaseIcon, KeyRoundIcon, LockIcon,
  HardDriveIcon, SparklesIcon, PlugIcon, ExternalLinkIcon, CheckCircle2Icon,
  AlertCircleIcon, CircleDotIcon, ZapIcon,
} from 'lucide-react'
import { useSandboxStore } from '@/app/state'
import { DeployPanel } from '@/components/deploy/deploy-panel'
import { AuthPanel } from '@/components/deploy/auth-panel'
import { SecretsPanel } from '@/components/cloud/secrets-panel'
import { StoragePanel } from '@/components/cloud/storage-panel'
import { NeonPanel } from '@/components/cloud/neon-panel'
import { cn } from '@/lib/utils'

type Sub = 'overview' | 'deploy' | 'database' | 'auth' | 'secrets' | 'storage' | 'ai' | 'connectors'

const SUBS: { id: Sub; label: string; icon: typeof RocketIcon; desc: string }[] = [
  { id: 'overview',    label: 'Overview',    icon: LayoutDashboardIcon, desc: 'Everything your project runs on, in one place.' },
  { id: 'deploy',      label: 'Deploy',      icon: RocketIcon,          desc: 'Publish your project to a live, shareable URL — and connect a custom domain.' },
  { id: 'database',    label: 'Database',    icon: DatabaseIcon,        desc: 'Add a real database to store your app\'s data — users, posts, orders, anything.' },
  { id: 'auth',        label: 'Auth',        icon: KeyRoundIcon,        desc: 'Let people sign up and log in. Accounts are encrypted and isolated to your app.' },
  { id: 'secrets',     label: 'Secrets',     icon: LockIcon,            desc: 'Store third-party API keys (Stripe, Maps, etc.) securely — encrypted, never in your code.' },
  { id: 'storage',     label: 'Storage',     icon: HardDriveIcon,       desc: 'Store files and uploads — images, documents, user avatars.' },
  { id: 'ai',          label: 'AI',          icon: SparklesIcon,        desc: 'Your app\'s AI runs on Codemine Codey AI — a managed model, billed as credits. No key needed.' },
  { id: 'connectors',  label: 'Connectors',  icon: PlugIcon,            desc: 'Connect to Stripe, Slack, and Google. Coming soon.' },
]

export function CloudDashboard({ className }: { className?: string }) {
  const [sub, setSub] = useState<Sub>('overview')
  const active = SUBS.find((s) => s.id === sub)!
  const deployedUrl = useSandboxStore((s) => s.deployedUrl)
  const authEnabled = useSandboxStore((s) => s.authEnabled)
  const databaseId = useSandboxStore((s) => s.databaseId)

  function statusDot(id: Sub) {
    if (id === 'deploy' && deployedUrl) return 'live'
    if (id === 'database' && databaseId) return 'live'
    if (id === 'auth' && authEnabled) return 'live'
    return null
  }

  return (
    <div className={cn('flex h-full min-h-0', className)}>
      {/* Sub-nav */}
      <nav className="w-44 shrink-0 border-r border-primary/12 overflow-auto p-2 space-y-0.5">
        {SUBS.map(({ id, label, icon: Icon }) => {
          const dot = statusDot(id)
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSub(id)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors text-left',
                sub === id
                  ? 'bg-foreground text-background font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">{label}</span>
              {dot === 'live' && (
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  sub === id ? 'bg-emerald-300' : 'bg-emerald-500'
                )} />
              )}
            </button>
          )
        })}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-primary/10 shrink-0">
          <div className="flex items-center gap-2">
            <active.icon className="w-4 h-4" />
            <h2 className="text-sm font-semibold">{active.label}</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{active.desc}</p>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {sub === 'overview'    && <Overview onGo={setSub} />}
          {sub === 'deploy'      && <DeployPanel className="h-full" />}
          {sub === 'database'    && <NeonPanel className="h-full" />}
          {sub === 'auth'        && <AuthPanel className="h-full" />}
          {sub === 'secrets'     && <SecretsPanel className="h-full" />}
          {sub === 'storage'     && <StoragePanel className="h-full" />}
          {sub === 'ai'          && <AiInfo />}
          {sub === 'connectors'  && <ComingSoon />}
        </div>
      </div>
    </div>
  )
}

// ── Overview ─────────────────────────────────────────────────────────────────
type FeatureStatus = 'live' | 'off' | 'na'

function StatusChip({ status }: { status: FeatureStatus }) {
  if (status === 'live') {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
        <CheckCircle2Icon className="w-3 h-3" />
        Live
      </span>
    )
  }
  if (status === 'off') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <CircleDotIcon className="w-3 h-3" />
        Not set up
      </span>
    )
  }
  return null
}

function Overview({ onGo }: { onGo: (s: Sub) => void }) {
  const deployedUrl      = useSandboxStore((s) => s.deployedUrl)
  const authEnabled      = useSandboxStore((s) => s.authEnabled)
  const databaseId       = useSandboxStore((s) => s.databaseId)
  const projectId        = useSandboxStore((s) => s.projectId)

  const features: Array<{
    id: Sub; label: string; icon: typeof RocketIcon
    status: FeatureStatus; value: string; action: string
  }> = [
    {
      id: 'deploy', label: 'Deployment', icon: RocketIcon,
      status: deployedUrl ? 'live' : 'off',
      value: deployedUrl ? deployedUrl.replace('https://', '') : 'Not deployed',
      action: deployedUrl ? 'Manage →' : 'Deploy →',
    },
    {
      id: 'database', label: 'Database', icon: DatabaseIcon,
      status: databaseId ? 'live' : 'off',
      value: databaseId ? 'Neon Postgres' : 'No database',
      action: databaseId ? 'Browse →' : 'Add database →',
    },
    {
      id: 'auth', label: 'Authentication', icon: KeyRoundIcon,
      status: authEnabled ? 'live' : 'off',
      value: authEnabled ? 'Login & signup active' : 'Auth off',
      action: authEnabled ? 'View users →' : 'Enable auth →',
    },
    {
      id: 'secrets', label: 'Secrets', icon: LockIcon,
      status: 'na', value: 'Encrypted keys', action: 'Manage →',
    },
    {
      id: 'storage', label: 'File Storage', icon: HardDriveIcon,
      status: 'na', value: 'CDN-backed files', action: 'Upload →',
    },
    {
      id: 'ai', label: 'AI (Codey)', icon: SparklesIcon,
      status: 'live', value: 'Always available', action: 'Learn more →',
    },
  ]

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Live URL card */}
      {deployedUrl && (
        <a
          href={deployedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-lg border border-emerald-200/60 bg-emerald-50/40 dark:bg-emerald-950/20 px-4 py-3 hover:bg-emerald-50/70 transition-colors"
        >
          <div>
            <p className="text-[11px] text-emerald-600 font-medium">Live — click to open</p>
            <p className="text-sm font-mono text-foreground/80 truncate max-w-[220px]">
              {deployedUrl.replace('https://', '')}
            </p>
          </div>
          <ExternalLinkIcon className="w-4 h-4 text-emerald-600 shrink-0" />
        </a>
      )}

      {/* No project state */}
      {!projectId && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <ZapIcon className="w-6 h-6 text-muted-foreground" />
          <p className="text-sm font-medium">No project yet</p>
          <p className="text-xs text-muted-foreground">Build something in the chat panel to see your project's cloud services here.</p>
        </div>
      )}

      {/* Feature grid */}
      {projectId && (
        <div className="grid grid-cols-2 gap-2">
          {features.map(({ id, label, icon: Icon, status, value, action }) => (
            <button
              key={id}
              type="button"
              onClick={() => onGo(id)}
              className="flex flex-col gap-2 rounded-lg border border-primary/10 p-3 text-left hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">{label}</span>
                </div>
                {status !== 'na' && <StatusChip status={status} />}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{value}</p>
              <span className="text-[11px] text-foreground/60 font-medium">{action}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AI Info ───────────────────────────────────────────────────────────────────
function AiInfo() {
  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg border border-primary/10 p-4 bg-secondary/30">
        <div className="w-8 h-8 rounded-full bg-foreground/8 flex items-center justify-center shrink-0">
          <SparklesIcon className="w-4 h-4" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Codemine Codey AI</span>
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
              <CheckCircle2Icon className="w-3 h-3" />
              Active
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Managed AI model available in your app — no API keys, no setup. Ask the builder to add chatbots, content generators, summaries, or any AI feature.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {[
          { label: 'Model', value: 'Codemine Codey AI' },
          { label: 'Billing', value: 'Deducted from your Codey tokens' },
          { label: 'Rate limit', value: 'Based on your plan' },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between py-2 border-b border-primary/8 last:border-0">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-xs font-medium font-mono text-right max-w-[160px] truncate">{value}</span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        To add AI to your project, tell the builder: <span className="font-mono bg-secondary px-1 rounded">"add an AI chat feature"</span> or <span className="font-mono bg-secondary px-1 rounded">"summarize this text with AI"</span> — Codemine wires the endpoint automatically.
      </p>
    </div>
  )
}

// ── Coming Soon ───────────────────────────────────────────────────────────────
function ComingSoon() {
  const integrations = [
    { name: 'Stripe', desc: 'Accept payments and subscriptions' },
    { name: 'Slack', desc: 'Send notifications and alerts' },
    { name: 'Google OAuth', desc: 'Sign in with Google' },
    { name: 'SendGrid', desc: 'Send transactional email' },
  ]
  return (
    <div className="p-4 flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        One-click integrations — connect external services without writing API code.
      </p>
      <div className="flex flex-col gap-2">
        {integrations.map(({ name, desc }) => (
          <div key={name} className="flex items-center gap-3 rounded-lg border border-primary/8 px-3 py-2.5 opacity-50">
            <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
              <AlertCircleIcon className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium">{name}</p>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </div>
            <span className="ml-auto text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Soon</span>
          </div>
        ))}
      </div>
    </div>
  )
}
