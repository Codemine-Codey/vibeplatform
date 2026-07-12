'use client'

import { useState } from 'react'
import {
  LayoutDashboardIcon, RocketIcon, DatabaseIcon, KeyRoundIcon, LockIcon,
  HardDriveIcon, SparklesIcon, PlugIcon, ExternalLinkIcon, CheckCircle2Icon,
} from 'lucide-react'
import { useSandboxStore } from '@/app/state'
import { DeployPanel } from '@/components/deploy/deploy-panel'
import { AuthPanel } from '@/components/deploy/auth-panel'
import { SecretsPanel } from '@/components/cloud/secrets-panel'
import { StoragePanel } from '@/components/cloud/storage-panel'
import { NeonPanel } from '@/components/cloud/neon-panel'
import { cn } from '@/lib/utils'

type Sub = 'overview' | 'deploy' | 'database' | 'auth' | 'secrets' | 'storage' | 'ai' | 'connectors'

// Short, plain-English description for each Cloud feature — so users know what it is
// and when to use it.
const SUBS: { id: Sub; label: string; icon: typeof RocketIcon; desc: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboardIcon, desc: 'Everything your project runs on, in one place.' },
  { id: 'deploy', label: 'Deploy', icon: RocketIcon, desc: 'Publish your project to a live, shareable URL — and connect a custom domain.' },
  { id: 'database', label: 'Database', icon: DatabaseIcon, desc: 'Add a real database to store your app\'s data — users, posts, orders, anything.' },
  { id: 'auth', label: 'Auth', icon: KeyRoundIcon, desc: 'Let people sign up and log in. Accounts are encrypted and isolated to your app.' },
  { id: 'secrets', label: 'Secrets', icon: LockIcon, desc: 'Store third-party API keys (Stripe, Maps, etc.) securely — encrypted, never in your code.' },
  { id: 'storage', label: 'Storage', icon: HardDriveIcon, desc: 'Store files and uploads — images, documents, user avatars.' },
  { id: 'ai', label: 'AI', icon: SparklesIcon, desc: 'Your app\'s AI runs on Codemine Codey AI — a managed model, billed as credits. No key needed.' },
  { id: 'connectors', label: 'Connectors', icon: PlugIcon, desc: 'Connect to Stripe, Slack, and Google. Coming soon.' },
]

export function CloudDashboard({ className }: { className?: string }) {
  const [sub, setSub] = useState<Sub>('overview')
  const active = SUBS.find((s) => s.id === sub)!

  return (
    <div className={cn('flex h-full min-h-0', className)}>
      {/* Sub-nav */}
      <nav className="w-44 shrink-0 border-r border-primary/12 overflow-auto p-2 space-y-0.5">
        {SUBS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSub(id)}
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors text-left',
              sub === id ? 'bg-foreground text-background font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {label}
          </button>
        ))}
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
          {sub === 'overview' && <Overview onGo={setSub} />}
          {sub === 'deploy' && <DeployPanel className="h-full" />}
          {sub === 'database' && <NeonPanel className="h-full" />}
          {sub === 'auth' && <AuthPanel className="h-full" />}
          {sub === 'secrets' && <SecretsPanel className="h-full" />}
          {sub === 'storage' && <StoragePanel className="h-full" />}
          {sub === 'ai' && <AiInfo />}
          {sub === 'connectors' && <ComingSoon />}
        </div>
      </div>
    </div>
  )
}

function Overview({ onGo }: { onGo: (s: Sub) => void }) {
  const deployedUrl = useSandboxStore((s) => s.deployedUrl)
  const authEnabled = useSandboxStore((s) => s.authEnabled)
  const cards = [
    { id: 'deploy' as Sub, label: 'Deployment', value: deployedUrl ? 'Live' : 'Not deployed', ok: !!deployedUrl },
    { id: 'database' as Sub, label: 'Database', value: 'View' as string, ok: false },
    { id: 'auth' as Sub, label: 'Authentication', value: authEnabled ? 'Active' : 'Off', ok: !!authEnabled },
  ]
  return (
    <div className="p-4 space-y-4">
      {deployedUrl && (
        <a href={deployedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg border border-primary/15 bg-secondary/50 px-4 py-3 hover:bg-accent transition-colors">
          <div>
            <p className="text-xs text-muted-foreground">Live site</p>
            <p className="text-sm font-mono">{deployedUrl.replace('https://', '')}</p>
          </div>
          <ExternalLinkIcon className="w-4 h-4" />
        </a>
      )}
      <div className="grid grid-cols-3 gap-2">
        {cards.map((c) => (
          <button key={c.id} type="button" onClick={() => onGo(c.id)} className="flex flex-col items-start gap-1 rounded-lg border border-primary/12 p-3 text-left hover:bg-accent transition-colors">
            <span className="text-xs text-muted-foreground">{c.label}</span>
            <span className={cn('text-sm font-medium', c.ok ? 'text-emerald-600' : 'text-foreground')}>{c.value}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Pick a section on the left to manage your project's deployment, data, users, secrets, storage, and AI.</p>
    </div>
  )
}

function AiInfo() {
  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <CheckCircle2Icon className="w-4 h-4 text-emerald-500" />
        <span className="font-medium">Codemine Codey AI is built in</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Supercharge your app's AI with Codemine Codey AI—a managed, industry-grade model. Skip the API setup and keys; simply ask the builder to add any feature (chatbots, summaries, generators). It works instantly, with credit tracking visible right here.
      </p>
    </div>
  )
}

function ComingSoon() {
  return (
    <div className="p-4">
      <p className="text-sm text-muted-foreground">Connectors (Stripe, Slack, Google) are coming soon. Ask the agent to get started once they launch.</p>
    </div>
  )
}
