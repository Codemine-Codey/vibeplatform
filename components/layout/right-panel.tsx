'use client'

import { useState } from 'react'
import { MonitorIcon, FolderOpenIcon, TerminalIcon, LoaderIcon, RocketIcon, DatabaseIcon, KeyRoundIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Preview } from '@/app/preview'
import { FileExplorer } from '@/app/file-explorer'
import { Logs } from '@/app/logs'
import { useSandboxStore } from '@/app/state'
import { DeployPanel } from '@/components/deploy/deploy-panel'
import { DatabasePanel } from '@/components/deploy/database-panel'
import { AuthPanel } from '@/components/deploy/auth-panel'

type Tab = 'preview' | 'files' | 'logs' | 'deploy' | 'database' | 'auth'

const TABS = [
  { id: 'preview' as Tab, label: 'Preview', icon: MonitorIcon },
  { id: 'files' as Tab, label: 'Code', icon: FolderOpenIcon },
  { id: 'logs' as Tab, label: 'Logs', icon: TerminalIcon },
  { id: 'deploy' as Tab, label: 'Deploy', icon: RocketIcon },
  { id: 'database' as Tab, label: 'Database', icon: DatabaseIcon },
  { id: 'auth' as Tab, label: 'Auth', icon: KeyRoundIcon },
]

interface Props {
  className?: string
}

export function RightPanel({ className }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('preview')
  const chatStatus = useSandboxStore((s) => s.chatStatus)
  const isWorking = chatStatus === 'streaming' || chatStatus === 'submitted'

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      {/* Tab strip */}
      <div className="flex items-center bg-secondary border border-primary/18 rounded-t-sm shrink-0 h-9 px-1 gap-0.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 h-7 rounded-sm text-xs transition-all duration-150',
              activeTab === id
                ? 'bg-background text-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <Icon className="w-3 h-3 shrink-0" />
            {label}
          </button>
        ))}

        {/* Loading indicator — visible while AI is working */}
        {isWorking && (
          <div className="ml-auto mr-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <LoaderIcon className="w-3 h-3 animate-spin" />
            <span className="font-mono">Building...</span>
          </div>
        )}
      </div>

      {/* Content — all panels stay mounted; only visibility toggled to preserve iframe state */}
      <div className="flex-1 min-h-0 relative">
        <div className={cn('absolute inset-0', activeTab !== 'preview' && 'hidden')}>
          <Preview className="h-full rounded-t-none" />
        </div>
        <div className={cn('absolute inset-0', activeTab !== 'files' && 'hidden')}>
          <FileExplorer className="h-full rounded-t-none" />
        </div>
        <div className={cn('absolute inset-0', activeTab !== 'logs' && 'hidden')}>
          <Logs className="h-full rounded-t-none" />
        </div>
        <div className={cn('absolute inset-0', activeTab !== 'deploy' && 'hidden')}>
          <DeployPanel className="h-full rounded-t-none" />
        </div>
        <div className={cn('absolute inset-0', activeTab !== 'database' && 'hidden')}>
          <DatabasePanel className="h-full rounded-t-none" />
        </div>
        <div className={cn('absolute inset-0', activeTab !== 'auth' && 'hidden')}>
          <AuthPanel className="h-full rounded-t-none" />
        </div>
      </div>
    </div>
  )
}
