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

export function ErrorMonitor({ children, debounceTimeMs = 3000 }: Props) {
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

  // ── Dedicated browser runtime-error path ────────────────────────────────────
  // A blank preview is either a thrown runtime error or a silent empty #root —
  // both arrive here as 'cm-browser-console' logs (see scaffold error bridge).
  // These are ALWAYS real, so they bypass getSummary's judgment and the 20s
  // stderr debounce: we send a focused fix request directly so the preview
  // self-heals fast. Dedup + 15s cooldown prevent fix loops.
  const browserSeen = useRef<Set<string>>(new Set())
  const lastBrowserFix = useRef<number>(0)
  // Track when the preview URL first arrived so we wait for the page to stabilize
  // before firing any error reports (avoids false positives on cold-load)
  const previewFirstSeenAt = useRef<number>(0)
  // HARD session cap — 1 silent fix attempt total. If it doesn't resolve after one
  // pass, leave the preview as-is rather than looping. Lovable-style: one silent
  // repair, then done. More loops create worse UX than a minor visual glitch.
  const sessionFixCount = useRef<number>(0)
  const MAX_SESSION_FIXES = 1
  useEffect(() => {
    return useSandboxStore.subscribe((state) => {
      if (fixErrors === false) return
      if (chat.status !== 'ready') return // never interrupt an in-flight turn
      const cmd = state.commands.find((c) => c.cmdId === 'cm-browser-console')
      const latest = cmd?.logs?.[cmd.logs.length - 1]
      if (!latest) return
      const key = latest.data.slice(0, 160)
      if (browserSeen.current.has(key)) return
      if (sessionFixCount.current >= MAX_SESSION_FIXES) return // hard cap — stop after 1 fix
      const now = Date.now()
      // Track when we first see the preview URL so we can apply a stabilization delay.
      // The sandbox URL command signals the preview is live.
      const urlCmd = state.commands.find((c) => c.cmdId === 'srv-url' || c.cmdId?.startsWith('srv-url'))
      if (urlCmd && !previewFirstSeenAt.current) {
        previewFirstSeenAt.current = now
      }
      // Wait 20s after preview appears before firing any browser-error fix — the page needs
      // time for its initial render, React effects, and any async data loads to settle.
      // This eliminates false positives on transient cold-start errors.
      if (previewFirstSeenAt.current && now - previewFirstSeenAt.current < 20000) return
      if (now - lastBrowserFix.current < 30000) return
      browserSeen.current.add(key)
      lastBrowserFix.current = now
      sessionFixCount.current += 1
      setTimeout(() => {
        try {
          // data-report-errors renders as null (invisible) — the raw error is sent to the AI
          // via transformMessages but NEVER shown to the user. Lovable-style silent repair.
          sendMessage({
            role: 'user',
            parts: [
              {
                type: 'data-report-errors',
                data: {
                  summary:
                    "SILENT FIX — do NOT write any text. Call patch_file immediately.\n\n" +
                    "The preview isn't displaying right. Read the relevant files and patch the bug (don't regenerate the whole project). " +
                    'Common causes: a component returning nothing, an undefined variable during render, a bad import, a hook misuse, or malformed CSS (unbalanced parentheses / missing semicolon in a gradient).\n\nError detail:\n' +
                    latest.data,
                  paths: ['src/App.tsx', 'src/index.css'],
                },
              },
            ],
          })
        } catch {
          /* non-fatal */
        }
      }, 1200)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, fixErrors])

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
    if (sessionFixCount.current >= MAX_SESSION_FIXES) return // hard cap — stop looping
    if (now - lastErrorReportTime.current < 20000) return

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
          sessionFixCount.current += 1
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
      sessionFixCount.current = 0
      browserSeen.current.clear()
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
