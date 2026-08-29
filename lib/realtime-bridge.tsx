'use client'

import { useEffect, useRef } from 'react'
import { useRealtimeRunWithStreams } from '@trigger.dev/react-hooks'
import { unstable_batchedUpdates } from 'react-dom'
import { useDataStateMapper, useSandboxStore } from '@/app/state'
import type { DataUIPart } from 'ai'
import type { DataPart } from '@/ai/messages/data-parts'

// Subscribes to the Trigger.dev 'cm-ui' Realtime stream (browser ↔ Trigger DIRECT — no Vercel
// function in the path, so NO 740s cap and NO reconnection needed) and feeds each new chunk
// through the SAME mapDataToState the SSE path uses. Active only in worker mode, i.e. once the
// build POST returns x-trigger-run-id + x-trigger-public-token (captured into the store). The
// Supabase-poll fallback (reconnectAndDrain) still runs if a Realtime connection ever drops.
//
// streams['cm-ui'] is CUMULATIVE (all chunks so far), so we track a processed cursor and only
// map the newly-arrived tail — never re-apply an event.
export function RealtimeBridge() {
  const triggerRunId = useSandboxStore((s) => s.triggerRunId)
  const triggerToken = useSandboxStore((s) => s.triggerToken)
  const mapDataToState = useDataStateMapper()
  const processed = useRef(0)
  const lastRunId = useRef<string | null>(null)

  const enabled = !!triggerRunId && !!triggerToken
  const { streams } = useRealtimeRunWithStreams(triggerRunId ?? undefined, {
    accessToken: triggerToken ?? undefined,
    enabled,
  })

  // New run → reset the processed cursor so we replay its stream from the start.
  if (triggerRunId && triggerRunId !== lastRunId.current) {
    lastRunId.current = triggerRunId
    processed.current = 0
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ui = ((streams as Record<string, any> | undefined)?.['cm-ui'] as Array<DataUIPart<DataPart>> | undefined) ?? []

  useEffect(() => {
    if (ui.length <= processed.current) return
    const fresh = ui.slice(processed.current)
    processed.current = ui.length
    unstable_batchedUpdates(() => {
      for (const part of fresh) {
        try { mapDataToState(part) } catch { /* non-fatal — one bad chunk never breaks the stream */ }
      }
    })
  }, [ui, mapDataToState])

  return null
}
