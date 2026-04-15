# Track A: Streaming Chat Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real-time token streaming via SSE, Tool Activity side panel, message regeneration/cancellation, branching edits.

**Architecture:** Backend exposes `POST /api/chat/stream` that spawns `hermes chat` and streams SSE events. Frontend uses `useRef`-based token renderer for zero-re-render streaming, with a Tool Activity panel opened on first `tool_call` event.

**Tech Stack:** Express 5 (SSE), React hooks (`useRef`, `useState`, `useEffect`), existing UI primitives, CSS transitions for panel animations.

---

## File Map

| File | Role |
|---|---|
| `server/index.ts` | Add SSE streaming endpoint + tool-events endpoint |
| `src/lib/api-client.ts` | New — typed fetch + SSE client for all `/api/*` calls |
| `src/contexts/layout-context.tsx` | New — sidebar collapse state + active panel state |
| `src/hooks/use-streaming-chat.ts` | New — streaming chat state machine hook |
| `src/components/streaming-message.tsx` | New — token-by-token message bubble |
| `src/components/tool-activity-panel.tsx` | New — right-edge tool call overlay |
| `src/App.tsx` | Refactor — extract sidebar, add layout context, wire streaming |

---

## Tasks

### Task 1: Layout Context

**Files:**
- Create: `src/contexts/layout-context.tsx`
- Modify: `src/App.tsx` (wrap with provider)

- [ ] **Step 1: Create layout context**

```typescript
// src/contexts/layout-context.tsx
import { createContext, useContext, useState, type ReactNode } from 'react'

type ActivePanel = 'none' | 'toolActivity' | 'fileBrowser' | 'dashboard'
type SidebarExpanded = 'expanded' | 'collapsed'

type LayoutState = {
  sidebarExpanded: SidebarExpanded
  activePanel: ActivePanel
  openPanel: (panel: ActivePanel) => void
  closePanel: () => void
  toggleSidebar: () => void
}

const LayoutContext = createContext<LayoutState | null>(null)

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarExpanded, setSidebarExpanded] = useState<SidebarExpanded>('expanded')
  const [activePanel, setActivePanel] = useState<ActivePanel>('none')

  const openPanel = (panel: ActivePanel) => setActivePanel(panel)
  const closePanel = () => setActivePanel('none')
  const toggleSidebar = () =>
    setSidebarExpanded((prev) => (prev === 'expanded' ? 'collapsed' : 'expanded'))

  return (
    <LayoutContext.Provider value={{ sidebarExpanded, activePanel, openPanel, closePanel, toggleSidebar }}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider')
  return ctx
}
```

- [ ] **Step 2: Wrap App with LayoutProvider in main.tsx**

Modify `src/main.tsx` to wrap `<App />` with `<LayoutProvider>`

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LayoutProvider } from './contexts/layout-context.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LayoutProvider>
      <App />
    </LayoutProvider>
  </StrictMode>,
)
```

- [ ] **Step 3: Run dev server to verify no errors**

```bash
npm run dev:web
```
Expected: page loads without console errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/layout-context.tsx src/main.tsx
git commit -m "feat: add layout context for sidebar and panel state

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: API Client with SSE Support

**Files:**
- Create: `src/lib/api-client.ts`

- [ ] **Step 1: Write SSE types and API client**

```typescript
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
    // handle named events if needed
    return null
  }
  if (!line.startsWith('data:')) return null
  const data = line.slice(5).trim()
  if (data === '[DONE]') return { type: 'done', data: null }

  // Try to parse as JSON first for structured events
  try {
    const parsed = JSON.parse(data)
    if (parsed.type && parsed.data !== undefined) {
      return parsed as SSEEvent
    }
    // Plain text token
    return { type: 'token', data: parsed.content ?? data }
  } catch {
    // Plain text token
    return { type: 'token', data }
  }
}

export async function* streamChat(
  payload: ChatPayload,
  onToolCall?: (name: string, params: Record<string, unknown>) => void,
  onToolResult?: (name: string, result: string) => void,
): AsyncGenerator<string, void, unknown> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
      buffer = lines.pop() ?? '' // keep incomplete line in buffer
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

export async function getToolEvents(): Promise<ReadableStream<SSESEvent>> {
  const response = await fetch('/api/chat/tool-events')
  return response.body!
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api-client.ts
git commit -m "feat: add typed API client with SSE streaming support

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: useStreamingChat Hook

**Files:**
- Create: `src/hooks/use-streaming-chat.ts`

- [ ] **Step 1: Write the hook**

```typescript
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
    setIsStreaming(false)
    setMessages((prev) =>
      prev.map((m) => (m.status === 'streaming' ? { ...m, status: 'error' as const } : m)),
    )
  }, [])

  const sendMessage = useCallback(
    async (prompt: string, payload: Omit<ChatPayload, 'message'>) => {
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
      // Remove this and all following messages
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
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-streaming-chat.ts
git commit -m "feat: add useStreamingChat hook with state machine

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Tool Activity Panel

**Files:**
- Create: `src/components/tool-activity-panel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the Tool Activity Panel component**

```tsx
// src/components/tool-activity-panel.tsx
import { useLayout } from '../contexts/layout-context'
import { cn } from '../lib/utils'
import { X, Loader2 } from 'lucide-react'
import type { ToolCall } from '../hooks/use-streaming-chat'

type Props = {
  toolCalls: ToolCall[]
  isStreaming: boolean
}

export function ToolActivityPanel({ toolCalls, isStreaming }: Props) {
  const { activePanel, closePanel } = useLayout()
  const isOpen = activePanel === 'toolActivity'

  return (
    <>
      {/* Collapsed pulsing indicator */}
      {!isOpen && (isStreaming || toolCalls.length > 0) && (
        <button
          onClick={() => useLayout().openPanel('toolActivity')}
          className="fixed right-0 top-1/2 z-40 flex h-12 w-6 items-center justify-center rounded-l-full bg-emerald-500 shadow-lg hover:bg-emerald-400"
          title="Tool Activity"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-slate-950" />
        </button>
      )}

      {/* Overlay panel */}
      <div
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-emerald-600/30 bg-slate-950/95 backdrop-blur-xl shadow-xl transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-emerald-600/30 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
            Tool Activity
          </h2>
          <button
            onClick={closePanel}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {toolCalls.length === 0 && !isStreaming && (
            <p className="text-sm text-slate-500">No tool calls yet.</p>
          )}
          {toolCalls.map((tc) => (
            <div
              key={tc.id}
              className="rounded-xl border border-slate-700 bg-slate-900/80 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold text-emerald-300">{tc.name}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    tc.status === 'running'
                      ? 'bg-yellow-500/20 text-yellow-300'
                      : tc.status === 'done'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/20 text-red-300',
                  )}
                >
                  {tc.status === 'running' ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> running
                    </span>
                  ) : (
                    tc.status
                  )}
                </span>
              </div>
              {Object.keys(tc.params).length > 0 && (
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer font-medium">params</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-slate-950 p-2 text-slate-300">
                    {JSON.stringify(tc.params, null, 2)}
                  </pre>
                </details>
              )}
              {tc.result && (
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer font-medium">result</summary>
                  <pre className="mt-1 max-h-32 overflow-y-auto rounded bg-slate-950 p-2 text-slate-300">
                    {tc.result}
                  </pre>
                </details>
              )}
            </div>
          ))}
          {isStreaming && toolCalls.length === 0 && (
            <p className="text-sm text-slate-500">Waiting for tool calls...</p>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tool-activity-panel.tsx
git commit -m "feat: add Tool Activity side panel component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Streaming Message Component

**Files:**
- Create: `src/components/streaming-message.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write StreamingMessage component**

```tsx
// src/components/streaming-message.tsx
import { useRef, useEffect } from 'react'
import { cn } from '../lib/utils'
import type { Message } from '../hooks/use-streaming-chat'
import { Copy, RefreshCw, Edit3, Check } from 'lucide-react'
import { useState } from 'react'

type Props = {
  message: Message
  onRegenerate?: (id: string) => void
  onBranch?: (id: string) => void
}

function useCopyToClipboard() {
  const [copied, setCopied] = useState(false)
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return { copied, copy }
}

export function StreamingMessage({ message, onRegenerate, onBranch }: Props) {
  const preRef = useRef<HTMLPreElement>(null)
  const { copied, copy } = useCopyToClipboard()

  // Auto-scroll as content grows
  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [message.content])

  const roleClass =
    message.role === 'user'
      ? 'border-emerald-500/30 bg-slate-950'
      : message.role === 'assistant'
      ? 'border-slate-700 bg-slate-900'
      : 'border-slate-700 bg-slate-950/85'

  return (
    <article className={cn('rounded-[1.75rem] border p-5 shadow-sm', roleClass)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-widest text-slate-400">
        <span>{message.role}</span>
        <div className="flex items-center gap-3">
          {message.meta && <span>{message.meta}</span>}
          {message.status === 'streaming' && (
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              streaming
            </span>
          )}
        </div>
      </div>

      <pre
        ref={preRef}
        className={cn(
          'whitespace-pre-wrap text-sm leading-7',
          message.status === 'streaming' && 'after:ml-1 after:text-emerald-400 after:animate-pulse after:content-["▊"]',
        )}
      >
        {message.content}
      </pre>

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        {message.role === 'user' && onBranch && (
          <button
            onClick={() => onBranch(message.id)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Branch from this message"
          >
            <Edit3 className="h-3 w-3" /> Edit & resend
          </button>
        )}
        {message.role === 'assistant' && message.status !== 'streaming' && onRegenerate && (
          <button
            onClick={() => onRegenerate(message.id)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Regenerate"
          >
            <RefreshCw className="h-3 w-3" /> Regenerate
          </button>
        )}
        {message.content && (
          <button
            onClick={() => copy(message.content)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Copy"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </article>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/streaming-message.tsx
git commit -m "feat: add StreamingMessage component with token rendering and actions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Backend SSE Streaming Endpoint

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add SSE streaming endpoint to server/index.ts**

Add these imports at the top of `server/index.ts`:
```typescript
import { EventEmitter } from 'node:events'
```

Add this method BEFORE `app.listen`:
```typescript
// Tool event emitter for cross-endpoint communication
const toolEmitter = new EventEmitter()

app.post('/api/chat/stream', async (req: Request, res: Response) => {
  const payload = req.body as ChatRequest

  if (!payload?.message || typeof payload.message !== 'string') {
    res.status(400).json({ error: 'Field "message" is required.' })
    return
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const args = buildHermesArgs(payload)
  const startedAt = Date.now()

  const child = spawn('hermes', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  })

  let stdout = ''
  let stderr = ''

  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    stdout += text
    // Stream each chunk as a token event
    res.write(`data: ${JSON.stringify({ type: 'token', data: text })}\n\n`)
  })

  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
    // Detect tool call patterns in stderr and emit tool events
    const text = chunk.toString()
    // Hermes emits tool calls as structured JSON to stderr (configurable)
    try {
      const parsed = JSON.parse(text)
      if (parsed.type === 'tool_call') {
        res.write(`data: ${JSON.stringify({ type: 'tool_call', data: parsed })}\n\n`)
        toolEmitter.emit('tool_call', parsed)
      } else if (parsed.type === 'tool_result') {
        res.write(`data: ${JSON.stringify({ type: 'tool_result', data: parsed })}\n\n`)
        toolEmitter.emit('tool_result', parsed)
      }
    } catch {
      // Not JSON — treat as token
      res.write(`data: ${JSON.stringify({ type: 'token', data: text })}\n\n`)
    }
  })

  const timeout = setTimeout(() => {
    child.kill('SIGTERM')
    res.write(`data: ${JSON.stringify({ type: 'error', data: 'Timeout' })}\n\n`)
    res.end()
  }, payload.timeoutMs ?? 240_000)

  child.on('close', (exitCode) => {
    clearTimeout(timeout)
    const durationMs = Date.now() - startedAt
    res.write(`data: ${JSON.stringify({ type: 'done', data: { exitCode, durationMs } })}\n\n`)
    res.end()
  })

  child.on('error', (error) => {
    clearTimeout(timeout)
    res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`)
    res.end()
  })

  // Handle client disconnect
  req.on('close', () => {
    clearTimeout(timeout)
    child.kill('SIGTERM')
  })
})

// SSE endpoint for tool events
app.get('/api/chat/tool-events', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const onToolCall = (data: unknown) => {
    res.write(`data: ${JSON.stringify({ type: 'tool_call', data })}\n\n`)
  }
  const onToolResult = (data: unknown) => {
    res.write(`data: ${JSON.stringify({ type: 'tool_result', data })}\n\n`)
  }

  toolEmitter.on('tool_call', onToolCall)
  toolEmitter.on('tool_result', onToolResult)

  _req.on('close', () => {
    toolEmitter.off('tool_call', onToolCall)
    toolEmitter.off('tool_result', onToolResult)
  })
})
```

- [ ] **Step 2: Test the streaming endpoint**

Start the server and test with curl:
```bash
npm run start:server &
sleep 2
curl -X POST http://localhost:8787/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Hermes", "timeoutMs": 30000}' \
  --no-buffer
```
Expected: SSE stream of tokens returned.

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: add SSE streaming endpoint for real-time token output

- POST /api/chat/stream: streams tokens as SSE events
- GET /api/chat/tool-events: SSE stream of tool call lifecycle
- Emits tool_call and tool_result events parsed from hermes stderr

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: App.tsx Refactor — Wire Everything Together

**Files:**
- Modify: `src/App.tsx` (large refactor — split into smaller components)

- [ ] **Step 1: Extract ChatView to its own component**

```tsx
// src/components/chat-view.tsx
import { useState, useCallback } from 'react'
import { StreamingMessage } from './streaming-message'
import { useStreamingChat } from '../hooks/use-streaming-chat'
import { useLayout } from '../contexts/layout-context'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Send, Square, Files, LayoutDashboard } from 'lucide-react'

export function ChatView() {
  const { openPanel } = useLayout()
  const [composerText, setComposerText] = useState('')
  const { messages, isStreaming, activeToolCalls, sendMessage, cancelStream, regenerate, branchMessage } =
    useStreamingChat({ provider: 'auto', toolsets: 'web,terminal', maxTurns: 90, source: 'web-app' })

  const handleSend = useCallback(async () => {
    const text = composerText.trim()
    if (!text || isStreaming) return
    setComposerText('')
    await sendMessage(text, {})
  }, [composerText, isStreaming, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const branchedText = branchMessage(messages[messages.length - 1]?.id ?? '')

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex-1 space-y-4 overflow-y-auto">
        {messages.map((msg) => (
          <StreamingMessage
            key={msg.id}
            message={msg}
            onRegenerate={regenerate}
            onBranch={(id) => {
              const text = branchMessage(id)
              if (text) setComposerText(text)
            }}
          />
        ))}
      </div>

      <div className="flex items-end gap-3">
        <Textarea
          value={composerText}
          onChange={(e) => setComposerText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Hermes..."
          className="min-h-[80px] flex-1 bg-slate-950/80 text-slate-100"
        />
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => openPanel('fileBrowser')}
            variant="ghost"
            size="sm"
            title="File Browser"
          >
            <Files className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => openPanel('dashboard')}
            variant="ghost"
            size="sm"
            title="Dashboard"
          >
            <LayoutDashboard className="h-4 w-4" />
          </Button>
          {isStreaming ? (
            <Button variant="destructive" onClick={cancelStream}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => void handleSend()} disabled={!composerText.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace the chat tab content in App.tsx**

In `src/App.tsx`, replace the entire `<Tabs.Content value="chat">` block (lines ~398-451) with:
```tsx
<Tabs.Content value="chat">
  <Card className="rounded-[1.75rem] bg-slate-950/80 p-6 ring-1 ring-slate-800/70">
    <ChatView />
  </Card>
</Tabs.Content>
```

Add import:
```tsx
import { ChatView } from './components/chat-view'
```

- [ ] **Step 3: Add imports for new components**

Add to App.tsx imports:
```tsx
import { ToolActivityPanel } from './components/tool-activity-panel'
import { useLayout } from './contexts/layout-context'
```

- [ ] **Step 4: Add ToolActivityPanel to App render**

Add inside the `<div className="mx-auto flex min-h-screen max-w-[1600px]...">` container, after the `<main>` block:
```tsx
<ToolActivityPanel
  toolCalls={activeToolCalls}
  isStreaming={isStreaming}
/>
```

Note: `activeToolCalls` and `isStreaming` come from ChatView. Since they're in separate components, move them to layout context or lift state up. Simplest approach: move streaming state to LayoutContext.

Add to `src/contexts/layout-context.tsx`:
```typescript
export type ToolCall = {
  id: string
  name: string
  params: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  result?: string
}

type LayoutState = {
  // ... existing fields
  activeToolCalls: ToolCall[]
  setActiveToolCalls: (calls: ToolCall[]) => void
  isStreaming: boolean
  setIsStreaming: (v: boolean) => void
}

// Add to LayoutProvider:
const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([])
const [isStreaming, setIsStreaming] = useState(false)

// Add to context value:
activeToolCalls, setActiveToolCalls, isStreaming, setIsStreaming
```

Update `useStreamingChat` to use layout context instead of local state for these. Update `ToolActivityPanel` to read from context.

- [ ] **Step 5: Run dev server and verify**

```bash
npm run dev
```
Expected: app loads, chat textarea works, Tool Activity panel opens.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/chat-view.tsx
git commit -m "feat: wire streaming chat into App, add ChatView component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Real-time token streaming | Task 2 (API client) + Task 3 (hook) + Task 6 (SSE backend) |
| Tool Activity side panel | Task 4 |
| Token-by-token rendering | Task 5 |
| Regenerate/cancel | Task 3 (hook) + Task 5 (component) |
| Message branching | Task 3 (hook) + Task 5 (component) |
| Collapsible sidebar + overlay panels | Task 1 |

All spec requirements covered.
