'use client'

import { Button } from '@/components/ui/button'
import { ArrowDownIcon } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

/**
 * Controlled auto-scroll conversation.
 *
 * Replaces `use-stick-to-bottom`, which drove a requestAnimationFrame + setState
 * loop on every ResizeObserver tick. Under DeepSeek's fast token streaming the
 * content grew every frame, re-firing the observer faster than React could settle,
 * which produced "Maximum update depth exceeded".
 *
 * This version scrolls IMPERATIVELY (no setState) inside the ResizeObserver and
 * only calls setState when the boolean isAtBottom actually flips — with a bail-out
 * guard — so it can never feedback-loop.
 */

interface ConversationCtx {
  isAtBottom: boolean
  scrollToBottom: () => void
}

const Ctx = createContext<ConversationCtx | null>(null)

const BOTTOM_THRESHOLD_PX = 80

export function Conversation({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const recomputeAtBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX
    isAtBottomRef.current = atBottom
    // Bail-out guard — only schedule a render when the value truly flips
    setIsAtBottom((prev) => (prev === atBottom ? prev : atBottom))
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

  // Keep the view pinned to the bottom as content grows — but only when the user
  // is already at the bottom. Imperative scroll only; never setState here.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const content = el.firstElementChild
    if (!content) return

    const observer = new ResizeObserver(() => {
      if (isAtBottomRef.current) {
        // Instant, imperative pin — no animation frame, no setState, no loop
        el.scrollTop = el.scrollHeight
      }
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  return (
    <Ctx.Provider value={{ isAtBottom, scrollToBottom }}>
      <div
        ref={scrollRef}
        onScroll={recomputeAtBottom}
        className={cn('relative flex-1 overflow-y-auto', className)}
        role="log"
      >
        {children}
      </div>
    </Ctx.Provider>
  )
}

export function ConversationContent({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <div className={cn('p-4', className)}>{children}</div>
}

export function ConversationScrollButton({
  className,
}: {
  className?: string
}) {
  const ctx = useContext(Ctx)
  if (!ctx || ctx.isAtBottom) return null
  return (
    <Button
      className={cn(
        'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full',
        className
      )}
      onClick={ctx.scrollToBottom}
      size="icon"
      type="button"
      variant="outline"
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  )
}
