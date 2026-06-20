import type { ModelMessage } from 'ai'

// Phase 4 — history hygiene (provider-agnostic, so it works on the Flash edit
// path where Anthropic's native context-editing does not apply).
//
// As an edit session grows, every turn re-sends every earlier file read. Those
// stale readFile/readFiles/grepCode results are dead weight once the model has
// acted on them — they inflate input tokens and slow each turn. We replace the
// CONTENT of all-but-the-most-recent read results with a short placeholder,
// keeping the tool-call/result structure intact (so pairing never breaks) and
// — critically — never touching the system prefix, so the prompt cache stays valid.
const READ_TOOLS = new Set(['readFile', 'readFiles', 'grepCode'])
const KEEP_RECENT = 1

export function trimStaleReadResults(messages: ModelMessage[]): ModelMessage[] {
  try {
    // Locate every read-tool result, in order.
    const refs: Array<[number, number]> = []
    messages.forEach((m, mi) => {
      if (m.role !== 'tool' || !Array.isArray(m.content)) return
      m.content.forEach((part, pi) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = part as any
        if (p?.type === 'tool-result' && READ_TOOLS.has(p?.toolName)) refs.push([mi, pi])
      })
    })
    if (refs.length <= KEEP_RECENT) return messages

    const blank = new Set(
      refs.slice(0, refs.length - KEEP_RECENT).map(([mi, pi]) => `${mi}:${pi}`)
    )

    return messages.map((m, mi) => {
      if (m.role !== 'tool' || !Array.isArray(m.content)) return m
      let changed = false
      const content = m.content.map((part, pi) => {
        if (!blank.has(`${mi}:${pi}`)) return part
        changed = true
        // v6 tool-result output is { type: 'text' | 'json' | ..., value }. A text
        // placeholder is always valid and preserves toolCallId/toolName pairing.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return {
          ...(part as any),
          output: { type: 'text', value: '[earlier file content omitted to save context — re-read with readFiles if still needed]' },
        }
      })
      return changed ? ({ ...m, content } as ModelMessage) : m
    })
  } catch {
    // Any structural surprise → leave history untouched. Never break a turn.
    return messages
  }
}
