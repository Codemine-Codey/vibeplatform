// Deterministic leak scrub for ALL user-visible AI text. A prompt rule is NOT a
// guarantee — the model slipped "sandbox" into narration during a real build. This is
// the mechanism that makes the "never name infra/model, never say sandbox" rule airtight.
//
// Applied to every text/narration part before it reaches the user, on BOTH the build
// path (makeSilenceFilter) and the edit path (chat route stream).

// Ordered replacements (specific → general). Case-insensitive, word-boundaried.
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bvercel\s+sandboxes?\b/gi, 'workspace'],
  [/\bsandboxes\b/gi, 'workspaces'],
  [/\bsandbox\b/gi, 'workspace'],
  // Model / provider / infrastructure names → neutral. Users must never see the stack.
  [/\b(deep\s?seek|anthropic|claude\s+sonnet(?:\s+\d[\d.]*)?|openai|chatgpt|gpt-?5[\d.]*|gemini|kimi\b|moonshot\w*|terra\b|luna\b)\b/gi, 'the AI'],
  [/\bvercel(?:\.run)?\b/gi, 'the platform'],
  [/\b(cloudflare|supabase|neon\s+(?:db|database|postgres)|unsplash|pexels|picsum)\b/gi, 'the platform'],
  // Technical leakage sometimes echoed in prose.
  [/\bp?npm\s+install\b/gi, 'installing packages'],
]

// Scrub a single string. Never throws; returns the cleaned text.
export function scrubLeaks(text: string): string {
  if (!text || typeof text !== 'string') return text
  let out = text
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep)
  return out
}

// Scrub a streamed UI-message part in place-ish: returns a new part with any user-visible
// text fields cleaned. Covers text deltas and data-narration (the two visible-text carriers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scrubPart(part: any): any {
  if (!part || typeof part !== 'object') return part
  const t: string = part.type ?? ''
  if (t === 'text' || t === 'text-delta') {
    const next = { ...part }
    if (typeof next.text === 'string') next.text = scrubLeaks(next.text)
    if (typeof next.delta === 'string') next.delta = scrubLeaks(next.delta)
    return next
  }
  if (t === 'data-narration' && part.data && typeof part.data.text === 'string') {
    return { ...part, data: { ...part.data, text: scrubLeaks(part.data.text) } }
  }
  return part
}

// A TransformStream that scrubs every part — pipe a UIMessageStream through it before it
// reaches the user (edit path: writer.merge(stream.pipeThrough(makeScrubStream()))).
export function makeScrubStream(): TransformStream {
  return new TransformStream({
    transform(part, controller) {
      controller.enqueue(scrubPart(part))
    },
  })
}
