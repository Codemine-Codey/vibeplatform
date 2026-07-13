'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MonitorIcon, FolderOpenIcon, LoaderIcon, CloudIcon,
  MaximizeIcon, ScanIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Preview } from '@/app/preview'
import { FileExplorer } from '@/app/file-explorer'
import { Logs } from '@/app/logs'
import { useSandboxStore } from '@/app/state'
import { CloudDashboard } from '@/components/cloud/cloud-dashboard'

type Tab = 'preview' | 'files' | 'logs' | 'cloud'
type ViewMode = 'fit' | 'fullscreen'

// Deploy/Database/Auth are now sections INSIDE the unified Cloud dashboard, so the
// top-level tabs are just Preview, Code, Cloud. Logs stays mounted (hidden) for the
// error-monitor.
// Tab definitions — cloud label shows a dot when deploy is live
const TABS = [
  { id: 'preview' as Tab, label: 'Preview', icon: MonitorIcon },
  { id: 'files' as Tab, label: 'Code', icon: FolderOpenIcon },
  { id: 'cloud' as Tab, label: 'Cloud', icon: CloudIcon },
] as const

interface Props {
  className?: string
}

export function RightPanel({ className }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('preview')
  const [viewMode, setViewMode] = useState<ViewMode>('fit')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const previewContainerRef = useRef<HTMLDivElement>(null) // kept for future use
  const chatStatus = useSandboxStore((s) => s.chatStatus)
  const previewUrl = useSandboxStore((s) => s.url)
  const deployedUrl = useSandboxStore((s) => s.deployedUrl)
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
              'relative flex items-center gap-1.5 px-3 h-7 rounded-sm text-xs transition-all duration-150',
              activeTab === id
                ? 'bg-background text-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <Icon className="w-3 h-3 shrink-0" />
            {label}
            {/* Dot indicators: preview=ready, cloud=deployed */}
            {id === 'preview' && previewUrl && !isWorking && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            )}
            {id === 'cloud' && deployedUrl && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            )}
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
            {/* Open-in-new-tab intentionally hidden — the preview lives in-panel only. */}
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
          <Preview className="h-full rounded-t-none" />
        </div>
        <div className={cn('absolute inset-0', activeTab !== 'files' && 'hidden')}>
          <FileExplorer className="h-full rounded-t-none" />
        </div>
        <div className={cn('absolute inset-0', activeTab !== 'logs' && 'hidden')}>
          <Logs className="h-full rounded-t-none" />
        </div>
        <div className={cn('absolute inset-0', activeTab !== 'cloud' && 'hidden')}>
          <CloudDashboard className="h-full" />
        </div>
      </div>
    </div>
  )
}
