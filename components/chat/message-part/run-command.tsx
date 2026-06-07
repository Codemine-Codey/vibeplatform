import type { DataPart } from '@/ai/messages/data-parts'
import { CheckIcon, SquareChevronRightIcon, XIcon } from 'lucide-react'
import { Spinner } from './spinner'
import { ToolHeader } from '../tool-header'
import { ToolMessage } from '../tool-message'

function getCommandLabel(cmd: string, args: string[]): string {
  const full = [cmd, ...args].join(' ')
  if (/pnpm (run )?install|npm install|yarn install/.test(full)) return 'Installing dependencies'
  if (/pnpm (run )?dev|npm run dev|yarn dev/.test(full)) return 'Starting preview server'
  if (/pnpm (run )?build|npm run build/.test(full)) return 'Building project'
  if (cmd === 'node') return 'Applying configuration'
  if (cmd === 'rm' || cmd === 'cp' || cmd === 'mv') return 'Configuring workspace'
  if (cmd === 'git') return 'Saving project'
  return `Running ${cmd}`
}

function getStatusLabel(message: DataPart['run-command']): string {
  const label = getCommandLabel(message.command, message.args)
  if (message.status === 'executing' || message.status === 'waiting') return label + '...'
  if (message.status === 'running') return label + '...'
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
