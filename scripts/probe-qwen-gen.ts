// Cheap probe (~$0.01): does qwen/qwen3.8-max emit the pipeline's <<<CMFILE>>> delimiter format?
// The whole file-generation pipeline parses files out of that delimiter — if Qwen doesn't produce
// it, NO files parse → broken/empty build → the 20-min reveal-gate stall we saw. Replicates the
// real call (gateway getModelOptions → reasoning off → provider pinning).
// Run: npx esbuild scripts/probe-qwen-gen.ts --bundle --platform=node --format=esm --alias:@=. --packages=external --outfile=scripts/.pqg.mjs && node scripts/.pqg.mjs
import { streamText } from 'ai'
import { getModelOptions } from '../ai/gateway'

const MODEL = process.argv[2] || 'qwen/qwen3.8-max'
const nonce = 'abc123nonce'
const instruction =
  `Build the COMPLETE project now — generate ALL of these files in ONE response, each as RAW TEXT ` +
  `in the delimited format below (NO JSON, NO markdown fences, NO commentary between files):\n\n` +
  `<<<CMFILE:${nonce}:relative/path.tsx>>>\n<the complete file content, literally>\n<<<CMEND:${nonce}>>>\n` +
  `(repeat one fenced block per file, back to back)\n\n` +
  `Files to generate (generate EVERY one, complete, in this order):\n- src/data/site.ts\n- src/components/Hero.tsx\n\n` +
  `src/data/site.ts exports a const SITE = { name: 'Test' }. src/components/Hero.tsx is a default-export React component rendering an <h1>{SITE.name}</h1>.`

const t0 = Date.now()
let buffer = ''
try {
  const result = streamText({
    ...getModelOptions(MODEL),
    maxOutputTokens: 4000,
    system: 'You are a code generator. Output ONLY the requested files in the exact delimiter format. No prose.',
    messages: [{ role: 'user', content: instruction }],
  })
  for await (const d of result.textStream) buffer += d
} catch (e) {
  console.log('STREAM ERROR:', (e as Error).message)
}
const ms = Date.now() - t0
const blockRe = /<<<CMFILE:[^:>\n]+:(.+?)>>>\r?\n([\s\S]*?)\r?\n?<<<CMEND[^>\n]*>>>/g
const matches = [...buffer.matchAll(blockRe)]
console.log(`\n=== ${MODEL} — ${ms}ms, ${buffer.length} chars ===`)
console.log(`CMFILE blocks parsed: ${matches.length}  (expected 2)`)
matches.forEach(m => console.log('  ✅ parsed file:', m[1].trim()))
console.log(`has <<<CMFILE : ${buffer.includes('<<<CMFILE')}  |  has <<<CMEND : ${buffer.includes('<<<CMEND')}`)
console.log('\n--- first 500 chars of raw output ---')
console.log(buffer.slice(0, 500))
console.log('\n' + (matches.length >= 1 ? '✅ Qwen FOLLOWS the delimiter format' : '❌ Qwen does NOT emit parseable delimiters — THIS is why builds stall'))
