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
  const { activePanel, closePanel, openPanel } = useLayout()
  const isOpen = activePanel === 'toolActivity'

  return (
    <>
      {/* Collapsed pulsing indicator */}
      {!isOpen && (isStreaming || toolCalls.length > 0) && (
        <button
          onClick={() => openPanel('toolActivity')}
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