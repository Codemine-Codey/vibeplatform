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
import { Settings } from '@/components/settings/settings'
import { cn } from '@/lib/utils'
import { useChat } from '@ai-sdk/react'
import { useLocalStorageValue } from '@/lib/use-local-storage-value'
import { useCallback, useEffect } from 'react'
import { useSharedChatContext } from '@/lib/chat-context'
import { useSandboxStore } from './state'

interface Props {
  className: string
}

function BuildingIndicator() {
  return (
    <div className="mx-3 mb-3 px-4 py-3 rounded-lg bg-secondary border border-primary/12 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex gap-1.5 shrink-0">
        <span className="typing-dot inline-block w-2 h-2 rounded-full bg-foreground/70" style={{ animationDelay: '0ms' }} />
        <span className="typing-dot inline-block w-2 h-2 rounded-full bg-foreground/70" style={{ animationDelay: '200ms' }} />
        <span className="typing-dot inline-block w-2 h-2 rounded-full bg-foreground/70" style={{ animationDelay: '400ms' }} />
      </div>
      <span className="text-xs font-mono text-foreground/70 leading-none">
        Building your project...
      </span>
    </div>
  )
}

export function Chat({ className }: Props) {
  const [input, setInput] = useLocalStorageValue('prompt-input')
  const { chat } = useSharedChatContext()
  // experimental_throttle caps React state updates to once per 50ms during
  // streaming. DeepSeek streams raw tokens (hundreds/sec) with no buffering,
  // unlike the AI Gateway the OSS used. Without this, the per-token render storm
  // overwhelms React's update budget -> "Maximum update depth exceeded".
  const { messages, sendMessage, status } = useChat<ChatUIMessage>({
    chat,
    experimental_throttle: 50,
  })
  const setChatStatus = useSandboxStore((s) => s.setChatStatus)

  const isWorking = status === 'streaming' || status === 'submitted'

  const validateAndSubmitMessage = useCallback(
    (text: string) => {
      if (text.trim()) {
        sendMessage({ text })
        setInput('')
      }
    },
    [sendMessage, setInput]
  )

  useEffect(() => {
    setChatStatus(status)
  }, [status, setChatStatus])

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
          validateAndSubmitMessage(input)
        }}
      >
        {/* Shimmer progress bar at the top of the form when working */}
        {isWorking && (
          <div className="absolute top-0 left-0 right-0 h-px overflow-hidden">
            <div className="chat-shimmer absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-foreground/40 to-transparent" />
          </div>
        )}

        <Settings />
        <Input
          className="w-full font-mono text-sm rounded-sm border-0 bg-background"
          disabled={isWorking}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isWorking ? 'VibePlatform is building...' : 'Type your message...'}
          value={input}
        />
        <Button type="submit" disabled={status !== 'ready' || !input.trim()}>
          <SendIcon className="w-4 h-4" />
        </Button>
      </form>
    </Panel>
  )
}
