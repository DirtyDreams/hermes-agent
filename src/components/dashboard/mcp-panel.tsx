// src/components/dashboard/mcp-panel.tsx
import { useState } from 'react'
import { useMCPServers, type MCPServer } from '../../hooks/use-dashboard-data'
import { ChevronDown, ChevronRight, Server, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Badge } from '../ui/badge'

function ServerSection({ server }: { server: MCPServer }) {
  const [expanded, setExpanded] = useState(false)

  const statusIcon =
    server.status === 'connected' ? (
      <CheckCircle className="h-3 w-3 text-emerald-400" />
    ) : server.status === 'error' ? (
      <XCircle className="h-3 w-3 text-red-400" />
    ) : (
      <Loader2 className="h-3 w-3 animate-spin text-yellow-400" />
    )

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60">
      <button
        onClick={() => setExpanded((p) => !p)}
        type="button"
        className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-800/50"
        aria-expanded={expanded}
        aria-controls={`server-${server.name}`}
      >
        <div className="flex items-center gap-3">
          <Server className="h-4 w-4 text-slate-400" />
          <span className="font-semibold text-white">{server.name}</span>
          {statusIcon}
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-slate-700 text-slate-300">{server.tools.length} tools</Badge>
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-700 p-4 space-y-2">
          {server.tools.map((tool) => (
            <div key={tool.name} className="flex gap-3 rounded-lg bg-slate-950/60 p-3">
              <div className="min-w-0 flex-1">
                <code className="text-sm font-semibold text-emerald-300">{tool.name}</code>
                <p className="text-xs text-slate-400 mt-1">{tool.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function MCPPanel() {
  const { servers, loading, error } = useMCPServers()

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-slate-400">Scanning MCP servers...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!loading && servers.length === 0 && (
        <p className="text-sm text-slate-500">No MCP servers connected.</p>
      )}
      {servers.map((server) => (
        <ServerSection key={server.name} server={server} />
      ))}
    </div>
  )
}