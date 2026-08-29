// Free ALS probe — reproduces makeStepWriter's enterWith + AI-SDK stream-transform
// pattern to prove whether cost accounting reaches the tokenBox. No network, no cost.
import { AsyncLocalStorage } from 'node:async_hooks'

const als = new AsyncLocalStorage()

// Mimic the metrics middleware: a TransformStream whose transform reads getStore()
// (exactly like addCost/addTokens do) and mutates the box on the 'finish' chunk.
function instrument(source) {
  return source.pipeThrough(
    new TransformStream({
      transform(part, controller) {
        if (part.type === 'finish') {
          const box = als.getStore()
          if (box) box.costUsd += 0.42 // simulate addCost
          else console.log('    [transform] getStore() === undefined (cost LOST)')
        }
        controller.enqueue(part)
      },
    })
  )
}

function makeSource() {
  return new ReadableStream({
    start(c) {
      c.enqueue({ type: 'text-delta', delta: 'hi' })
      c.enqueue({ type: 'finish', usage: { inputTokens: 100, outputTokens: 200 } })
      c.close()
    },
  })
}

async function drain(stream) {
  const reader = stream.getReader()
  while (true) { const { done } = await reader.read(); if (done) break }
}

// Pattern A — enterWith (what makeStepWriter does today)
async function withEnterWith() {
  const box = { costUsd: 0 }
  als.enterWith(box)
  const stream = instrument(makeSource())   // created in enterWith context
  await drain(stream)
  return box.costUsd
}

// Pattern B — run() wrapping create + consume (what the chat route does)
async function withRun() {
  const box = { costUsd: 0 }
  await als.run(box, async () => {
    const stream = instrument(makeSource())
    await drain(stream)
  })
  return box.costUsd
}

const a = await withEnterWith()
const b = await withRun()
console.log(`\n  enterWith  → box.costUsd = ${a}  ${a === 0 ? '❌ LOST (kill cap would be a no-op)' : '✅ captured'}`)
console.log(`  run()      → box.costUsd = ${b}  ${b === 0 ? '❌ LOST' : '✅ captured'}\n`)
