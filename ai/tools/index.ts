import type { InferUITools, UIMessage, UIMessageStreamWriter } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { createSandbox } from './create-sandbox'
import { generateFiles } from './generate-files'
import { getSandboxURL } from './get-sandbox-url'
import { getUnsplash } from './get-unsplash'
import { getUnsplashBatch } from './get-unsplash-batch'
import { patchFile } from './patch-file'
import { planProject } from './plan-project'
import { readFile } from './read-file'
import { runCommand } from './run-command'

interface Params {
  modelId: string
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
  // Promise resolving to a sandbox ID started in parallel with expandPrompt.
  // Passed as a Promise so streamText starts immediately without blocking.
  sandboxPrewarmPromise?: Promise<string | null> | null
}

export function tools({ modelId, writer, sandboxPrewarmPromise }: Params) {
  return {
    createSandbox: createSandbox({ writer, sandboxPrewarmPromise }),
    generateFiles: generateFiles({ writer, modelId }),
    getSandboxURL: getSandboxURL({ writer }),
    runCommand: runCommand({ writer }),
    getUnsplash: getUnsplash(),
    getUnsplashBatch: getUnsplashBatch(),
    readFile: readFile(),
    patchFile: patchFile(),
    planProject: planProject(),
  }
}

export type ToolSet = InferUITools<ReturnType<typeof tools>>
