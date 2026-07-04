import { Streamdown } from 'streamdown'
import { SparklesIcon } from 'lucide-react'

// Durable-runs STEP 2: a server-posted conversational phase-narration message
// ("Your site is live — I'm filling in the rest of the pages now…"). Rendered
// identically to an assistant text line so it reads as the AI talking to the user.
export function Narration({ message }: { message: { text: string } }) {
  if (!message.text.trim()) return null
  return (
    <div className="text-sm flex gap-2 items-start px-1">
      <SparklesIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="text-foreground leading-relaxed">
        <Streamdown>{message.text}</Streamdown>
      </div>
    </div>
  )
}
