'use client'

import { type ChatUIMessage } from '@/components/chat/types'
import { type ReactNode } from 'react'
import { Chat } from '@ai-sdk/react'
import { DataPart } from '@/ai/messages/data-parts'
import { DataUIPart, DefaultChatTransport } from 'ai'
import { createContext, useContext, useMemo, useRef } from 'react'
import { unstable_batchedUpdates } from 'react-dom'
import { useDataStateMapper, useSandboxStore } from '@/app/state'
import { mutate } from 'swr'
import { toast } from 'sonner'

interface ChatContextValue {
  chat: Chat<ChatUIMessage>
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined)

// ── Tail the durable run by SHORT-POLLING (not a long-lived stream) ──────────────
// The old reconnect re-opened /api/runs/:id/stream — itself a 740s-capped Vercel SSE
// connection — and tracked the cursor off `payload.seq`, which the stream never emits
// (it sends bare UIMessageChunks). Result: every reconnect restarted at since=0 and a
// long build looked frozen (the exact blank the user hit). This polls /events instead:
// each request is <1s (no 740s boundary → nothing to "reconnect" to), and the endpoint
// returns an explicit nextCursor so the cursor actually advances. Loops until the run is
// terminal (done/error) or a preview URL arrives. This is also the designed fallback
// layer under the Trigger.dev Realtime migration.
async function reconnectAndDrain(
  runId: string,
  cursor: number,
  mapDataToState: (data: DataUIPart<DataPart>) => void,
  abortSignal: AbortSignal
) {
  let lastCursor = cursor
  const POLL_MS = 1500
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (abortSignal.aborted) break
    if (useSandboxStore.getState().url) break // preview arrived — done

    try {
      const res = await fetch(`/api/runs/${runId}/events?since=${lastCursor}`, { signal: abortSignal })
      // Permanent (not owned / gone) → stop. Transient (5xx/429/cold start) → back off + retry,
      // never abandon a live build on a blip.
      if (res.status === 401 || res.status === 404) break
      if (!res.ok) { await sleep(2000); continue }

      const data = (await res.json()) as {
        events: Array<{ seq: number; payload: unknown }>
        nextCursor: number
        terminal: boolean
      }

      if (typeof data.nextCursor === 'number' && data.nextCursor > lastCursor) {
        lastCursor = data.nextCursor
        useSandboxStore.getState().advanceRunCursor(data.nextCursor)
      }
      if (Array.isArray(data.events) && data.events.length > 0) {
        unstable_batchedUpdates(() => {
          for (const ev of data.events) {
            try { mapDataToState(ev.payload as DataUIPart<DataPart>) } catch { /* non-fatal */ }
          }
        })
      }

      if (useSandboxStore.getState().url) break // reveal event just landed
      if (data.terminal) break // run finished (done/error) AND we're caught up
    } catch (e) {
      if (abortSignal.aborted) break
      console.warn('[run-poll] poll failed:', e instanceof Error ? e.message : e)
      await sleep(2000)
      continue
    }

    await sleep(POLL_MS)
  }

  // Loop ended without a preview URL and not because the user aborted → the run reached a
  // terminal (error) state with no reveal. Surface a friendly, recoverable line so the loader
  // (up while activeRunId && !url) can't spin forever.
  if (!abortSignal.aborted && !useSandboxStore.getState().url) {
    useSandboxStore.getState().setStreamError(
      "That one took longer than expected — tap continue and I'll pick up right where I left off."
    )
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
        // GAP A FIX: capture the runId from the `x-workflow-run-id` RESPONSE HEADER the
        // moment the POST responds — BEFORE any stream event. Previously activeRunId was
        // set only by the `data-run` stream event, so if the stream dropped before that
        // event arrived (the exact 12-min blank), the client had no runId to reconnect
        // to → dead UI. The header is present as soon as headers arrive, even if the body
        // then drops, so reconnect (onFinish/onError → reconnectAndDrain) can always fire.
        transport: new DefaultChatTransport<ChatUIMessage>({
          fetch: async (input, init) => {
            const res = await fetch(input as RequestInfo, init)
            try {
              const rid = res.headers.get('x-workflow-run-id')
              if (rid && !useSandboxStore.getState().activeRunId) {
                useSandboxStore.getState().setActiveRun(rid, 0)
              }
            } catch { /* header capture is best-effort — data-run event is the backup */ }
            return res
          },
        }),
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
