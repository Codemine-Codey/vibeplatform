'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  DatabaseIcon,
  CheckCircle2Icon,
  CopyIcon,
  RefreshCwIcon,
  PlayIcon,
  TableIcon,
  ServerIcon,
  AlertCircleIcon,
} from 'lucide-react'
import { useSandboxStore } from '@/app/state'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
}

interface TableInfo {
  name: string
  rowCount: number | null
}

interface QueryResult {
  columns: string[]
  rows: unknown[][]
}

interface NeonStatus {
  provisioned: boolean
  host: string | null
  databaseName: string | null
  neonProjectId: string | null
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ provisioned }: { provisioned: boolean }) {
  if (provisioned) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Connected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
      Not connected
    </span>
  )
}

// ── Inline skeleton ───────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-secondary', className)} />
}

// ── Data table ────────────────────────────────────────────────────────────────
function DataTable({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
        No results
      </div>
    )
  }
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-secondary/90 backdrop-blur-sm">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="border-b border-primary/10 px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-6 text-center text-muted-foreground"
              >
                No rows yet
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr
              key={i}
              className={cn(
                'border-b border-primary/5 transition-colors hover:bg-accent/30',
                i % 2 === 1 && 'bg-secondary/20'
              )}
            >
              {(row as unknown[]).map((cell, j) => {
                const display =
                  cell === null
                    ? null
                    : typeof cell === 'object'
                    ? JSON.stringify(cell)
                    : String(cell)
                const truncated = display !== null && display.length > 80 ? display.slice(0, 80) + '…' : display
                return (
                  <td
                    key={j}
                    className="max-w-[200px] px-3 py-1.5 font-mono"
                    title={display ?? ''}
                  >
                    {cell === null ? (
                      <span className="italic text-muted-foreground/50">null</span>
                    ) : (
                      truncated
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function NeonPanel({ className }: Props) {
  const projectId = useSandboxStore((s) => s.projectId)
  const sandboxId = useSandboxStore((s) => s.sandboxId)

  const [status, setStatus] = useState<NeonStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  const [provisioning, setProvisioning] = useState(false)
  const [provisionStep, setProvisionStep] = useState(0)
  const [provisionError, setProvisionError] = useState<string | null>(null)

  const [tables, setTables] = useState<TableInfo[]>([])
  const [tablesLoading, setTablesLoading] = useState(false)
  const [activeTable, setActiveTable] = useState<string | null>(null)

  const [tableResult, setTableResult] = useState<QueryResult | null>(null)
  const [tableLoading, setTableLoading] = useState(false)
  const [tableError, setTableError] = useState<string | null>(null)

  const [customSql, setCustomSql] = useState('')
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load status on mount ────────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    if (!projectId) return
    setStatusLoading(true)
    try {
      const res = await fetch('/api/cloud/neon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', projectId }),
      })
      const data = (await res.json()) as NeonStatus & { error?: string }
      if (!data.error) setStatus(data)
    } catch {
      // non-fatal
    } finally {
      setStatusLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // ── Load tables when provisioned ────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    if (!projectId) return
    setTablesLoading(true)
    try {
      const res = await fetch('/api/cloud/neon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tables', projectId }),
      })
      const data = (await res.json()) as { tables?: TableInfo[]; error?: string }
      if (data.tables) {
        setTables(data.tables)
        if (data.tables.length > 0 && !activeTable) {
          setActiveTable(data.tables[0].name)
        }
      }
    } catch {
      // non-fatal
    } finally {
      setTablesLoading(false)
    }
  }, [projectId, activeTable])

  useEffect(() => {
    if (status?.provisioned) loadTables()
  }, [status?.provisioned, loadTables])

  // ── Load table rows ─────────────────────────────────────────────────────────
  const loadTableRows = useCallback(
    async (tableName: string) => {
      if (!projectId) return
      setTableLoading(true)
      setTableError(null)
      setTableResult(null)
      try {
        const res = await fetch('/api/cloud/neon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'query',
            projectId,
            sql: `SELECT * FROM "${tableName}" LIMIT 50`,
          }),
        })
        const data = (await res.json()) as QueryResult & { error?: string }
        if (data.error) throw new Error(data.error)
        setTableResult({ columns: data.columns ?? [], rows: data.rows ?? [] })
      } catch (err) {
        setTableError(err instanceof Error ? err.message : 'Query failed')
      } finally {
        setTableLoading(false)
      }
    },
    [projectId]
  )

  useEffect(() => {
    if (activeTable) loadTableRows(activeTable)
  }, [activeTable, loadTableRows])

  // ── Provision ───────────────────────────────────────────────────────────────
  async function handleProvision() {
    if (!projectId) return
    setProvisioning(true)
    setProvisionStep(1)
    setProvisionError(null)
    try {
      await new Promise((r) => setTimeout(r, 400))
      setProvisionStep(2)
      const res = await fetch('/api/cloud/neon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'provision', projectId }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        host?: string
        databaseName?: string
        neonProjectId?: string
        error?: string
      }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Provisioning failed')
      setProvisionStep(3)
      await new Promise((r) => setTimeout(r, 600))
      setStatus({
        provisioned: true,
        host: data.host ?? null,
        databaseName: data.databaseName ?? null,
        neonProjectId: data.neonProjectId ?? null,
      })
      void loadTables()
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : 'Provisioning failed. Please try again.')
    } finally {
      setProvisioning(false)
      setProvisionStep(0)
    }
  }

  // ── Run custom query ────────────────────────────────────────────────────────
  async function handleRunQuery() {
    if (!projectId || !customSql.trim()) return
    if (!customSql.trim().toLowerCase().startsWith('select')) {
      setQueryError('Only SELECT statements are allowed in the query browser.')
      return
    }
    setQueryLoading(true)
    setQueryError(null)
    setQueryResult(null)
    try {
      const res = await fetch('/api/cloud/neon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'query', projectId, sql: customSql }),
      })
      const data = (await res.json()) as QueryResult & { error?: string }
      if (data.error) throw new Error(data.error)
      setQueryResult({ columns: data.columns ?? [], rows: data.rows ?? [] })
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query failed')
    } finally {
      setQueryLoading(false)
    }
  }

  // ── Copy masked URL ─────────────────────────────────────────────────────────
  async function handleCopyUrl() {
    // Copy the masked placeholder — the real URL never leaves the server
    try {
      await navigator.clipboard.writeText('(connection string is stored securely — available as DATABASE_URL in your app)')
      setCopied(true)
      if (copyTimeout.current) clearTimeout(copyTimeout.current)
      copyTimeout.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard not available
    }
  }

  // ── Not yet scoped to a project ─────────────────────────────────────────────
  if (!projectId || !sandboxId) {
    return (
      <div className={cn('flex flex-col items-center justify-center flex-1 gap-4 p-6 text-center', className)}>
        <DatabaseIcon className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Generate a project first to enable the database.</p>
      </div>
    )
  }

  // ── Loading status ──────────────────────────────────────────────────────────
  if (statusLoading) {
    return (
      <div className={cn('flex flex-col gap-4 p-4', className)}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-8 w-32" />
      </div>
    )
  }

  // ── State A — Not provisioned ───────────────────────────────────────────────
  if (!status?.provisioned && !provisioning) {
    return (
      <div className={cn('flex flex-col items-center justify-center flex-1 min-h-0 gap-6 p-6 text-center', className)}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-primary/15 bg-secondary/50">
            <DatabaseIcon className="h-7 w-7 text-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Database</h3>
            <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-muted-foreground">
              Store your app's data — users, posts, orders, anything. One click to set up,
              with a built-in viewer to browse your data.
            </p>
          </div>
        </div>

        {/* Feature list */}
        <ul className="space-y-1.5 text-left">
          {[
            'A real database for your app',
            '500 MB storage included',
            'Browse your data right here',
            'Connects to your app automatically',
          ].map((feat) => (
            <li key={feat} className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2Icon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              {feat}
            </li>
          ))}
        </ul>

        {provisionError && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" />
            {provisionError}
          </div>
        )}

        <button
          type="button"
          onClick={handleProvision}
          className="flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <DatabaseIcon className="h-4 w-4" />
          Connect Database
        </button>
      </div>
    )
  }

  // ── State B — Provisioning ──────────────────────────────────────────────────
  if (provisioning) {
    const steps = [
      'Creating database...',
      'Generating connection string...',
      'Injecting into your app...',
    ]
    return (
      <div className={cn('flex flex-col items-center justify-center flex-1 gap-5 p-6', className)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
        <div className="space-y-2 text-center">
          {steps.map((step, i) => {
            const done = provisionStep > i + 1
            const active = provisionStep === i + 1
            return (
              <p
                key={step}
                className={cn(
                  'flex items-center justify-center gap-2 text-xs transition-colors',
                  done && 'text-emerald-500',
                  active && 'animate-pulse font-medium text-foreground',
                  !done && !active && 'text-muted-foreground/40'
                )}
              >
                {done ? (
                  <CheckCircle2Icon className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" />
                )}
                {step}
              </p>
            )
          })}
        </div>
      </div>
    )
  }

  // ── State C — Provisioned ───────────────────────────────────────────────────
  return (
    <div className={cn('flex flex-col h-full min-h-0 overflow-hidden', className)}>
      {/* Connection info row */}
      <div className="shrink-0 border-b border-primary/10 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Host card */}
          <div className="rounded-lg border border-primary/12 bg-secondary/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ServerIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Host</span>
              </div>
              <StatusBadge provisioned={true} />
            </div>
            <p className="mt-1.5 truncate font-mono text-xs text-foreground">
              {status?.host ?? '—'}
            </p>
          </div>

          {/* Database name + copy */}
          <div className="rounded-lg border border-primary/12 bg-secondary/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DatabaseIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Database</span>
              </div>
              <button
                type="button"
                onClick={handleCopyUrl}
                title="Copy DATABASE_URL info"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <CopyIcon className="h-3 w-3" />
                {copied ? 'Copied' : 'Copy URL info'}
              </button>
            </div>
            <p className="mt-1.5 font-mono text-xs text-foreground">
              {status?.databaseName ?? 'neondb'}
              <span className="ml-2 text-muted-foreground/50">
                ••••••••••••
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* SQL Explorer */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Table sidebar */}
        <div className="w-36 shrink-0 border-r border-primary/10 overflow-auto p-2 space-y-0.5">
          <div className="px-2 pb-1 pt-0.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tables
              </p>
              <button
                type="button"
                onClick={loadTables}
                disabled={tablesLoading}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                title="Refresh tables"
              >
                <RefreshCwIcon className={cn('h-3 w-3', tablesLoading && 'animate-spin')} />
              </button>
            </div>
          </div>

          {tablesLoading && (
            <div className="space-y-1 px-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          )}

          {!tablesLoading && tables.length === 0 && (
            <p className="px-2 py-2 text-[10px] text-muted-foreground">
              No tables yet — ask the AI to create some.
            </p>
          )}

          {tables.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setActiveTable(t.name)}
              className={cn(
                'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors',
                activeTable === t.name
                  ? 'bg-foreground text-background font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <TableIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{t.name}</span>
            </button>
          ))}
        </div>

        {/* Right pane: table view + query browser */}
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
          {/* Table data */}
          {activeTable && (
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden border-b border-primary/10">
              <div className="flex shrink-0 items-center justify-between border-b border-primary/10 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <TableIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-mono font-medium">{activeTable}</span>
                  {tableResult && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                      {tableResult.rows.length} row{tableResult.rows.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => activeTable && loadTableRows(activeTable)}
                  disabled={tableLoading}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  title="Refresh"
                >
                  <RefreshCwIcon className={cn('h-3.5 w-3.5', tableLoading && 'animate-spin')} />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                {tableLoading && (
                  <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                    Loading...
                  </div>
                )}
                {tableError && (
                  <div className="p-4 text-xs text-destructive">{tableError}</div>
                )}
                {!tableLoading && tableResult && (
                  <DataTable columns={tableResult.columns} rows={tableResult.rows} />
                )}
              </div>
            </div>
          )}

          {!activeTable && tables.length === 0 && !tablesLoading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <TableIcon className="h-6 w-6 opacity-30" />
              <p>No tables yet — ask the AI to create some.</p>
            </div>
          )}

          {/* Custom query section */}
          <div className="shrink-0 border-t border-primary/10 p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Query Browser
            </p>
            <textarea
              value={customSql}
              onChange={(e) => setCustomSql(e.target.value)}
              placeholder="SELECT * FROM your_table WHERE ..."
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunQuery}
                disabled={queryLoading || !customSql.trim()}
                className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {queryLoading ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
                ) : (
                  <PlayIcon className="h-3.5 w-3.5" />
                )}
                Run Query
              </button>
              <p className="text-[10px] text-muted-foreground">SELECT only · max 100 rows</p>
            </div>
            {queryError && (
              <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" />
                {queryError}
              </div>
            )}
            {queryResult && (
              <div className="rounded-md border border-primary/12 overflow-auto max-h-48">
                <DataTable columns={queryResult.columns} rows={queryResult.rows} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
