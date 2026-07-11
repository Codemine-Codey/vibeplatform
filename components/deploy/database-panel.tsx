'use client'

import { useEffect, useState, useCallback } from 'react'
import { DatabaseIcon, RefreshCwIcon, SparklesIcon, TableIcon } from 'lucide-react'
import { useSandboxStore } from '@/app/state'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
}

export function DatabasePanel({ className }: Props) {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const databaseId = useSandboxStore((s) => s.databaseId)
  const databaseName = useSandboxStore((s) => s.databaseName)
  const deployProjectName = useSandboxStore((s) => s.deployProjectName)
  const setDatabaseState = useSandboxStore((s) => s.setDatabaseState)
  const setPendingChatMessage = useSandboxStore((s) => s.setPendingChatMessage)
  const chatStatus = useSandboxStore((s) => s.chatStatus)
  const aiWorking = chatStatus === 'streaming' || chatStatus === 'submitted'

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | undefined>()
  const [queryResult, setQueryResult] = useState<{ columns: string[]; rows: unknown[][] } | null>(null)
  const [queryError, setQueryError] = useState<string | undefined>()
  const [queryRunning, setQueryRunning] = useState(false)
  const [tables, setTables] = useState<string[]>([])
  const [activeTable, setActiveTable] = useState<string | null>(null)

  const runQuery = useCallback(async (dbId: string, table: string) => {
    setQueryRunning(true)
    setQueryError(undefined)
    setQueryResult(null)
    try {
      const res = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'query', databaseId: dbId, sql: `SELECT * FROM ${table} LIMIT 100` }),
      })
      const data = await res.json() as { columns?: string[]; rows?: unknown[][]; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Query failed')
      setQueryResult({ columns: data.columns ?? [], rows: data.rows ?? [] })
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query failed')
    } finally {
      setQueryRunning(false)
    }
  }, [])

  const loadTable = useCallback((dbId: string, table: string) => {
    setActiveTable(table)
    runQuery(dbId, table)
  }, [runQuery])

  const fetchTables = useCallback(async (dbId: string) => {
    try {
      const res = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tables', databaseId: dbId }),
      })
      const data = await res.json() as { tables?: string[]; error?: string }
      if (data.tables && data.tables.length > 0) {
        setTables(data.tables)
        const first = data.tables[0]
        setActiveTable(first)
        await runQuery(dbId, first)
      }
    } catch {
      // non-fatal
    }
  }, [runQuery])

  useEffect(() => {
    if (!databaseId) return
    fetchTables(databaseId)
  }, [databaseId, fetchTables])

  // Auto-refresh table data after AI finishes working
  const prevAiWorking = useSandboxStore((s) => s.chatStatus)
  useEffect(() => {
    if (prevAiWorking === 'ready' && databaseId && activeTable) {
      runQuery(databaseId, activeTable)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevAiWorking])

  function handleAddDatabase() {
    setPendingChatMessage(
      "I'd like to add a database to my project. Can you help me set it up?"
    )
  }

  async function handleCreate(name: string) {
    setCreating(true)
    setCreateError(undefined)
    try {
      const res = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', databaseName: name, projectName: deployProjectName, sandboxId }),
      })
      const data = await res.json() as { databaseId?: string; databaseName?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to create database')
      setDatabaseState({ databaseId: data.databaseId, databaseName: data.databaseName })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create database')
    } finally {
      setCreating(false)
    }
  }

  void handleCreate

  return (
    <div className={cn('flex flex-col h-full bg-background border border-primary/18 rounded-sm overflow-hidden', className)}>
      {/* No database yet */}
      {!databaseId && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 p-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <DatabaseIcon className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium">No database yet</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
              Add a real database to store your app's data — users, posts, orders, anything.
            </p>
          </div>
          {createError && (
            <p className="text-xs text-destructive">{createError}</p>
          )}
          <button
            type="button"
            onClick={handleAddDatabase}
            disabled={!sandboxId || aiWorking}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <SparklesIcon className="w-4 h-4" />
            Add Database
          </button>
          {!sandboxId && (
            <p className="text-xs text-muted-foreground">Generate a project first</p>
          )}
        </div>
      )}

      {/* Database ready */}
      {databaseId && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10 shrink-0">
            <DatabaseIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-mono text-foreground">{databaseName}</span>
            <button
              type="button"
              onClick={() => databaseId && activeTable && runQuery(databaseId, activeTable)}
              disabled={queryRunning}
              className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCwIcon className={cn('w-3.5 h-3.5', queryRunning && 'animate-spin')} />
            </button>
          </div>

          {/* Table tabs */}
          {tables.length > 0 && (
            <div className="flex gap-1 flex-wrap px-3 py-2 border-b border-primary/10 shrink-0">
              {tables.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => databaseId && loadTable(databaseId, t)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md transition-colors',
                    activeTable === t
                      ? 'bg-foreground text-background'
                      : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <TableIcon className="w-3 h-3" />
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Data table */}
          <div className="flex-1 overflow-auto">
            {queryError && (
              <div className="p-4 text-xs text-destructive">{queryError}</div>
            )}
            {queryRunning && !queryResult && (
              <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
                <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin mr-2" />
                Loading...
              </div>
            )}
            {queryResult && queryResult.columns.length > 0 && (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary/90 backdrop-blur-sm">
                  <tr>
                    {queryResult.columns.map((col) => (
                      <th key={col} className="text-left px-3 py-2 font-medium text-muted-foreground border-b border-primary/10 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResult.rows.length === 0 && (
                    <tr>
                      <td colSpan={queryResult.columns.length} className="px-3 py-6 text-center text-muted-foreground">
                        No rows yet
                      </td>
                    </tr>
                  )}
                  {queryResult.rows.map((row, i) => (
                    <tr key={i} className="border-b border-primary/5 hover:bg-accent/30 transition-colors">
                      {(row as unknown[]).map((cell, j) => (
                        <td key={j} className="px-3 py-1.5 font-mono whitespace-nowrap max-w-[200px] truncate">
                          {cell === null
                            ? <span className="text-muted-foreground/50 italic">null</span>
                            : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {queryResult && queryResult.columns.length === 0 && !queryError && (
              <div className="p-4 text-xs text-muted-foreground text-center">No tables found</div>
            )}
            {!queryResult && !queryRunning && tables.length === 0 && databaseId && (
              <div className="flex flex-col items-center justify-center h-24 gap-2 text-xs text-muted-foreground">
                <TableIcon className="w-5 h-5 opacity-40" />
                <p>No tables yet — ask the AI to create them</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
