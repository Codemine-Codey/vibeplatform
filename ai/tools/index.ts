import type { InferUITools, UIMessage, UIMessageStreamWriter } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { createDatabase } from './create-database'
import { createSandbox } from './create-sandbox'
import { generateFiles } from './generate-files'
import { getSandboxURL } from './get-sandbox-url'
import { grepCode } from './grep-code'
import { getUnsplash } from './get-unsplash'
import { getUnsplashBatch } from './get-unsplash-batch'
import { patchFile } from './patch-file'
import { planProject } from './plan-project'
import { readFile } from './read-file'
import { readFiles } from './read-files'
import { restoreCheckpoint } from './checkpoint'
import { runCommand } from './run-command'
import { visualCheck } from './visual-check'

interface Params {
  modelId: string
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export function tools({ modelId, writer }: Params) {
  return {
    createSandbox: createSandbox({ writer }),
    createDatabase: createDatabase({ writer }),
    generateFiles: generateFiles({ writer, modelId }),
    getSandboxURL: getSandboxURL({ writer }),
    runCommand: runCommand({ writer }),
    getUnsplash: getUnsplash(),
    getUnsplashBatch: getUnsplashBatch(),
    readFile: readFile(),
    readFiles: readFiles(),
    grepCode: grepCode(),
    patchFile: patchFile(),
    planProject: planProject(),
    restoreCheckpoint: restoreCheckpoint({ writer }),
    visualCheck: visualCheck(),
  }
}

export type ToolSet = InferUITools<ReturnType<typeof tools>>
