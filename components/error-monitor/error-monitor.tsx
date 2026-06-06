'use client'

import { type Line } from './schemas'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { getSummary } from './get-summary'
import { getBackgroundCommandErrorLines, useSandboxStore } from '@/app/state'
import { useMonitorState } from './state'
import { useSettings } from '@/components/settings/use-settings'
import { useSharedChatContext } from '@/lib/chat-context'

interface Props {
  children: React.ReactNode
  debounceTimeMs?: number
}

export function ErrorMonitor({ children, debounceTimeMs = 10000 }: Props) {
  const [pending, startTransition] = useTransition()

  // Individual stable selectors — no full-store subscription
  const cursor = useMonitorState((s) => s.cursor)
  const scheduled = useMonitorState((s) => s.scheduled)
  const setCursor = useMonitorState((s) => s.setCursor)
  const setScheduled = useMonitorState((s) => s.setScheduled)

  // Error tick: increments ONLY when new error lines appear.
  // Replaces useCommandErrorsLogs() which re-rendered on every log line.
  // Zustand.subscribe() fires a callback without triggering React re-renders.
  const [errorTick, setErrorTick] = useState(0)
  const errorsRef = useRef<Line[]>([])

  const { fixErrors } = useSettings()
  const { chat } = useSharedChatContext()

  // Direct chat access — no useChat here. ErrorMonitor only needs sendMessage +
  // chatStatus. A second useChat subscriber on the shared Chat instance doubles the
  // async trailing-timer storm that causes "Maximum update depth exceeded".

  // Status-only subscription: re-renders only on status transitions (submitted/streaming/ready)
  const [chatStatus, setChatStatus] = useState<string>(() => chat.status)
  useEffect(() => {
    return (chat as any)['~registerStatusCallback'](() => {
      setChatStatus(chat.status)
    })
  }, [chat])

  // Message presence: re-renders only when message list crosses 0↔1 boundary
  // (needed to reset error tracking when conversation is cleared)
  const [hasMessages, setHasMessages] = useState(() => chat.messages.length > 0)
  useEffect(() => {
    return (chat as any)['~registerMessagesCallback'](() => {
      const next = chat.messages.length > 0
      setHasMessages((prev) => (prev === next ? prev : next))
    })
    // No throttle — synchronous, React 18 auto-batching handles burst safely
  }, [chat])

  const sendMessage = useCallback(
    (msg: Parameters<(typeof chat)['sendMessage']>[0]) => chat.sendMessage(msg),
    [chat]
  )

  const submitTimeout = useRef<NodeJS.Timeout | null>(null)
  const inspectedErrors = useRef<number>(0)
  const lastReportedErrors = useRef<string[]>([])
  const errorReportCount = useRef<Map<string, number>>(new Map())
  const lastErrorReportTime = useRef<number>(0)

  // Watch for new background stderr errors via Zustand subscribe (not a hook).
  // This fires on every store update but only schedules a React re-render when
  // the ERROR count increases — not on every addLog call.
  useEffect(() => {
    return useSandboxStore.subscribe((state) => {
      const errors = getBackgroundCommandErrorLines(state.commands)
      if (errors.length > errorsRef.current.length) {
        errorsRef.current = errors
        // Defer to macrotask so it never fires during a React render phase
        setTimeout(() => setErrorTick((t) => t + 1), 0)
      }
    })
  }, [])

  const clearSubmitTimeout = useCallback(() => {
    if (submitTimeout.current) {
      setScheduled(false)
      clearTimeout(submitTimeout.current)
      submitTimeout.current = null
    }
  }, [setScheduled])

  const status =
    chatStatus !== 'ready' || fixErrors === false
      ? 'disabled'
      : pending || scheduled
      ? 'pending'
      : 'ready'

  const getErrorKey = (error: Line) =>
    `${error.command}-${error.args.join(' ')}-${error.data.slice(0, 100)}`

  const handleErrors = (errors: Line[], prev: Line[]) => {
    const now = Date.now()
    if (now - lastErrorReportTime.current < 60000) return

    const errorKeys = errors.map(getErrorKey)
    const uniqueErrorKeys = [...new Set(errorKeys)]
    const newErrors = uniqueErrorKeys.filter(
      (key) => (errorReportCount.current.get(key) || 0) < 1
    )
    if (newErrors.length === 0) return

    startTransition(async () => {
      try {
        const summary = await getSummary(errors, prev)
        if (summary.shouldBeFixed) {
          newErrors.forEach((key) => errorReportCount.current.set(key, 1))
          lastReportedErrors.current = newErrors
          lastErrorReportTime.current = Date.now()
          sendMessage({
            role: 'user',
            parts: [{ type: 'data-report-errors', data: summary }],
          })
        }
      } catch (err) {
        console.error('Error analyzing build errors:', err)
      }
    })
  }

  useEffect(() => {
    if (!hasMessages) {
      errorReportCount.current.clear()
      lastReportedErrors.current = []
      lastErrorReportTime.current = 0
      errorsRef.current = []
    }
  }, [hasMessages])

  // errorTick replaces `errors` as the dependency — only fires when error count changes
  useEffect(() => {
    const errors = errorsRef.current
    if (status === 'ready' && inspectedErrors.current < errors.length) {
      const prev = errors.slice(0, cursor)
      const pending = errors.slice(cursor)
      inspectedErrors.current = errors.length
      setScheduled(true)
      clearSubmitTimeout()
      submitTimeout.current = setTimeout(() => {
        setScheduled(false)
        setCursor(errors.length)
        handleErrors(pending, prev)
      }, debounceTimeMs)
    } else if (status === 'disabled') {
      clearSubmitTimeout()
    }
    return () => clearSubmitTimeout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSubmitTimeout, cursor, errorTick, status])

  // Memoize context value so consumers don't re-render when ErrorMonitor
  // re-renders for unrelated reasons
  const contextValue = useMemo(
    () => ({ status } as { status: 'ready' | 'pending' | 'disabled' }),
    [status]
  )

  return (
    <Context.Provider value={contextValue}>{children}</Context.Provider>
  )
}

const Context = createContext<{
  status: 'ready' | 'pending' | 'disabled'
} | null>(null)

export function useErrorMonitor() {
  const context = useContext(Context)
  if (!context) {
    throw new Error('useErrorMonitor must be used within a ErrorMonitor')
  }
  return context
}
