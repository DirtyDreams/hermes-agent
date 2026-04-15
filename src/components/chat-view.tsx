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
  const { messages, isStreaming, sendMessage, cancelStream, regenerate, branchMessage } =
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
          aria-label="Message Hermes"
          value={composerText}
          onChange={(e) => setComposerText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Hermes..."
          className="min-h-[80px] flex-1 bg-slate-950/80 text-slate-100"
        />
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            onClick={() => openPanel('fileBrowser')}
            variant="ghost"
            size="sm"
            title="File Browser"
            aria-label="Open file browser"
          >
            <Files className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            onClick={() => openPanel('dashboard')}
            variant="ghost"
            size="sm"
            title="Dashboard"
            aria-label="Open dashboard"
          >
            <LayoutDashboard className="h-4 w-4" />
          </Button>
          {isStreaming ? (
            <Button type="button" variant="destructive" onClick={cancelStream} aria-label="Cancel streaming">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={() => void handleSend()} disabled={!composerText.trim()} aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}