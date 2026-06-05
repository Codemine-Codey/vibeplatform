import type { Command, CommandLog } from './types'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import z from 'zod/v3'

interface Props {
  command: Command
  onLog: (data: { sandboxId: string; cmdId: string; log: CommandLog }) => void
  onCompleted: (data: Command) => void
}

export function CommandLogs({ command, onLog, onCompleted }: Props) {
  const ref = useRef<Awaited<ReturnType<typeof getCommandLogs>> | null>(null)
  const activeRef = useRef(true)

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  useEffect(() => {
    if (ref.current) return

    const iterator = getCommandLogs(command.sandboxId, command.cmdId)
    ref.current = iterator

    ;(async () => {
      try {
        for await (const log of iterator) {
          if (!activeRef.current) return
          onLog({ sandboxId: command.sandboxId, cmdId: command.cmdId, log })
        }
        if (!activeRef.current) return
        const result = await getCommand(command.sandboxId, command.cmdId)
        onCompleted({
          sandboxId: result.sandboxId,
          cmdId: result.cmdId,
          startedAt: result.startedAt,
          exitCode: result.exitCode ?? 0,
          command: command.command,
          args: command.args,
        })
      } catch (err) {
        if (!activeRef.current) return
        console.error(`CommandLogs error for ${command.cmdId}:`, err)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <pre className={cn('whitespace-pre-wrap font-mono text-sm', {})}>
      {logContent(command)}
    </pre>
  )
}

function logContent(command: Command) {
  const date = new Date(command.startedAt).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const line = `${command.command} ${command.args.join(' ')}`
  const body = command.logs?.map((log) => log.data).join('') || ''
  return `[${date}] ${line}\n${body}`
}

const logSchema = z.object({
  data: z.string(),
  stream: z.enum(['stdout', 'stderr']),
  timestamp: z.number(),
})

async function* getCommandLogs(sandboxId: string, cmdId: string) {
  // 15s timeout on the initial connection only — not on the stream read
  const controller = new AbortController()
  const connectionTimeout = setTimeout(() => controller.abort(), 15_000)

  let response: Response
  try {
    response = await fetch(`/api/sandboxes/${sandboxId}/cmds/${cmdId}/logs`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(connectionTimeout)
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch logs: ${response.status} ${response.statusText}`)
  }
  if (!response.body) {
    throw new Error('Log response body is empty')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')

      for (let i = 0; i < lines.length - 1; i++) {
        if (!lines[i]) continue
        try {
          const parsed = logSchema.parse(JSON.parse(lines[i]))
          yield parsed
        } catch {
          // Skip malformed log lines — never crash the stream
        }
      }
      buffer = lines[lines.length - 1]
    }
  } finally {
    reader.releaseLock()
  }
}

const cmdSchema = z.object({
  sandboxId: z.string(),
  cmdId: z.string(),
  startedAt: z.number(),
  exitCode: z.number().optional(),
})

async function getCommand(sandboxId: string, cmdId: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(`/api/sandboxes/${sandboxId}/cmds/${cmdId}`, {
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch command status: ${response.status}`)
    }
    const json = await response.json()
    const result = cmdSchema.safeParse(json)
    if (!result.success) {
      throw new Error(`Unexpected command response: ${result.error.message}`)
    }
    return result.data
  } finally {
    clearTimeout(timeout)
  }
}
