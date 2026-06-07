import type { TextUIPart } from 'ai'
import { Streamdown } from 'streamdown'
import { SparklesIcon } from 'lucide-react'

export function Text({ part }: { part: TextUIPart }) {
  return (
    <div className="text-sm flex gap-2 items-start px-1">
      <SparklesIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="text-foreground leading-relaxed">
        <Streamdown>{part.text}</Streamdown>
      </div>
    </div>
  )
}
