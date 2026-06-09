import { cn } from '@/lib/utils'
import { ZapIcon, LayoutDashboardIcon } from 'lucide-react'
import Link from 'next/link'
import { ThemeToggle } from '@/components/theme-toggle'

interface Props {
  className?: string
  page?: 'builder' | 'dashboard'
}

export async function Header({ className, page = 'builder' }: Props) {
  return (
    <header className={cn('flex items-center justify-between', className)}>
      <Link href="/" className="flex items-center gap-2 ml-1 md:ml-2.5 hover:opacity-70 transition-opacity">
        <ZapIcon className="w-4 h-4" />
        <span className="text-sm uppercase font-mono font-bold tracking-tight">
          Codemine
        </span>
      </Link>

      <div className="flex items-center gap-3 mr-1 md:mr-2.5">
        {page === 'builder' ? (
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutDashboardIcon className="w-3.5 h-3.5" />
            Dashboard
          </Link>
        ) : (
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <ZapIcon className="w-3 h-3" />
            New Project
          </Link>
        )}

        <ThemeToggle />

        {/* User avatar placeholder */}
        <div className="w-7 h-7 rounded-full bg-foreground/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-foreground/70 select-none">
          S
        </div>
      </div>
    </header>
  )
}
