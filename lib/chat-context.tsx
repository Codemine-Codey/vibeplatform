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
          setTimeout(() => mapDataToStateRef.current(data), 0)
        },
        onError: (error) => {
          toast.error(`Communication error with the AI: ${error.message}`)
          console.error('Error sending message:', error)
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
