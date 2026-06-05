'use client'

import { useEffect, useRef } from 'react'
import { useSandboxStore } from '@/app/state'
import stripAnsi from 'strip-ansi'
import z from 'zod/v3'

export function CommandLogsStream() {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const addLog = useSandboxStore((s) => s.addLog)
  const upsertCommand = useSandboxStore((s) => s.upsertCommand)

  // Derive a stable string from command IDs only — changes when NEW commands
  // are added, but NOT when logs are added to existing commands. This prevents
  // the effect from re-running on every log line (which caused update depth errors).
  const commandIds = useSandboxStore((s) =>
    s.commands.map((c) => c.cmdId).join(',')
  )

  const streamingRef = useRef<Set<string>>(new Set())
  const activeRef = useRef(true)

  // Reset tracking on sandbox change
  useEffect(() => {
    streamingRef.current = new Set()
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [sandboxId])

  useEffect(() => {
    if (!sandboxId) return

    // Read commands snapshot without creating a reactive subscription.
    // commandIds already triggers this effect when IDs change.
    const commands = useSandboxStore.getState().commands

    for (const command of commands) {
      if (command.exitCode !== undefined) continue
      if (streamingRef.current.has(command.cmdId)) continue

      streamingRef.current.add(command.cmdId)
      const { cmdId } = command

      ;(async () => {
        try {
          for await (const log of getCommandLogs(sandboxId, cmdId)) {
            if (!activeRef.current) return
            addLog({ sandboxId, cmdId, log })
          }
          if (!activeRef.current) return
          const result = await getCommand(sandboxId, cmdId)
          upsertCommand({
            sandboxId: result.sandboxId,
            cmdId: result.cmdId,
            exitCode: result.exitCode ?? 0,
            command: command.command,
            args: command.args,
          })
        } catch (err) {
          if (!activeRef.current) return
          streamingRef.current.delete(cmdId)
          console.error(`Log stream error for command ${cmdId}:`, err)
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxId, commandIds])

  return null
}

const logSchema = z.object({
  data: z.string(),
  stream: z.enum(['stdout', 'stderr']),
  timestamp: z.number(),
})

async function* getCommandLogs(sandboxId: string, cmdId: string) {
  // Timeout only on the initial connection — not on the stream read itself
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
          yield {
            data: stripAnsi(parsed.data),
            stream: parsed.stream,
            timestamp: parsed.timestamp,
          }
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
      throw new Error(`Unexpected command response shape: ${result.error.message}`)
    }
    return result.data
  } finally {
    clearTimeout(timeout)
  }
}
