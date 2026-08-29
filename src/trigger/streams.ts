import { streams } from '@trigger.dev/sdk'
import type { DataPart } from '@/ai/messages/data-parts'
import type { UIMessage } from 'ai'

// The single Realtime stream the browser subscribes to during a build. Every UI chunk the
// pipeline emits (data-narration, data-create-sandbox, data-generating-files, data-get-
// sandbox-url, etc.) is appended here and delivered browser↔Trigger directly — NO Vercel
// function in the path, so there is no 740s cap and no reconnection needed. The client reads
// it via useRealtimeRunWithStreams(...).streams['cm-ui'].
export type CmUIChunk = Partial<UIMessage<never, DataPart>> & { id?: string; type: string; data?: unknown }

export const uiStream = streams.define<CmUIChunk>({ id: 'cm-ui' })
