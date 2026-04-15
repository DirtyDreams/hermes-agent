// src/lib/api-client.ts

export type ChatPayload = {
  message: string
  profile?: string
  provider?: string
  model?: string
  toolsets?: string
  skills?: string
  maxTurns?: number
  yolo?: boolean
  worktree?: boolean
  passSessionId?: boolean
  resume?: string
  continueName?: string
  source?: string
  extraArgs?: string
  timeoutMs?: number
}

export type SSEEvent =
  | { type: 'token'; data: string }
  | { type: 'tool_call'; data: { name: string; params: Record<string, unknown> } }
  | { type: 'tool_result'; data: { name: string; result: string } }
  | { type: 'done'; data: null }
  | { type: 'error'; data: string }

function parseSSEEvent(line: string): SSEEvent | null {
  if (line.startsWith('event:')) {
    return null
  }
  if (!line.startsWith('data:')) return null
  const data = line.slice(5).trim()
  if (data === '[DONE]') return { type: 'done', data: null }

  try {
    const parsed = JSON.parse(data)
    if (parsed.type && parsed.data !== undefined) {
      return parsed as SSEEvent
    }
    return { type: 'token', data: parsed.content ?? data }
  } catch {
    return { type: 'token', data }
  }
}

export async function* streamChat(
  payload: ChatPayload,
  onToolCall?: (name: string, params: Record<string, unknown>) => void,
  onToolResult?: (name: string, result: string) => void,
): AsyncGenerator<string, void, unknown> {
  const controller = new AbortController()
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })

  if (!response.ok) {
    throw new Error(`Chat failed: ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const event = parseSSEEvent(line)
        if (!event) continue
        if (event.type === 'token') {
          yield event.data
        } else if (event.type === 'tool_call') {
          onToolCall?.(event.data.name, event.data.params)
        } else if (event.type === 'tool_result') {
          onToolResult?.(event.data.name, event.data.result)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function getToolEvents(): Promise<ReadableStream<SSEEvent>> {
  const response = await fetch('/api/chat/tool-events')
  if (!response.ok) throw new Error(`Failed to connect: ${response.statusText}`)
  return response.body!
}