'use client'

import type { ChatUIMessage } from '@/components/chat/types'
import { TEST_PROMPTS } from '@/ai/constants'
import { MessageCircleIcon, SendIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Input } from '@/components/ui/input'
import { Message } from '@/components/chat/message'
import { Panel, PanelHeader } from '@/components/panels/panels'
import { cn } from '@/lib/utils'
import { useLocalStorageValue } from '@/lib/use-local-storage-value'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSharedChatContext } from '@/lib/chat-context'
import { useSandboxStore } from './state'
import type { ChatStatus } from 'ai'

interface Props {
  className: string
}

function BuildingIndicator() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`
  }

  const isThinking = elapsed < 60
  const label = isThinking ? 'Thinking...' : 'Building your project...'
  const showHint = elapsed >= 90

  return (
    <div className="mx-3 mb-3 px-4 py-3 rounded-lg bg-secondary border border-primary/12 flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5 shrink-0">
          {isThinking ? (
            <span className="inline-block w-2 h-2 rounded-full bg-foreground/50 animate-pulse" />
          ) : (
            <>
              <span className="typing-dot inline-block w-2 h-2 rounded-full bg-foreground/70" style={{ animationDelay: '0ms' }} />
              <span className="typing-dot inline-block w-2 h-2 rounded-full bg-foreground/70" style={{ animationDelay: '200ms' }} />
              <span className="typing-dot inline-block w-2 h-2 rounded-full bg-foreground/70" style={{ animationDelay: '400ms' }} />
            </>
          )}
        </div>
        <span className="text-xs font-mono text-foreground/70 leading-none">{label}</span>
        <span className="ml-auto text-xs font-mono text-foreground/35 leading-none tabular-nums">{fmt(elapsed)}</span>
      </div>
      {showHint && (
        <p className="text-[10px] text-foreground/35 leading-snug animate-in fade-in duration-500">
          Projects can take a few minutes depending on complexity — please wait.
        </p>
      )}
    </div>
  )
}

export function Chat({ className }: Props) {
  const [input, setInput] = useLocalStorageValue('prompt-input')
  const { chat } = useSharedChatContext()

  // Messages — requestAnimationFrame batched.
  // useChat uses useSyncExternalStore which calls forceStoreRerender(SyncLane) on every
  // token. SyncLane forces synchronous React re-renders. DeepSeek streams hundreds of
  // tokens/sec — React hits its 50-update limit and throws "Maximum update depth exceeded".
  // rAF fires between frames (outside render phase), collapses burst tokens into one render
  // per frame (max 60/sec), and cannot cause update-depth errors by definition.
  const [messages, setMessages] = useState<ChatUIMessage[]>(
    () => chat.messages as ChatUIMessage[]
  )
  const rafPending = useRef(false)
  useEffect(() => {
    return (chat as any)['~registerMessagesCallback'](() => {
      if (!rafPending.current) {
        rafPending.current = true
        requestAnimationFrame(() => {
          rafPending.current = false
          setMessages([...chat.messages] as ChatUIMessage[])
        })
      }
    })
  }, [chat])

  // Status — fires only on transitions (submitted/streaming/ready), safe as plain setState
  const [status, setStatus] = useState<ChatStatus>(() => chat.status)
  useEffect(() => {
    return (chat as any)['~registerStatusCallback'](() => setStatus(chat.status))
  }, [chat])

  // sendMessage — direct call, no subscription needed
  const sendMessage = useCallback(
    (msg: Parameters<typeof chat.sendMessage>[0]) => chat.sendMessage(msg),
    [chat]
  )

  const setChatStatus = useSandboxStore((s) => s.setChatStatus)
  const setProjectName = useSandboxStore((s) => s.setProjectName)
  const setStreamError = useSandboxStore((s) => s.setStreamError)
  const streamError = useSandboxStore((s) => s.streamError)
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const pendingChatMessage = useSandboxStore((s) => s.pendingChatMessage)
  const setPendingChatMessage = useSandboxStore((s) => s.setPendingChatMessage)
  const deployStatus = useSandboxStore((s) => s.deployStatus)

  // Extract project name from AI's first message: "Building [Name] —..."
  useEffect(() => {
    if (!sandboxId) return
    const firstAI = messages.find(m => m.role === 'assistant')
    if (!firstAI) return
    const textPart = firstAI.parts?.find((p: { type: string }) => p.type === 'text') as { type: 'text'; text: string } | undefined
    if (!textPart?.text) return
    const match = textPart.text.match(/Building\s+(.+?)(?:\s+—|\s+-|\s*\.|$)/i)
    if (match?.[1]) {
      setProjectName(match[1].trim().slice(0, 60))
    } else {
      // Fallback: first 60 chars of user's last message
      const lastUser = [...messages].reverse().find(m => m.role === 'user')
      const userText = lastUser?.parts?.find((p: { type: string }) => p.type === 'text') as { type: 'text'; text: string } | undefined
      if (userText?.text) setProjectName(userText.text.slice(0, 60))
    }
  }, [messages, sandboxId, setProjectName])

  const isWorking = status === 'streaming' || status === 'submitted'
  // Lock the chat while ANY long operation runs (generation OR a deploy/build) so a new
  // message can't clash with or interrupt an in-flight Cloud action.
  const busy = isWorking || deployStatus === 'building' || deployStatus === 'deploying'

  const validateAndSubmitMessage = useCallback(
    (text: string) => {
      if (text.trim()) {
        setStreamError(null) // clear any previous error
        sendMessage({ text })
        setInput('')
      }
    },
    [sendMessage, setInput, setStreamError]
  )

  useEffect(() => {
    setChatStatus(status)
  }, [status, setChatStatus])

  // Auto-submit messages injected by other UI panels (e.g. "Add Database" button)
  const pendingFiredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!pendingChatMessage || isWorking) return
    // Guard against React StrictMode double-invoke firing the same message twice
    if (pendingFiredRef.current === pendingChatMessage) return
    pendingFiredRef.current = pendingChatMessage
    const msg = pendingChatMessage
    setPendingChatMessage(null)
    validateAndSubmitMessage(msg)
  }, [pendingChatMessage, isWorking, setPendingChatMessage, validateAndSubmitMessage])

  return (
    <Panel className={className}>
      <PanelHeader>
        <div className="flex items-center font-mono font-semibold uppercase">
          <MessageCircleIcon className="mr-2 w-4" />
          Chat
        </div>
        <div className="ml-auto font-mono text-xs opacity-50">[{status}]</div>
      </PanelHeader>

      {/* Messages Area */}
      {messages.length === 0 ? (
        <div className="flex-1 min-h-0">
          <div className="flex flex-col justify-center items-center h-full font-mono text-sm text-muted-foreground">
            <p className="flex items-center font-semibold">
              Click and try one of these prompts:
            </p>
            <ul className="p-4 space-y-1 text-center">
              {TEST_PROMPTS.map((prompt, idx) => (
                <li
                  key={idx}
                  className="px-4 py-2 rounded-sm border border-dashed shadow-sm cursor-pointer border-border hover:bg-secondary/50 hover:text-primary"
                  onClick={() => validateAndSubmitMessage(prompt)}
                >
                  {prompt}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <Conversation className="relative w-full">
          <ConversationContent className="space-y-4">
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* Connection error — shows when stream drops mid-generation */}
      {streamError && !isWorking && (
        <div className="mx-3 mb-3 px-4 py-3 rounded-lg bg-destructive/8 border border-destructive/20 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-destructive/70 shrink-0 mt-1" />
            <span className="text-xs font-mono text-foreground/70 leading-snug flex-1">
              Connection interrupted — your generation may be incomplete.
            </span>
          </div>
          <button
            type="button"
            onClick={() => validateAndSubmitMessage('Please continue from where you left off.')}
            className="self-start ml-4 text-xs font-medium text-foreground/80 underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Continue generation →
          </button>
        </div>
      )}

      {/* Building indicator — shows above the input while AI is working */}
      {isWorking && <BuildingIndicator />}

      {/* Input form */}
      <form
        className={cn(
          'relative flex items-center p-2 space-x-1 border-t bg-background transition-colors duration-300',
          isWorking ? 'border-foreground/20' : 'border-primary/18'
        )}
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          validateAndSubmitMessage(input)
        }}
      >
        {/* Shimmer progress bar at the top of the form when working */}
        {busy && (
          <div className="absolute top-0 left-0 right-0 h-px overflow-hidden">
            <div className="chat-shimmer absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-foreground/40 to-transparent" />
          </div>
        )}

        <Input
          className="w-full font-mono text-sm rounded-sm border-0 bg-background"
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            deployStatus === 'building' || deployStatus === 'deploying'
              ? 'Publishing your project…'
              : isWorking
                ? 'Codemine is building...'
                : 'Type your message...'
          }
          value={input}
        />
        <Button type="submit" disabled={busy || status !== 'ready' || !input.trim()}>
          <SendIcon className="w-4 h-4" />
        </Button>
      </form>
    </Panel>
  )
}
