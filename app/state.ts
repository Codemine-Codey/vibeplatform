import type { Command, CommandLog } from '@/components/commands-logs/types'
import type { DataPart } from '@/ai/messages/data-parts'
import type { ChatStatus, DataUIPart } from 'ai'
import { useMonitorState } from '@/components/error-monitor/state'
import { useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { saveProject } from '@/lib/projects'

interface SandboxStore {
  pendingChatMessage: string | null
  setPendingChatMessage: (msg: string | null) => void
  addBrowserError: (msg: string) => void
  addGeneratedFiles: (files: string[]) => void
  addLog: (data: { sandboxId: string; cmdId: string; log: CommandLog }) => void
  addPaths: (paths: string[]) => void
  authEnabled?: boolean
  authWorkerUrl?: string
  chatStatus: ChatStatus
  clearGeneratedFiles: () => void
  commands: Command[]
  databaseId?: string
  databaseName?: string
  deployedUrl?: string
  deployError?: string
  deployProjectName?: string
  deployStatus?: 'idle' | 'building' | 'deploying' | 'done' | 'error'
  generatedFiles: Set<string>
  lastFilesUploadedAt?: number
  paths: string[]
  projectName?: string
  sandboxId?: string
  streamError: string | null
  setAuthState: (s: Partial<Pick<SandboxStore, 'authEnabled' | 'authWorkerUrl'>>) => void
  setChatStatus: (status: ChatStatus) => void
  setStreamError: (msg: string | null) => void
  setDatabaseState: (s: Partial<Pick<SandboxStore, 'databaseId' | 'databaseName'>>) => void
  setDeployState: (s: Partial<Pick<SandboxStore, 'deployedUrl' | 'deployStatus' | 'deployError' | 'deployProjectName'>>) => void
  setLastFilesUploadedAt: (t: number) => void
  setProjectName: (name: string) => void
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

// Exported so ErrorMonitor can use it outside React render cycle
export { getBackgroundCommandErrorLines }

export function useCommandErrorsLogs() {
  // Targeted selector — only re-renders when commands changes, not on every store update
  const commands = useSandboxStore((s) => s.commands)
  const errors = useMemo(
    () => getBackgroundCommandErrorLines(commands),
    [commands]
  )
  return { errors }
}

export const useSandboxStore = create<SandboxStore>()((set) => ({
  addBrowserError: (msg: string) =>
    set((state) => {
      const cmdId = 'cm-browser-console'
      const sandboxId = state.sandboxId ?? ''
      const log: CommandLog = { data: msg, stream: 'stderr', timestamp: Date.now() }
      const existing = state.commands.find((c) => c.cmdId === cmdId)
      if (existing) {
        return {
          commands: state.commands.map((c) =>
            c.cmdId === cmdId ? { ...c, logs: [...(c.logs ?? []), log] } : c
          ),
        }
      }
      return {
        commands: [
          ...state.commands,
          {
            startedAt: Date.now(),
            cmdId,
            sandboxId,
            command: 'browser',
            args: [],
            background: true,
            logs: [log],
          },
        ],
      }
    }),
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
  pendingChatMessage: null,
  setPendingChatMessage: (msg) => set(() => ({ pendingChatMessage: msg })),
  chatStatus: 'ready',
  clearGeneratedFiles: () => set(() => ({ generatedFiles: new Set<string>() })),
  commands: [],
  databaseId: undefined,
  databaseName: undefined,
  deployedUrl: undefined,
  deployError: undefined,
  deployProjectName: undefined,
  deployStatus: 'idle',
  generatedFiles: new Set<string>(),
  lastFilesUploadedAt: undefined,
  paths: [],
  streamError: null,
  setAuthState: (s) => set(() => ({ ...s })),
  setChatStatus: (status) =>
    set((state) =>
      state.chatStatus === status ? state : { chatStatus: status }
    ),
  setStreamError: (msg) => set(() => ({ streamError: msg })),
  setDatabaseState: (s) => set(() => ({ ...s })),
  setDeployState: (s) => set(() => ({ ...s })),
  setLastFilesUploadedAt: (t) => set(() => ({ lastFilesUploadedAt: t })),
  setProjectName: (name) => set(() => ({ projectName: name })),
  setSandboxId: (sandboxId) =>
    set(() => ({
      sandboxId,
      status: 'running',
      commands: [],
      paths: [],
      url: undefined,
      generatedFiles: new Set<string>(),
      deployedUrl: undefined,
      deployStatus: 'idle',
      deployError: undefined,
      deployProjectName: undefined,
      databaseId: undefined,
      databaseName: undefined,
      authEnabled: undefined,
      authWorkerUrl: undefined,
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
  // Individual stable action selectors — Zustand actions are created once and
  // never change, so these selectors NEVER trigger a re-render.
  // Previously `useSandboxStore()` (no selector) subscribed to the ENTIRE store,
  // causing ChatProvider (and the entire app) to re-render on every log line.
  const addPaths = useSandboxStore((s) => s.addPaths)
  const setSandboxId = useSandboxStore((s) => s.setSandboxId)
  const setUrl = useSandboxStore((s) => s.setUrl)
  const upsertCommand = useSandboxStore((s) => s.upsertCommand)
  const addGeneratedFiles = useSandboxStore((s) => s.addGeneratedFiles)
  const setLastFilesUploadedAt = useSandboxStore((s) => s.setLastFilesUploadedAt)
  const setDatabaseState = useSandboxStore((s) => s.setDatabaseState)
  // setCursor is an action — stable, never triggers re-render
  const setCursor = useMonitorState((s) => s.setCursor)

  return useCallback(
    (data: DataUIPart<DataPart>) => {
      switch (data.type) {
        case 'data-create-sandbox':
          if (data.data.sandboxId) setSandboxId(data.data.sandboxId)
          break
        case 'data-generating-files':
          if (data.data.status === 'uploaded') {
            // Read errors length via store snapshot — no subscription needed here.
            // Using getState() avoids creating a reactive dependency on commands.
            const commands = useSandboxStore.getState().commands
            setCursor(getBackgroundCommandErrorLines(commands).length)
            addPaths(data.data.paths)
            addGeneratedFiles(data.data.paths)
          }
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
            // Auto-save project to localStorage
            const { sandboxId, projectName } = useSandboxStore.getState()
            if (sandboxId) {
              saveProject({
                id: sandboxId,
                name: projectName ?? 'Untitled Project',
                skill: 'unknown',
                url: data.data.url,
                createdAt: Date.now(),
              })
            }
          }
          break
        case 'data-database-created':
          setDatabaseState({ databaseId: data.data.databaseId, databaseName: data.data.databaseName })
          break
        default:
          break
      }
    },
    [addGeneratedFiles, addPaths, setCursor, setSandboxId, setLastFilesUploadedAt, setUrl, upsertCommand, setDatabaseState]
  )
}
