import type { DataPart } from '@/ai/messages/data-parts'
import { CheckIcon, SquareChevronRightIcon } from 'lucide-react'
import { Spinner } from './spinner'
import { ToolHeader } from '../tool-header'
import { ToolMessage } from '../tool-message'

// A server-side friendly status phrase (e.g. "Finalizing your project",
// "Visual quality check") is a multi-word string starting with a capital — it is
// already user-facing copy, so it is passed through verbatim, never prefixed with
// "Running" and never shown as "failed" (these steps are best-effort and silent).
function isFriendlyPhrase(cmd: string): boolean {
  return /\s/.test(cmd) && /^[A-Z]/.test(cmd)
}

function getCommandLabel(cmd: string, args: string[]): string {
  if (isFriendlyPhrase(cmd)) return cmd
  const full = [cmd, ...args].join(' ')
  if (/(pnpm|npm|yarn|bun)\s+(run\s+)?install/.test(full) || /yarn install/.test(full)) return 'Installing dependencies'
  if (/(pnpm|npm|yarn|bun)\s+(run\s+)?dev/.test(full)) return 'Starting preview server'
  if (/(pnpm|npm|yarn|bun)\s+(run\s+)?build/.test(full)) return 'Building project'
  if (/(pnpm|npm|yarn|bun)\s+add\b/.test(full)) return 'Installing dependencies'
  if (cmd === 'node') return 'Applying configuration'
  if (cmd === 'rm' || cmd === 'cp' || cmd === 'mv') return 'Configuring workspace'
  if (cmd === 'git') return 'Saving project'
  if (['cat', 'head', 'tail', 'wc', 'ls', 'grep', 'find'].includes(cmd)) return 'Reviewing project files'
  if (cmd === 'sleep') return 'Waiting for the preview'
  if (['pkill', 'fuser', 'kill'].includes(cmd)) return 'Restarting preview server'
  if (cmd === 'bash' || cmd === 'sh') return 'Running a setup task'
  return 'Working on your project'
}

function getStatusLabel(message: DataPart['run-command']): string {
  const label = getCommandLabel(message.command, message.args)
  if (message.status === 'executing' || message.status === 'waiting') return label + '...'
  if (message.status === 'running') return label + '...'
  // Friendly background steps always read as completed — repairs are best-effort
  // and a "failed" here would alarm the user over something already handled.
  // NEVER surface "failed" (Fable step 5): every command failure is handled by the pipeline's
  // silent repair/fallback, so a red "— failed" in chat only alarms the user over something
  // already being fixed. A finished step always reads as "— done"; anything else reads as
  // in-progress. Genuinely unrecoverable states are handled by the pipeline's terminal message.
  if (isFriendlyPhrase(message.command)) {
    if (message.status === 'done' || message.status === 'error') return label + ' — done'
    return label
  }
  if (message.status === 'done' || message.status === 'error') return label + ' — done'
  return label
}

export function RunCommand({ message }: { message: DataPart['run-command'] }) {
  // No error state is surfaced (Fable step 5) — the card only ever reads "Working" or "Done".
  // Command failures are absorbed by the pipeline's silent repair; showing a red X here would
  // alarm the user over something already handled.
  const isActive = ['executing', 'waiting', 'running'].includes(message.status)

  return (
    <ToolMessage>
      <ToolHeader>
        <SquareChevronRightIcon className="w-3.5 h-3.5" />
        {isActive ? 'Working' : 'Done'}
      </ToolHeader>
      <div className="relative pl-6 min-h-5">
        <Spinner className="absolute left-0 top-0" loading={isActive}>
          <CheckIcon className="w-4 h-4" />
        </Spinner>
        <span>{getStatusLabel(message)}</span>
      </div>
    </ToolMessage>
  )
}
