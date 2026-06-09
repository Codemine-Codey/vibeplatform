'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MonitorIcon, FolderOpenIcon, TerminalIcon, LoaderIcon, RocketIcon,
  DatabaseIcon, KeyRoundIcon, MaximizeIcon, SmartphoneIcon, ScanIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Preview } from '@/app/preview'
import { FileExplorer } from '@/app/file-explorer'
import { Logs } from '@/app/logs'
import { useSandboxStore } from '@/app/state'
import { DeployPanel } from '@/components/deploy/deploy-panel'
import { DatabasePanel } from '@/components/deploy/database-panel'
import { AuthPanel } from '@/components/deploy/auth-panel'

type Tab = 'preview' | 'files' | 'logs' | 'deploy' | 'database' | 'auth'
type ViewMode = 'fit' | 'mobile' | 'fullscreen'

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
  const [viewMode, setViewMode] = useState<ViewMode>('fit')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const previewContainerRef = useRef<HTMLDivElement>(null) // kept for future use
  const chatStatus = useSandboxStore((s) => s.chatStatus)
  const isWorking = chatStatus === 'streaming' || chatStatus === 'submitted'

  // CSS fullscreen — fixed overlay covering the whole viewport, no browser API needed.
  // Avoids the browser's "site is now fullscreen" OS-level notification entirely.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isFullscreen])

  function handleViewMode(mode: ViewMode) {
    if (mode === 'fullscreen') {
      setIsFullscreen((prev) => !prev)
      return
    }
    setIsFullscreen(false)
    setViewMode(mode)
  }

  return (
    <div className={cn(
      'flex flex-col min-h-0',
      isFullscreen
        ? 'fixed inset-0 z-50 bg-background'
        : 'h-full',
      className
    )}>
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

        {/* Loading indicator */}
        {isWorking && (
          <div className="ml-auto mr-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <LoaderIcon className="w-3 h-3 animate-spin" />
            <span className="font-mono">Building...</span>
          </div>
        )}

        {/* Preview view controls — only when on Preview tab */}
        {activeTab === 'preview' && (
          <div className={cn('flex items-center gap-0.5', isWorking ? 'mr-0' : 'ml-auto')}>
            <button
              type="button"
              title="Fit to screen"
              onClick={() => handleViewMode('fit')}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-sm text-xs transition-colors',
                viewMode === 'fit'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <ScanIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Mobile view"
              onClick={() => handleViewMode('mobile')}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-sm text-xs transition-colors',
                viewMode === 'mobile'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <SmartphoneIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Fullscreen — press Esc to exit"
              onClick={() => handleViewMode('fullscreen')}
              className="flex items-center justify-center w-7 h-7 rounded-sm text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <MaximizeIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative" ref={previewContainerRef}>
        {/* Esc to exit hint */}
        {isFullscreen && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in duration-300">
            <span className="text-xs text-white/60 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
              Press Esc to exit fullscreen
            </span>
          </div>
        )}
        <div className={cn('absolute inset-0', activeTab !== 'preview' && 'hidden')}>
          {viewMode === 'mobile' ? (
            <div className="flex items-center justify-center h-full bg-secondary/50 overflow-hidden">
              {/* Phone bezel */}
              <div className="relative flex flex-col rounded-[2.5rem] border-[8px] border-foreground/20 shadow-2xl bg-black overflow-hidden"
                style={{ width: 390, height: 'min(844px, calc(100% - 32px))' }}>
                {/* Notch */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 bg-foreground/15 rounded-full z-10" />
                <Preview className="w-full h-full rounded-none" />
              </div>
            </div>
          ) : (
            <Preview className="h-full rounded-t-none" />
          )}
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
