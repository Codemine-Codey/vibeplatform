import type { DataPart } from '@/ai/messages/data-parts'
import { CheckIcon, SquareChevronRightIcon, XIcon } from 'lucide-react'
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
  if (cmd === 'node') return 'Applying configuration'
  if (cmd === 'rm' || cmd === 'cp' || cmd === 'mv') return 'Configuring workspace'
  if (cmd === 'git') return 'Saving project'
  return `Running ${cmd}`
}

function getStatusLabel(message: DataPart['run-command']): string {
  const label = getCommandLabel(message.command, message.args)
  if (message.status === 'executing' || message.status === 'waiting') return label + '...'
  if (message.status === 'running') return label + '...'
  // Friendly background steps always read as completed — repairs are best-effort
  // and a "failed" here would alarm the user over something already handled.
  if (isFriendlyPhrase(message.command)) {
    if (message.status === 'done' || message.status === 'error') return label + ' — done'
    return label
  }
  if (message.status === 'done' && (!message.exitCode || message.exitCode === 0)) return label + ' — done'
  if (message.status === 'done' && message.exitCode === 1) return label + ' — failed'
  if (message.status === 'error') return label + ' — failed'
  return label
}

export function RunCommand({ message }: { message: DataPart['run-command'] }) {
  const isError =
    (message.exitCode !== undefined && message.exitCode > 0) ||
    message.status === 'error'
  const isActive = ['executing', 'waiting', 'running'].includes(message.status)

  return (
    <ToolMessage>
      <ToolHeader>
        <SquareChevronRightIcon className="w-3.5 h-3.5" />
        {isActive ? 'Working' : isError ? 'Errored' : 'Done'}
      </ToolHeader>
      <div className="relative pl-6 min-h-5">
        <Spinner className="absolute left-0 top-0" loading={isActive}>
          {isError ? (
            <XIcon className="w-4 h-4 text-red-700" />
          ) : (
            <CheckIcon className="w-4 h-4" />
          )}
        </Spinner>
        <span>{getStatusLabel(message)}</span>
      </div>
    </ToolMessage>
  )
}
