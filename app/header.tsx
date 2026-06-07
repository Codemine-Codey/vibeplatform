import { cn } from '@/lib/utils'
import { ZapIcon } from 'lucide-react'

interface Props {
  className?: string
}

export async function Header({ className }: Props) {
  return (
    <header className={cn('flex items-center justify-between', className)}>
      <div className="flex items-center gap-2 ml-1 md:ml-2.5">
        <ZapIcon className="w-4 h-4" />
        <span className="text-sm uppercase font-mono font-bold tracking-tight">
          Codemine
        </span>
      </div>
    </header>
  )
}
