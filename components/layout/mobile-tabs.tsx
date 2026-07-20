'use client'

import { MessageSquareIcon, MonitorIcon, FolderOpenIcon, CloudIcon } from 'lucide-react'
import { useTabState } from '@/components/tabs/use-tab-state'
import { useSandboxStore } from '@/app/state'
import { cn } from '@/lib/utils'

// Mobile tab bar — matches the DESKTOP RightPanel design (segmented, rounded, icon+label,
// active = raised) instead of the old wrapping underline list. Same four surfaces the
// desktop exposes: Chat, Preview, Code, and the unified Cloud dashboard (Deploy/DB/Auth
// live INSIDE Cloud now). A single horizontal row that fits 375px without wrapping.
const TABS = [
  { id: 'chat', label: 'Chat', icon: MessageSquareIcon },
  { id: 'preview', label: 'Preview', icon: MonitorIcon },
  { id: 'file-explorer', label: 'Code', icon: FolderOpenIcon },
  { id: 'cloud', label: 'Cloud', icon: CloudIcon },
] as const

export function MobileTabs() {
  const [activeTabId, setTabId] = useTabState()
  const previewUrl = useSandboxStore((s) => s.url)
  const deployedUrl = useSandboxStore((s) => s.deployedUrl)
  const chatStatus = useSandboxStore((s) => s.chatStatus)
  const isWorking = chatStatus === 'streaming' || chatStatus === 'submitted'

  return (
    <div className="flex items-center gap-0.5 bg-secondary border border-primary/18 rounded-sm h-9 px-1 mx-1 shrink-0 overflow-x-auto">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setTabId(id)}
          className={cn(
            'relative flex flex-1 items-center justify-center gap-1.5 px-2 h-7 rounded-sm text-xs whitespace-nowrap transition-all duration-150',
            activeTabId === id
              ? 'bg-background text-foreground font-medium shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="w-3.5 h-3.5 shrink-0" />
          {label}
          {id === 'preview' && previewUrl && !isWorking && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          )}
          {id === 'cloud' && deployedUrl && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
          )}
        </button>
      ))}
    </div>
  )
}
