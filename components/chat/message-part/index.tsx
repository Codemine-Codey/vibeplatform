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
    return <Text part={part} />
  }
  // Hidden from chat (internal only): data-create-sandbox, data-run-command, reasoning,
  // data-report-errors.
  return null
})
// Intentionally not rendered in the user-facing chat (kept for potential internal views).
void CreateSandbox; void RunCommand; void Reasoning; void ReportErrors
