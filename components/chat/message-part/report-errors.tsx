import { SparklesIcon } from 'lucide-react'
import { ToolHeader } from '../tool-header'
import { ToolMessage } from '../tool-message'

// Professional, user-facing rendering. The full technical error (stack trace,
// PostCSS detail, file/line) is still sent to the AI via the message data and
// transformMessages — it is just hidden from the chat so the experience stays
// clean. We never show raw stack traces to the user.
export function ReportErrors() {
  return (
    <ToolMessage>
      <ToolHeader>
        <SparklesIcon className="w-3.5 h-3.5" />
        <span>Polishing your preview</span>
      </ToolHeader>
      <div className="relative min-h-5 text-sm text-muted-foreground">
        Spotted a small display issue — fixing it now.
      </div>
    </ToolMessage>
  )
}
