import type { DataPart } from '@/ai/messages/data-parts'
import { CheckIcon, MonitorIcon } from 'lucide-react'
import { Spinner } from './spinner'
import { ToolHeader } from '../tool-header'
import { ToolMessage } from '../tool-message'

export function GetSandboxURL({
  message,
}: {
  message: DataPart['get-sandbox-url']
}) {
  return (
    <ToolMessage>
      <ToolHeader>
        <MonitorIcon className="w-3.5 h-3.5" />
        <span>Live Preview</span>
      </ToolHeader>
      <div className="relative pl-6 min-h-5">
        <Spinner
          className="absolute left-0 top-0"
          loading={message.status === 'loading'}
        >
          <CheckIcon className="w-4 h-4" />
        </Spinner>
        {message.url ? (
          <span>Your project is live and ready — open the Preview tab.</span>
        ) : (
          <span>Getting your preview ready...</span>
        )}
      </div>
    </ToolMessage>
  )
}
