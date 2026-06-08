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
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export function tools({ writer }: Params) {
  return {
    createSandbox: createSandbox({ writer }),
    generateFiles: generateFiles({ writer }),
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
