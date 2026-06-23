import type { TextUIPart } from 'ai'
import { Streamdown } from 'streamdown'
import { SparklesIcon, Loader2Icon } from 'lucide-react'

// "Thinking out loud" narration the user shouldn't see prominently — "Let me
// check…", "I can see the issue…", "Now let me fix…". The prompt bans it, but as
// a safety net we render any that slips through as a muted, small status line
// instead of a prominent message, so the chat stays clean (Lovable-style).
const NARRATION_RE =
  /^(let me\b|let's\b|now (let me|i)\b|i'?ll\b|i will\b|i can see\b|i see\b|i notice\b|i need to\b|looking at\b|let me (check|read|look|fix|see)\b|wait\b|actually\b|hmm\b|ok(ay)?,?\s|first,?\s|next,?\s|the (issue|problem|error) (is|seems)\b|so,?\s)/i

function isNarration(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  // Short, process-y, no markdown structure → treat as narration chatter.
  return NARRATION_RE.test(t) && t.length < 400 && !/[#*\-`]/.test(t.slice(0, 3))
}

export function Text({ part }: { part: TextUIPart }) {
  if (isNarration(part.text)) {
    return (
      <div className="text-xs flex gap-2 items-center px-1 text-muted-foreground/70 italic">
        <Loader2Icon className="w-3 h-3 shrink-0 animate-spin" />
        <span className="truncate">Working…</span>
      </div>
    )
  }
  return (
    <div className="text-sm flex gap-2 items-start px-1">
      <SparklesIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="text-foreground leading-relaxed">
        <Streamdown>{part.text}</Streamdown>
      </div>
    </div>
  )
}
