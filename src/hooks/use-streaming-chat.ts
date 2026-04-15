// src/hooks/use-streaming-chat.ts
import { useRef, useState, useCallback } from 'react'
import { streamChat, type ChatPayload } from '../lib/api-client'

export type MessageRole = 'user' | 'assistant' | 'system'

export type Message = {
  id: string
  role: MessageRole
  content: string
  meta?: string
  status?: 'streaming' | 'complete' | 'error'
  toolCalls?: ToolCall[]
}

export type ToolCall = {
  id: string
  name: string
  params: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  result?: string
}

export type StreamingState = {
  messages: Message[]
  isStreaming: boolean
  activeToolCalls: ToolCall[]
  sendMessage: (prompt: string, payload: Omit<ChatPayload, 'message'>) => Promise<void>
  cancelStream: () => void
  regenerate: (messageId: string) => Promise<void>
  branchMessage: (messageId: string) => string | null
}

export function useStreamingChat(defaultPayload: Omit<ChatPayload, 'message'>): StreamingState {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsStreaming(false)
    setMessages((prev) =>
      prev.map((m) => (m.status === 'streaming' ? { ...m, status: 'error' as const } : m)),
    )
  }, [])

  const sendMessage = useCallback(
    async (prompt: string, payload: Omit<ChatPayload, 'message'>) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        status: 'complete',
      }
      const assistantMsgId = crypto.randomUUID()
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        toolCalls: [],
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsStreaming(true)
      setActiveToolCalls([])

      const controller = new AbortController()
      abortControllerRef.current = controller

      const contentRef = { current: '' }

      try {
        for await (const token of streamChat(
          { ...defaultPayload, ...payload, message: prompt },
          (name, params) => {
            const tc: ToolCall = {
              id: crypto.randomUUID(),
              name,
              params,
              status: 'running',
            }
            setActiveToolCalls((prev) => [...prev, tc])
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] }
                  : m,
              ),
            )
          },
          (name, result) => {
            setActiveToolCalls((prev) =>
              prev.map((tc) => (tc.name === name ? { ...tc, status: 'done', result } : tc)),
            )
          },
          controller.signal,
        )) {
          if (controller.signal.aborted) break
          contentRef.current += token
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: contentRef.current }
                : m,
            ),
          )
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, status: 'complete' as const } : m,
          ),
        )
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, status: 'error' as const, content: 'Cancelled' } : m,
            ),
          )
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, status: 'error' as const, content: String(err) }
                : m,
            ),
          )
        }
      } finally {
        setIsStreaming(false)
        setActiveToolCalls([])
      }
    },
    [defaultPayload],
  )

  const regenerate = useCallback(
    async (messageId: string) => {
      const msgIndex = messages.findIndex((m) => m.id === messageId)
      if (msgIndex < 1) return
      const userMsg = messages[msgIndex - 1]
      if (userMsg.role !== 'user') return
      setMessages((prev) => prev.slice(0, msgIndex))
      await sendMessage(userMsg.content, {})
    },
    [messages, sendMessage],
  )

  const branchMessage = useCallback(
    (messageId: string): string | null => {
      const msg = messages.find((m) => m.id === messageId)
      if (!msg) return null
      return msg.content
    },
    [messages],
  )

  return { messages, isStreaming, activeToolCalls, sendMessage, cancelStream, regenerate, branchMessage }
}