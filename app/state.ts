import type { Command, CommandLog } from '@/components/commands-logs/types'
import type { DataPart } from '@/ai/messages/data-parts'
import type { ChatStatus, DataUIPart } from 'ai'
import { useMonitorState } from '@/components/error-monitor/state'
import { useMemo } from 'react'
import { create } from 'zustand'

interface SandboxStore {
  addGeneratedFiles: (files: string[]) => void
  addLog: (data: { sandboxId: string; cmdId: string; log: CommandLog }) => void
  addPaths: (paths: string[]) => void
  chatStatus: ChatStatus
  clearGeneratedFiles: () => void
  commands: Command[]
  generatedFiles: Set<string>
  lastFilesUploadedAt?: number
  paths: string[]
  sandboxId?: string
  setChatStatus: (status: ChatStatus) => void
  setLastFilesUploadedAt: (t: number) => void
  setSandboxId: (id: string) => void
  setStatus: (status: 'running' | 'stopped') => void
  setUrl: (url: string, uuid: string) => void
  status?: 'running' | 'stopped'
  upsertCommand: (command: Omit<Command, 'startedAt'>) => void
  url?: string
  urlUUID?: string
}

function getBackgroundCommandErrorLines(commands: Command[]) {
  return commands
    .flatMap(({ command, args, background, logs = [] }) =>
      logs.map((log) => ({ command, args, background, ...log }))
    )
    .sort((logA, logB) => logA.timestamp - logB.timestamp)
    .filter((log) => log.stream === 'stderr' && log.background)
}

export function useCommandErrorsLogs() {
  const { commands } = useSandboxStore()
  const errors = useMemo(
    () => getBackgroundCommandErrorLines(commands),
    [commands]
  )
  return { errors }
}

export const useSandboxStore = create<SandboxStore>()((set) => ({
  addGeneratedFiles: (files) =>
    set((state) => ({
      generatedFiles: new Set([...state.generatedFiles, ...files]),
    })),
  addLog: (data) => {
    set((state) => {
      const idx = state.commands.findIndex((c) => c.cmdId === data.cmdId)
      if (idx === -1) {
        // Log arrived before command registration — create a placeholder so no
        // early log lines are silently dropped.
        return {
          commands: [
            ...state.commands,
            {
              startedAt: Date.now(),
              logs: [data.log],
              sandboxId: data.sandboxId,
              cmdId: data.cmdId,
              command: '',
              args: [],
            },
          ],
        }
      }
      const updatedCmds = [...state.commands]
      updatedCmds[idx] = {
        ...updatedCmds[idx],
        logs: [...(updatedCmds[idx].logs ?? []), data.log],
      }
      return { commands: updatedCmds }
    })
  },
  addPaths: (paths) =>
    set((state) => ({ paths: [...new Set([...state.paths, ...paths])] })),
  chatStatus: 'ready',
  clearGeneratedFiles: () => set(() => ({ generatedFiles: new Set<string>() })),
  commands: [],
  generatedFiles: new Set<string>(),
  lastFilesUploadedAt: undefined,
  paths: [],
  setChatStatus: (status) =>
    set((state) =>
      state.chatStatus === status ? state : { chatStatus: status }
    ),
  setLastFilesUploadedAt: (t) => set(() => ({ lastFilesUploadedAt: t })),
  setSandboxId: (sandboxId) =>
    set(() => ({
      sandboxId,
      status: 'running',
      commands: [],
      paths: [],
      url: undefined,
      generatedFiles: new Set<string>(),
    })),
  setStatus: (status) => set(() => ({ status })),
  setUrl: (url, urlUUID) => set(() => ({ url, urlUUID })),
  upsertCommand: (cmd) => {
    set((state) => {
      const existingIdx = state.commands.findIndex((c) => c.cmdId === cmd.cmdId)
      const idx = existingIdx !== -1 ? existingIdx : state.commands.length
      const prev = state.commands[idx] ?? { startedAt: Date.now(), logs: [] }
      const cmds = [...state.commands]
      cmds[idx] = { ...prev, ...cmd }
      return { commands: cmds }
    })
  },
}))

interface FileExplorerStore {
  paths: string[]
  addPath: (path: string) => void
}

export const useFileExplorerStore = create<FileExplorerStore>()((set) => ({
  paths: [],
  addPath: (path) => {
    set((state) => {
      if (!state.paths.includes(path)) {
        return { paths: [...state.paths, path] }
      }
      return state
    })
  },
}))

export function useDataStateMapper() {
  const { addPaths, setSandboxId, setUrl, upsertCommand, addGeneratedFiles, setLastFilesUploadedAt } =
    useSandboxStore()
  const { errors } = useCommandErrorsLogs()
  const { setCursor } = useMonitorState()

  return (data: DataUIPart<DataPart>) => {
    switch (data.type) {
      case 'data-create-sandbox':
        if (data.data.sandboxId) {
          setSandboxId(data.data.sandboxId)
        }
        break
      case 'data-generating-files':
        if (data.data.status === 'uploaded') {
          setCursor(errors.length)
          addPaths(data.data.paths)
          addGeneratedFiles(data.data.paths)
        }
        // When all files are done uploading, schedule a preview refresh.
        // Delay gives the sandbox dev server time to detect changes and restart.
        if (data.data.status === 'done') {
          setLastFilesUploadedAt(Date.now())
        }
        break
      case 'data-run-command':
        if (
          data.data.commandId &&
          (data.data.status === 'executing' || data.data.status === 'running')
        ) {
          upsertCommand({
            background: data.data.status === 'running',
            sandboxId: data.data.sandboxId,
            cmdId: data.data.commandId,
            command: data.data.command,
            args: data.data.args,
          })
        }
        break
      case 'data-get-sandbox-url':
        if (data.data.url) {
          setUrl(data.data.url, crypto.randomUUID())
        }
        break
      default:
        break
    }
  }
}
