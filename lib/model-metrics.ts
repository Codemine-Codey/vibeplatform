import type {
  LanguageModelV3Middleware,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider'
import { logModelCall } from './telemetry'

// V3 usage reports inputTokens/outputTokens as either a plain number or a
// breakdown object ({ total, noCache, cacheRead, cacheWrite }). Normalize to the
// flat numbers telemetry expects; cacheRead is the prompt-cache hit count.
function flattenUsage(usage: LanguageModelV3Usage | undefined) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input: any = usage?.inputTokens
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output: any = usage?.outputTokens
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0)
  return {
    inputTokens: typeof input === 'object' && input ? num(input.total) : num(input),
    outputTokens: typeof output === 'object' && output ? num(output.total) : num(output),
    cachedInputTokens: typeof input === 'object' && input ? num(input.cacheRead) : 0,
  }
}

// Central instrumentation for EVERY model call. Applied once in the gateway via
// wrapLanguageModel, so no call site needs touching. Measures time-to-first-token,
// total time, and token usage (including cached input) — the raw data behind the
// Phase 1 latency/cost picture.
function isContentChunk(part: LanguageModelV3StreamPart): boolean {
  return (
    part.type === 'text-delta' ||
    part.type === 'reasoning-delta' ||
    part.type === 'tool-input-start' ||
    part.type === 'tool-input-delta' ||
    part.type === 'tool-call'
  )
}

export function metricsMiddleware(modelId: string): LanguageModelV3Middleware {
  return {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate }) => {
      const start = Date.now()
      const res = await doGenerate()
      logModelCall({
        modelId,
        kind: 'generate',
        ttftMs: null, // non-streaming — no meaningful first-token time
        totalMs: Date.now() - start,
        usage: flattenUsage(res.usage),
      })
      return res
    },
    wrapStream: async ({ doStream }) => {
      const start = Date.now()
      let ttftMs: number | null = null
      const { stream, ...rest } = await doStream()

      const instrumented = stream.pipeThrough(
        new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
          transform(part, controller) {
            if (ttftMs === null && isContentChunk(part)) {
              ttftMs = Date.now() - start
            }
            if (part.type === 'finish') {
              logModelCall({
                modelId,
                kind: 'stream',
                ttftMs,
                totalMs: Date.now() - start,
                usage: flattenUsage(part.usage),
              })
            }
            controller.enqueue(part)
          },
        })
      )

      return { stream: instrumented, ...rest }
    },
  }
}
