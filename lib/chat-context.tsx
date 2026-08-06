'use client'

import { type ChatUIMessage } from '@/components/chat/types'
import { type ReactNode } from 'react'
import { Chat } from '@ai-sdk/react'
import { DataPart } from '@/ai/messages/data-parts'
import { DataUIPart } from 'ai'
import { createContext, useContext, useMemo, useRef } from 'react'
import { unstable_batchedUpdates } from 'react-dom'
import { useDataStateMapper, useSandboxStore } from '@/app/state'
import { mutate } from 'swr'
import { toast } from 'sonner'

interface ChatContextValue {
  chat: Chat<ChatUIMessage>
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined)

// ── Reconnect to the Supabase-backed run stream when the HTTP polling stream dies ──
// The pollingStream inside route.ts lives for at most 800s (Vercel maxDuration). When
// it dies the client stream "terminates" cleanly. But the Workflow steps (stepGenerate
// + stepVerify) each have their OWN 800s budget and may still be running. Without a
// reconnect the user sees nothing after 13 minutes even though the build is ongoing.
//
// Strategy: when the primary stream ends and we have no URL yet, reconnect to
// /api/runs/:runId/stream?since=<lastCursor> and continue processing events.
async function reconnectAndDrain(
  runId: string,
  cursor: number,
  mapDataToState: (data: DataUIPart<DataPart>) => void,
  abortSignal: AbortSignal
) {
  let lastCursor = cursor
  const MAX_RECONNECTS = 6  // up to 6 × 800s = 80 minutes max reconnects
  for (let attempt = 0; attempt < MAX_RECONNECTS; attempt++) {
    if (abortSignal.aborted) break
    // Check if we already have a URL — no need to keep reconnecting
    if (useSandboxStore.getState().url) break

    try {
      const res = await fetch(`/api/runs/${runId}/stream?since=${lastCursor}`, {
        signal: abortSignal,
        headers: { Accept: 'text/event-stream' },
      })
      if (!res.ok || !res.body) break

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        if (abortSignal.aborted) { reader.releaseLock(); break }
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const payload = JSON.parse(line.slice(6))
            // Track cursor from seq if present
            if (typeof payload.seq === 'number' && payload.seq > lastCursor) {
              lastCursor = payload.seq
              useSandboxStore.getState().advanceRunCursor(payload.seq)
            }
            unstable_batchedUpdates(() => {
              try { mapDataToState(payload) } catch { /* non-fatal */ }
            })
          } catch { /* malformed line — skip */ }
        }
      }
      reader.releaseLock()
    } catch (e) {
      if (abortSignal.aborted) break
      console.warn(`[run-reconnect] attempt ${attempt + 1} failed:`, e instanceof Error ? e.message : e)
      // Brief delay before retry
      await new Promise(r => setTimeout(r, 2000))
    }

    if (useSandboxStore.getState().url) break
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const mapDataToState = useDataStateMapper()
  const mapDataToStateRef = useRef(mapDataToState)
  mapDataToStateRef.current = mapDataToState

  // Tracks active reconnect abort controller so we can cancel it when a new build starts
  const reconnectAbortRef = useRef<AbortController | null>(null)

  const chat = useMemo(
    () =>
      new Chat<ChatUIMessage>({
        onToolCall: () => mutate('/api/auth/info'),
        onData: (data: DataUIPart<DataPart>) => {
          // Defer to next macrotask so this never runs during a React render phase.
          // unstable_batchedUpdates ensures all resulting Zustand set() calls are
          // processed in a single React render cycle, preventing cascading renders
          // even when useSyncExternalStore (which Zustand uses) is involved.
          setTimeout(() => {
            unstable_batchedUpdates(() => {
              try {
                mapDataToStateRef.current(data)
              } catch (err) {
                console.error('Error processing stream event:', err)
              }
            })
          }, 0)
        },
        onFinish: () => {
          // When the HTTP stream ends: if we received a runId but still have no URL,
          // the Workflow steps are still running in separate invocations. Reconnect
          // to the durable run stream so the user always gets their result.
          const { activeRunId, lastRunEventCursor, url } = useSandboxStore.getState()
          if (!activeRunId || url) return  // already have URL, or no run to reconnect to

          // Cancel any previous reconnect
          reconnectAbortRef.current?.abort()
          const ac = new AbortController()
          reconnectAbortRef.current = ac

          reconnectAndDrain(activeRunId, lastRunEventCursor, mapDataToStateRef.current, ac.signal)
            .catch(() => {})
        },
        onError: (error) => {
          const msg = error?.message ?? ''
          const isTerminated = msg === 'terminated' || msg.includes('terminated')
          if (isTerminated) {
            console.warn('Stream terminated:', error)
          } else {
            console.error('AI communication error:', error)
          }
          // Always reconnect if we have a pending build — covers both clean termination
          // AND network errors ("Failed to fetch") when Vercel kills the 800s function
          const { activeRunId, lastRunEventCursor, url } = useSandboxStore.getState()
          if (activeRunId && !url) {
            reconnectAbortRef.current?.abort()
            const ac = new AbortController()
            reconnectAbortRef.current = ac
            reconnectAndDrain(activeRunId, lastRunEventCursor, mapDataToStateRef.current, ac.signal)
              .catch(() => {})
            return // reconnecting — suppress error toast
          }
          if (!isTerminated) {
            // Show error inside the chat (persistent, can't be missed like a toast)
            useSandboxStore.getState().setStreamError(
              "Something went wrong — please try again."
            )
            toast.error('Connection issue — please try again.', { duration: 8000 })
          }
        },
      }),
    []
  )

  return (
    <ChatContext.Provider value={{ chat }}>{children}</ChatContext.Provider>
  )
}

export function useSharedChatContext() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useSharedChatContext must be used within a ChatProvider')
  }
  return context
}
