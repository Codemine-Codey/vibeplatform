'use client'

import { type ChatUIMessage } from '@/components/chat/types'
import { type ReactNode } from 'react'
import { Chat } from '@ai-sdk/react'
import { DataPart } from '@/ai/messages/data-parts'
import { DataUIPart } from 'ai'
import { createContext, useContext, useMemo, useRef } from 'react'
import { unstable_batchedUpdates } from 'react-dom'
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
        onData: (data: DataUIPart<DataPart>) => {
          // Defer to next macrotask so this never runs during a React render phase.
          // unstable_batchedUpdates ensures all resulting Zustand set() calls are
          // processed in a single React render cycle, preventing cascading renders
          // even when useSyncExternalStore (which Zustand uses) is involved.
          setTimeout(() => {
            unstable_batchedUpdates(() => {
              try {
                mapDataToStateRef.current(data)
              } catch (err) {
                console.error('Error processing stream event:', err)
              }
            })
          }, 0)
        },
        onError: (error) => {
          const msg = error?.message ?? ''
          // 'terminated' is expected when stream ends due to sandbox timeout or
          // network drop — not a user-visible error
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
