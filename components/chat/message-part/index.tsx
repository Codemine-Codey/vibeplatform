import type { Metadata } from '@/ai/messages/metadata'
import type { DataPart } from '@/ai/messages/data-parts'
import type { ToolSet } from '@/ai/tools'
import type { UIMessage } from 'ai'
import { GenerateFiles } from './generate-files'
import { CreateSandbox } from './create-sandbox'
import { GetSandboxURL } from './get-sandbox-url'
import { RunCommand } from './run-command'
import { ReportErrors } from './report-errors'
import { Reasoning } from './reasoning'
import { Text } from './text'
import { Narration } from './narration'
import { memo } from 'react'

interface Props {
  part: UIMessage<Metadata, DataPart, ToolSet>['parts'][number]
  partIndex: number
}

// DETERMINISTIC jargon filter. The model repeatedly ignores the "no technical narration"
// prompt rules and dumps developer-speak ("keys.has('flap')…", "MobileMenuTeaser isn't
// exported from HomeSections.tsx", "let me re-read the file"). We suppress any assistant
// text that names a source file, contains code, or narrates a fix/process. Warm opening +
// completion lines (plain prose, no code, no file paths, no "let me fix/check/grab") pass.
function isTechnicalNarration(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  // A source file path (Home.tsx, src/components/X, index.css…)
  if (/\b[\w/-]+\.(tsx|jsx|ts|js|css)\b/.test(t)) return true
  // Code operators / React identifiers / obvious code
  if (/=>|===|!==|\.\w+\(|\bkeys?\b|useEffect|useRef|useState|onMouseDown|onKeyDown|birdVy|keysRef|\bconst\b|\bfunction\b|\bimport(s|ed)?\b|\bexport(ed)?\b|querySelector|addEventListener/.test(t)) return true
  // Fix/process narration phrases
  if (/\b(is ?n'?t exported|not exported|the (issue|problem) (is|:)|let me (check|fix|re-?read|read|rewrite|generate|add|grab|also|lock|look|now)|update function|pointer handler|dev server|no longer (has|available)|already exist|the previous (patch|patches)|restart|re-?generate|the handler|overwritten|the file)\b/i.test(t)) return true
  // Process talk about planning/images/build plan
  if (/\b(build plan|lock in the|plan every file|grab the imag|the imagery|phase[- ]?1|phase[- ]?2)\b/i.test(t)) return true
  return false
}

export const MessagePart = memo(function MessagePart({
  part,
  partIndex,
}: Props) {
  // The user-facing chat SHOWS: the AI's prose, warm narration, the file-creation
  // animation (users like watching files build + the small code window), and the
  // get-sandbox-url message ONLY once VERIFIED (url present). It HIDES the raw internal
  // status noise: workspace init, shell commands ("starting preview server…"), reasoning,
  // and error reports — those stay internal (the BuildingIndicator covers progress).
  if (part.type === 'data-generating-files') {
    return <GenerateFiles message={part.data} />
  } else if (part.type === 'data-get-sandbox-url') {
    return part.data.url ? <GetSandboxURL message={part.data} /> : null
  } else if (part.type === 'data-narration') {
    return <Narration message={part.data} />
  } else if (part.type === 'text') {
    if (!part.text.trim()) return null
    // The model ignores the prompt gag rules, so filter technical/process text here.
    if (isTechnicalNarration(part.text)) return null
    return <Text part={part} />
  }
  // Hidden from chat (internal only): data-create-sandbox, data-run-command, reasoning,
  // data-report-errors.
  return null
})
// Intentionally not rendered in the user-facing chat (kept for potential internal views).
void CreateSandbox; void RunCommand; void Reasoning; void ReportErrors
