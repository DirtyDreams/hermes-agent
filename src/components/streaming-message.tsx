// src/components/streaming-message.tsx
import { useRef, useEffect, useState } from 'react'
import { cn } from '../lib/utils'
import type { Message } from '../hooks/use-streaming-chat'
import { Copy, RefreshCw, Edit3, Check } from 'lucide-react'

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
            type="button"
            onClick={() => onBranch(message.id)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Branch from this message"
          >
            <Edit3 className="h-3 w-3" /> Edit & resend
          </button>
        )}
        {message.role === 'assistant' && message.status !== 'streaming' && onRegenerate && (
          <button
            type="button"
            onClick={() => onRegenerate(message.id)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Regenerate"
          >
            <RefreshCw className="h-3 w-3" /> Regenerate
          </button>
        )}
        {message.content && (
          <button
            type="button"
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