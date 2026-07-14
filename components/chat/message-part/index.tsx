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

export const MessagePart = memo(function MessagePart({
  part,
  partIndex,
}: Props) {
  // The user-facing chat is kept CLEAN. Internal build activity (workspace init, file
  // writes, shell commands, reasoning, error reports, "starting preview…") is NOT shown —
  // the animated BuildingIndicator covers progress while working. We render ONLY: the AI's
  // prose, warm narration, and the get-sandbox-url message ONCE it is VERIFIED (url present),
  // never its "getting preview ready" loading state.
  if (part.type === 'data-get-sandbox-url') {
    return part.data.url ? <GetSandboxURL message={part.data} /> : null
  } else if (part.type === 'data-narration') {
    return <Narration message={part.data} />
  } else if (part.type === 'text') {
    if (!part.text.trim()) return null
    return <Text part={part} />
  }
  // Hidden from chat (internal only): data-generating-files, data-create-sandbox,
  // data-run-command, reasoning, data-report-errors.
  return null
})
// Keep imports referenced so linters don't flag them; these components are intentionally
// no longer rendered in the user-facing chat (kept for potential internal/debug views).
void GenerateFiles; void CreateSandbox; void RunCommand; void Reasoning; void ReportErrors
