// Offline invariant test for lib/silence-filter.ts — NO network, NO cost.
// Runs the real filter over the straddle sequences that produced the client crashes
// ("text-end/text-delta for missing text part ID 0") plus the happy paths, and asserts
// the framing invariant on the OUTPUT:
//   - every text-end matches a currently-open text-start (same id)
//   - no id is opened twice without closing
//   - no text-start is left open at end of stream
// Run: node --experimental-strip-types scripts/test-silence-filter.ts
import { makeNarrationSilenceFilter } from '../lib/silence-filter.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Part = any

async function run(parts: Part[]): Promise<Part[]> {
  const filter = makeNarrationSilenceFilter()
  const writer = filter.writable.getWriter()
  const reader = filter.readable.getReader()
  const out: Part[] = []
  const readAll = (async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      out.push(value)
    }
  })()
  for (const p of parts) await writer.write(p)
  await writer.close()
  await readAll
  return out
}

// Returns an error string if the output violates the client's framing invariant, else ''.
function checkInvariant(out: Part[]): string {
  const open = new Set<string>()
  for (const p of out) {
    const t = p?.type ?? ''
    const id = String(p?.id ?? '0')
    if (t === 'text-start') {
      if (open.has(id)) return `text-start for id ${id} while it is ALREADY open (double-open)`
      open.add(id)
    } else if (t === 'text-end') {
      if (!open.has(id)) return `text-end for id ${id} with NO open text-start (the crash)`
      open.delete(id)
    } else if (t === 'text-delta') {
      if (!open.has(id)) return `text-delta for id ${id} with NO open text-start`
    }
  }
  if (open.size > 0) return `stream ended with unclosed text-start id(s): ${[...open].join(',')}`
  return ''
}

const S = (id = '0') => ({ type: 'text-start', id })
const D = (id = '0', delta = 'x') => ({ type: 'text-delta', id, delta })
const E = (id = '0') => ({ type: 'text-end', id })
const TOOL = () => ({ type: 'tool-input-delta', toolCallId: 't1', inputTextDelta: '{' })
const TRES = () => ({ type: 'tool-result', toolCallId: 't1' })

const cases: Array<{ name: string; parts: Part[] }> = [
  { name: 'happy path — no tools (pure Q&A passes through)', parts: [S(), D(), D(), E()] },
  { name: 'STRADDLE — start+delta pre-tool, end arrives after tool (the exact ID-0 crash)',
    parts: [S('0'), D('0'), TOOL(), E('0'), TRES()] },
  { name: 'opening line closed, tool, then completion line after last tool',
    parts: [S('0'), D('0'), E('0'), TOOL(), TRES(), S('0'), D('0'), E('0')] },
  { name: 'orphan text-end alone in flush buffer (id reused post-tool)',
    parts: [S('0'), D('0'), E('0'), TOOL(), E('0')] },
  { name: 'unclosed start in flush buffer — filter must synthesize the end',
    parts: [S('0'), D('0'), E('0'), TOOL(), TRES(), S('7'), D('7')] },
  { name: 'narration between two tools is discarded, final line survives',
    parts: [S('0'), E('0'), TOOL(), S('0'), D('0'), E('0'), TRES(), S('0'), D('0'), E('0')] },
  { name: 'multiple pre-tool open parts closed at first tool',
    parts: [S('0'), D('0'), S('1'), D('1'), TOOL()] },
]

let failed = 0
for (const c of cases) {
  const out = await run(c.parts)
  const err = checkInvariant(out)
  if (err) {
    failed++
    console.log(`❌ ${c.name}\n     -> ${err}`)
    console.log(`     output: ${out.map((p) => `${p.type}#${p.id ?? '-'}`).join(' ')}`)
  } else {
    console.log(`✅ ${c.name}`)
  }
}
console.log(`\n${failed === 0 ? 'ALL PASS ✅' : `${failed} FAILED ❌`}`)
process.exit(failed === 0 ? 0 : 1)
