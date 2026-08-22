// Shared narration-silence TransformStream for the edit/chat path.
//
// WHY: after the model's FIRST tool call we suppress its "let me patchFile… now I'll
// update…" tool-planning monologue so it never leaks into chat — but we still let the
// opening reply and the final completion line through. The naive versions orphaned text
// PARTS at the stream boundaries and crashed the client with:
//   "Received text-delta for missing text part with ID 0"
//   "Received text-end for missing text part with ID 0"
//
// ROOT CAUSE: a text part is a triplet — text-start(id) → text-delta(id)* → text-end(id).
// Holding/clearing text after the first tool could pass a text-start downstream but then
// hold-or-drop its text-end (or vice-versa), leaving the client with an unmatched part.
//
// THE INVARIANT this filter GUARANTEES downstream:
//   1. Never emit a text-end for an id whose text-start was not emitted.
//   2. Never leave an emitted text-start unclosed.
// It does so at both straddle boundaries: (a) at the first tool it CLOSES any still-open
// passed-through part before the tool; (b) at flush it releases only well-framed groups,
// dropping orphan delta/end and appending a synthetic end for any unclosed start. The
// final completion line (a complete triplet held after the last tool) survives intact, so
// the edit reply is NOT muted.

// The AI SDK UI-message stream parts are loosely typed here (the SDK's union is internal);
// we only need `type` and `id`, so a minimal shape keeps this dependency-free + testable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StreamPart = any

const idOf = (part: StreamPart): string => String(part?.id ?? '0')
const isTextPart = (t: string) =>
  t === 'text-start' || t === 'text-delta' || t === 'text-end' || t === 'text'

export function makeNarrationSilenceFilter(): TransformStream<StreamPart, StreamPart> {
  let firstToolSeen = false
  const hold: StreamPart[] = []
  // ids of text-starts we've enqueued downstream (pre-first-tool) that are not yet closed
  const openIds = new Set<string>()

  return new TransformStream<StreamPart, StreamPart>({
    transform(part, controller) {
      const t: string = part?.type ?? ''
      if (isTextPart(t)) {
        if (!firstToolSeen) {
          // Opening reply — passes through, but track open parts so we can close them
          // cleanly the instant the first tool arrives (prevents the straddle orphan).
          if (t === 'text-start') openIds.add(idOf(part))
          else if (t === 'text-end') openIds.delete(idOf(part))
          controller.enqueue(part)
        } else {
          hold.push(part) // narration after a tool — held; cleared by next tool or flushed
        }
      } else if (t === 'tool-input-start' || t === 'tool-input-delta' || t === 'tool-input-available' || t === 'tool-call' || t === 'tool-result') {
        // FIRST-TOOL BOUNDARY: close any passed-through text part still open on the client
        // BEFORE we let the tool part through, so a later held/dropped text-end can never
        // orphan it. (After the first tool, all text is held, so openIds only matters here.)
        if (!firstToolSeen) {
          for (const id of openIds) controller.enqueue({ type: 'text-end', id })
          openIds.clear()
        }
        firstToolSeen = true
        hold.length = 0 // discard any held tool-planning narration — a new tool is running
        controller.enqueue(part)
      } else {
        controller.enqueue(part)
      }
    },
    flush(controller) {
      // FLUSH SANITIZE: release only well-framed groups from the final held batch.
      // Drop any delta/end whose start isn't earlier in THIS buffer; close any start
      // left open. This preserves the completion line (a full triplet) while making an
      // orphaned end/delta impossible.
      const startedHere = new Set<string>()
      for (const part of hold) {
        const t: string = part?.type ?? ''
        const id = idOf(part)
        if (t === 'text-start') {
          startedHere.add(id)
          controller.enqueue(part)
        } else if (t === 'text') {
          controller.enqueue(part) // self-contained block — no framing needed
        } else if (t === 'text-delta' || t === 'text-end') {
          if (startedHere.has(id)) {
            controller.enqueue(part)
            if (t === 'text-end') startedHere.delete(id)
          }
          // else: orphan (its start was pre-tool or cleared) — DROP it
        } else {
          controller.enqueue(part)
        }
      }
      for (const id of startedHere) controller.enqueue({ type: 'text-end', id })
    },
  })
}
