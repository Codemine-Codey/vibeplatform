import { cn } from '@/lib/utils'
import { ZapIcon, LayoutDashboardIcon, LogOutIcon } from 'lucide-react'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/supabase/server'

interface Props {
  className?: string
  page?: 'builder' | 'dashboard'
}

export async function Header({ className, page = 'builder' }: Props) {
  const user = await getCurrentUser()
  const initial = (user?.email?.[0] ?? 'C').toUpperCase()
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

        {/* User avatar + sign out */}
        <div
          title={user?.email ?? ''}
          className="w-7 h-7 rounded-full bg-foreground/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-foreground/70 select-none"
        >
          {initial}
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            title="Sign out"
            className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <LogOutIcon className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </header>
  )
}
