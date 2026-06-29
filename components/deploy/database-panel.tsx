'use client'

import { useEffect, useState } from 'react'
import { DatabaseIcon, PlayIcon, SparklesIcon, TableIcon } from 'lucide-react'
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
  const [sql, setSql] = useState('')
  const [queryResult, setQueryResult] = useState<{ columns: string[]; rows: unknown[][] } | null>(null)
  const [queryError, setQueryError] = useState<string | undefined>()
  const [queryRunning, setQueryRunning] = useState(false)
  const [tables, setTables] = useState<string[]>([])

  // Fetch tables when database becomes available
  useEffect(() => {
    if (!databaseId) return
    fetchTables()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId])

  async function fetchTables() {
    if (!databaseId) return
    try {
      const res = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tables', databaseId }),
      })
      const data = await res.json() as { tables?: string[]; error?: string }
      if (data.tables) setTables(data.tables)
    } catch {
      // non-fatal
    }
  }

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

  async function handleQuery() {
    if (!databaseId || !sql.trim()) return
    setQueryRunning(true)
    setQueryError(undefined)
    setQueryResult(null)
    try {
      const res = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'query', databaseId, sql: sql.trim() }),
      })
      const data = await res.json() as { columns?: string[]; rows?: unknown[][]; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Query failed')
      setQueryResult({ columns: data.columns ?? [], rows: data.rows ?? [] })
      // Refresh tables after any query (might be DDL)
      await fetchTables()
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query failed')
    } finally {
      setQueryRunning(false)
    }
  }

  return (
    <div className={cn('flex flex-col h-full bg-background border border-primary/18 rounded-sm overflow-hidden', className)}>
      {/* No database yet */}
      {!databaseId && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 p-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <DatabaseIcon className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium">No database yet</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
              A real backend database for your project — store users, posts, orders, or anything you need. The AI will set it up and connect it automatically.
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
            {tables.length > 0 && (
              <div className="flex items-center gap-1 ml-auto text-xs text-muted-foreground">
                <TableIcon className="w-3 h-3" />
                {tables.length} table{tables.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Tables list */}
          {tables.length > 0 && (
            <div className="flex gap-1.5 flex-wrap px-3 py-2 border-b border-primary/10 shrink-0">
              {tables.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSql(`SELECT * FROM ${t} LIMIT 50`)}
                  className="text-xs font-mono px-2 py-0.5 rounded bg-secondary hover:bg-accent transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* SQL input */}
          <div className="flex flex-col gap-2 px-3 py-2 border-b border-primary/10 shrink-0">
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder="SELECT * FROM ..."
              rows={3}
              className="w-full text-xs font-mono bg-secondary rounded-sm px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  handleQuery()
                }
              }}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleQuery}
                disabled={queryRunning || !sql.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {queryRunning ? (
                  <>
                    <div className="w-3 h-3 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <PlayIcon className="w-3 h-3" />
                    Execute
                  </>
                )}
              </button>
              <span className="text-xs text-muted-foreground opacity-60">Refresh to view latest entries</span>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {queryError && (
              <div className="p-3 text-xs text-destructive font-mono">{queryError}</div>
            )}
            {queryResult && queryResult.columns.length > 0 && (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary">
                  <tr>
                    {queryResult.columns.map((col) => (
                      <th key={col} className="text-left px-3 py-1.5 font-medium text-muted-foreground border-b border-primary/10">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResult.rows.map((row, i) => (
                    <tr key={i} className="border-b border-primary/5 hover:bg-accent/30">
                      {(row as unknown[]).map((cell, j) => (
                        <td key={j} className="px-3 py-1.5 font-mono">
                          {cell === null ? <span className="text-muted-foreground italic">null</span> : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {queryResult.rows.length === 0 && (
                    <tr>
                      <td colSpan={queryResult.columns.length} className="px-3 py-4 text-center text-muted-foreground">
                        No rows returned
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {queryResult && queryResult.columns.length === 0 && !queryError && (
              <div className="p-3 text-xs text-muted-foreground">Query executed successfully (no results)</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
