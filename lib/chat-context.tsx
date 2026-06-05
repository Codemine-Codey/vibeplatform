'use client'

import { type ChatUIMessage } from '@/components/chat/types'
import { type ReactNode } from 'react'
import { Chat } from '@ai-sdk/react'
import { DataPart } from '@/ai/messages/data-parts'
import { DataUIPart } from 'ai'
import { createContext, useContext, useMemo, useRef } from 'react'
import { useDataStateMapper } from '@/app/state'
import { mutate } from 'swr'
import { toast } from 'sonner'

interface ChatContextValue {
  chat: Chat<ChatUIMessage>
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined)

export function ChatProvider({ children }: { children: ReactNode }) {
  const mapDataToState = useDataStateMapper()
  const mapDataToStateRef = useRef(mapDataToState)
  mapDataToStateRef.current = mapDataToState

  const chat = useMemo(
    () =>
      new Chat<ChatUIMessage>({
        onToolCall: () => mutate('/api/auth/info'),
        // Defer Zustand state updates to the next event loop tick.
        // Calling setState synchronously while the AI SDK processes stream events
        // causes React to hit the maximum update depth limit.
        onData: (data: DataUIPart<DataPart>) => {
          setTimeout(() => {
            try {
              mapDataToStateRef.current(data)
            } catch (err) {
              console.error('Error processing stream event:', err)
            }
          }, 0)
        },
        onError: (error) => {
          // 'terminated' is a normal SDK event when the stream ends abruptly
          // (sandbox timeout, user navigates away, network drop) — not actionable
          const msg = error?.message ?? ''
          if (msg === 'terminated' || msg.includes('terminated')) {
            console.warn('Stream terminated:', error)
            return
          }
          toast.error('Something went wrong. Please try again.')
          console.error('AI communication error:', error)
        },
      }),
    []
  )

  return (
    <ChatContext.Provider value={{ chat }}>{children}</ChatContext.Provider>
  )
}

export function useSharedChatContext() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useSharedChatContext must be used within a ChatProvider')
  }
  return context
}
