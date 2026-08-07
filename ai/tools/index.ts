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
import { patchFileLines } from './patch-file-lines'
import { planProject } from './plan-project'
import { loadSkill } from './load-skill'
import { readFile } from './read-file'
import { readFiles } from './read-files'
import { restoreCheckpoint } from './checkpoint'
import { runCommand } from './run-command'
import { visualCheck } from './visual-check'
import { installPackage } from './install-package'
import { deleteFile } from './delete-file'
import { renameFile } from './rename-file'
import { webSearch } from './web-search'
import { fetchWebsite } from './fetch-website'
import { readConsoleLogs } from './read-console-logs'
import { getProjectMemory, updateProjectMemory } from './project-memory'

interface Params {
  modelId: string
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
  // Edit mode: generateFiles must NOT overwrite existing files (only create new ones) —
  // changes to existing files go through patchFile. Prevents an "add a page" request from
  // clobbering the landing page's theme.
  isEdit?: boolean
}

export function tools({ modelId, writer, isEdit }: Params) {
  return {
    createSandbox: createSandbox({ writer }),
    createDatabase: createDatabase({ writer }),
    generateFiles: generateFiles({ writer, modelId, editMode: isEdit }),
    getSandboxURL: getSandboxURL({ writer }),
    runCommand: runCommand({ writer }),
    getUnsplash: getUnsplash(),
    getUnsplashBatch: getUnsplashBatch(),
    readFile: readFile(),
    readFiles: readFiles(),
    grepCode: grepCode(),
    loadSkill: loadSkill(),
    patchFile: patchFile(),
    patchFileLines: patchFileLines(),
    planProject: planProject(),
    restoreCheckpoint: restoreCheckpoint({ writer }),
    visualCheck: visualCheck(),
    // New tools — Batch 2 (2026-08-07)
    installPackage: installPackage(),
    deleteFile: deleteFile(),
    renameFile: renameFile(),
    webSearch: webSearch(),
    fetchWebsite: fetchWebsite(),
    readConsoleLogs: readConsoleLogs(),
    getProjectMemory: getProjectMemory(),
    updateProjectMemory: updateProjectMemory(),
  }
}

export type ToolSet = InferUITools<ReturnType<typeof tools>>
