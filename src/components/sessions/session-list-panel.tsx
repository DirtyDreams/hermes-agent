import { useState, useMemo, useCallback } from 'react'
import { useSessions, type Session } from '../../hooks/use-sessions'
import { Plus, Search, Archive, Trash2, Edit2, Copy, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

function groupByDate(sessions: Session[]): Record<string, Session[]> {
  const groups: Record<string, Session[]> = { Today: [], Yesterday: [], Earlier: [], Archived: [] }
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)

  for (const s of sessions) {
    if (s.archived) { groups.Archived.push(s); continue }
    const d = s.createdAt ? new Date(s.createdAt) : null
    if (!d) { groups.Earlier.push(s) }
    else if (d >= today) { groups.Today.push(s) }
    else if (d >= yesterday) { groups.Yesterday.push(s) }
    else { groups.Earlier.push(s) }
  }
  return groups
}

type SessionGroupProps = {
  label: string
  sessions: Session[]
  selectedId: string
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onExport: (id: string) => void
}

function SessionGroup({ label, sessions, selectedId, onSelect, onRename, onArchive, onDelete, onDuplicate, onExport }: SessionGroupProps) {
  const [expanded, setExpanded] = useState(true)
  if (sessions.length === 0) return null

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-widest text-slate-500 hover:text-slate-300"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label} ({sessions.length})
      </button>
      {expanded && sessions.map((s) => (
        <SessionRow
          key={s.id}
          session={s}
          selected={s.id === selectedId}
          onSelect={onSelect}
          onRename={onRename}
          onArchive={onArchive}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onExport={onExport}
        />
      ))}
    </div>
  )
}

type SessionRowProps = SessionGroupProps & { session: Session }

function SessionRow({ session, selected, onSelect, onRename, onArchive, onDelete, onDuplicate, onExport }: SessionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(session.title)

  const handleRename = () => {
    if (name.trim() && name !== session.title) onRename(session.id, name.trim())
    setRenaming(false)
  }

  return (
    <div
      className={cn(
        'group relative flex items-center justify-between rounded-xl px-3 py-2 cursor-pointer transition',
        selected ? 'bg-emerald-500/20 text-emerald-100' : 'hover:bg-slate-800/60 text-slate-300',
      )}
      onClick={() => onSelect(session.id)}
      onDoubleClick={() => setRenaming(true)}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {session.color && <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: session.color }} />}
        {renaming ? (
          <input
            className="flex-1 bg-transparent border-b border-emerald-400 text-sm text-white outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false) }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate text-sm font-medium">{session.title || session.id}</span>
        )}
        {session.tag && (
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{session.tag}</span>
        )}
      </div>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Session options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((p) => !p)}
          className="rounded-lg p-1 opacity-0 group-hover:opacity-100 hover:bg-slate-700 transition"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl">
            <button onClick={() => { setRenaming(true); setMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
              <Edit2 className="h-3 w-3" /> Rename
            </button>
            <button onClick={() => { onDuplicate(session.id); setMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
              <Copy className="h-3 w-3" /> Duplicate
            </button>
            <button onClick={() => { onArchive(session.id); setMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
              <Archive className="h-3 w-3" /> Archive
            </button>
            <button onClick={() => { onExport(session.id); setMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
              <Download className="h-3 w-3" /> Export
            </button>
            <button onClick={() => { onDelete(session.id); setMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-800">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

type Props = {
  selectedSessionId: string
  onSelect: (id: string) => void
}

export function SessionListPanel({ selectedSessionId, onSelect }: Props) {
  const { sessions, loading, create, rename, archive, remove, exportSession, search } = useSessions()
  const [searchQ, setSearchQ] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const handleDuplicate = useCallback(async (id: string) => {
    const s = sessions.find((s) => s.id === id)
    if (s) await create(s.title)
  }, [sessions, create])

  const handleExport = useCallback(async (id: string) => {
    const content = await exportSession(id)
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session-${id}.md`
    a.click()
  }, [exportSession])

  const groups = useMemo(() => {
    const all = searchQ ? sessions.filter((s) => s.title.toLowerCase().includes(searchQ.toLowerCase())) : sessions
    const visible = showArchived ? all : all.filter((s) => !s.archived)
    return groupByDate(visible)
  }, [sessions, searchQ, showArchived])

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search sessions..."
            className="pl-9 bg-slate-950/80 text-slate-100"
          />
        </div>
        <Button type="button" size="sm" onClick={() => void create()} aria-label="Create new session" className="bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded" />
        Show archived
      </label>

      {loading && <p className="text-sm text-slate-500">Loading sessions...</p>}
      <div className="space-y-3">
        {(Object.entries(groups) as [string, Session[]][]).map(([label, group]) => (
          <SessionGroup
            key={label}
            label={label}
            sessions={group}
            selectedId={selectedSessionId}
            onSelect={onSelect}
            onRename={rename}
            onArchive={archive}
            onDelete={remove}
            onDuplicate={handleDuplicate}
            onExport={handleExport}
          />
        ))}
      </div>
    </div>
  )
}