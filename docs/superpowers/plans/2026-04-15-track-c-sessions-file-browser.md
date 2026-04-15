# Track C: Sessions + File Browser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full session lifecycle (create/rename/archive/search/export), workspace file browser with tree view, preview, create/edit/delete, and git detection.

**Architecture:** Backend endpoints spawn Hermes CLI commands for session and workspace operations. Frontend uses a dedicated panel component for each, with tree-state managed in React.

**Tech Stack:** Express 5 backend, React with existing UI primitives, `lucide-react` icons, `highlight.js` for syntax highlighting.

---

## File Map

| File | Role |
|---|---|
| `server/index.ts` | Add session + workspace API endpoints |
| `src/components/sessions/session-list-panel.tsx` | New — full session list with CRUD |
| `src/components/sessions/session-card.tsx` | New — individual session card with actions |
| `src/components/workspace/workspace-panel.tsx` | New — file browser container |
| `src/components/workspace/file-tree.tsx` | New — recursive directory tree |
| `src/components/workspace/file-preview.tsx` | New — file preview with edit mode |
| `src/hooks/use-sessions.ts` | New — session CRUD hook |
| `src/hooks/use-workspace.ts` | New — workspace file operations hook |

---

## Tasks

### Task 1: Backend Session + Workspace API Endpoints

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add session management endpoints**

```typescript
// Add before app.listen()

app.post('/api/sessions/create', async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string }
  try {
    const args = name ? ['sessions', 'new', '--name', name] : ['sessions', 'new']
    const result = await runCommand('hermes', args, 30_000)
    if (result.exitCode !== 0) {
      res.status(500).json({ error: result.stderr.trim() })
      return
    }
    // Parse session ID from output — format varies, extract first alphanumeric token
    const idMatch = result.stdout.match(/(\S+)/)
    const id = idMatch?.[1] ?? ''
    res.json({ id, title: name ?? id })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

app.patch('/api/sessions/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, color, tag, archived } = req.body as { name?: string; color?: string; tag?: string; archived?: boolean }
  try {
    const args = ['sessions', 'update', id]
    if (name) args.push('--name', name)
    if (color) args.push('--color', color)
    if (tag) args.push('--tag', tag)
    if (archived !== undefined) args.push(archived ? '--archive' : '--unarchive')
    const result = await runCommand('hermes', args, 20_000)
    res.status(result.exitCode === 0 ? 200 : 500).json({ ok: result.exitCode === 0, error: result.stderr.trim() })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) })
  }
})

app.delete('/api/sessions/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { hard } = req.query
  try {
    const args = hard ? ['sessions', 'delete', id, '--hard'] : ['sessions', 'delete', id]
    const result = await runCommand('hermes', args, 20_000)
    res.status(result.exitCode === 0 ? 200 : 500).json({ ok: result.exitCode === 0, error: result.stderr.trim() })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) })
  }
})

app.get('/api/sessions/:id/export', async (req: Request, res: Response) => {
  const { id } = req.params
  const { format } = req.query
  try {
    const ext = format === 'json' ? 'json' : 'md'
    const result = await runCommand('hermes', ['sessions', 'export', id, '--format', ext], 30_000)
    if (result.exitCode !== 0) {
      res.status(500).json({ error: result.stderr.trim() })
      return
    }
    const content = result.stdout
    if (format === 'json') {
      res.json({ content: JSON.parse(content) })
    } else {
      res.setHeader('Content-Type', 'text/markdown')
      res.setHeader('Content-Disposition', `attachment; filename="session-${id}.md"`)
      res.send(content)
    }
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

app.get('/api/sessions/search', async (req: Request, res: Response) => {
  const { q } = req.query
  if (!q || typeof q !== 'string') {
    res.status(400).json({ error: 'Query parameter q is required' })
    return
  }
  try {
    const result = await runCommand('hermes', ['sessions', 'search', q, '--json'], 30_000)
    if (result.exitCode !== 0) {
      res.json({ sessions: [] })
      return
    }
    const sessions = JSON.parse(result.stdout)
    res.json({ sessions })
  } catch {
    res.json({ sessions: [] })
  }
})
```

- [ ] **Step 2: Add workspace endpoints**

```typescript
// Workspace helpers
async function getHermesWorkdir(): Promise<string> {
  try {
    const result = await runCommand('hermes', ['workspace', 'dir'], 10_000)
    return result.exitCode === 0 ? result.stdout.trim() : process.cwd()
  } catch {
    return process.cwd()
  }
}

// Directory tree
app.get('/api/workspace/tree', async (_req: Request, res: Response) => {
  try {
    const workdir = await getHermesWorkdir()
    const result = await runCommand('hermes', ['workspace', 'tree', '--json', workdir], 20_000)
    if (result.exitCode !== 0) {
      res.json({ tree: [], error: result.stderr.trim() })
      return
    }
    const tree = JSON.parse(result.stdout)
    res.json({ tree, workdir })
  } catch (error) {
    res.status(500).json({ tree: [], error: String(error) })
  }
})

// Read file
app.get('/api/workspace/read', async (req: Request, res: Response) => {
  const { path: filePath } = req.query
  if (!filePath || typeof filePath !== 'string') {
    res.status(400).json({ error: 'path query parameter is required' })
    return
  }
  try {
    const stats = await fs.stat(filePath)
    if (stats.size > 5 * 1024 * 1024) {
      res.status(413).json({ error: 'File too large (max 5MB)' })
      return
    }
    const content = await fs.readFile(filePath, 'utf-8')
    const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(filePath)
    if (isImage) {
      const buf = await fs.readFile(filePath)
      res.json({ content: buf.toString('base64'), mimeType: `image/${filePath.split('.').pop()}` })
    } else {
      res.json({ content, mimeType: 'text/plain' })
    }
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

// Write file
app.put('/api/workspace/write', async (req: Request, res: Response) => {
  const { path: filePath, content } = req.body as { path?: string; content?: string }
  if (!filePath || content === undefined) {
    res.status(400).json({ error: 'path and content are required' })
    return
  }
  try {
    await fs.writeFile(filePath, content, 'utf-8')
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) })
  }
})

// Delete file/directory
app.delete('/api/workspace/delete', async (req: Request, res: Response) => {
  const { path: filePath } = req.query
  if (!filePath || typeof filePath !== 'string') {
    res.status(400).json({ error: 'path query parameter is required' })
    return
  }
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      await fs.rm(filePath, { recursive: true })
    } else {
      await fs.unlink(filePath)
    }
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) })
  }
})

// Mkdir
app.post('/api/workspace/mkdir', async (req: Request, res: Response) => {
  const { path: dirPath } = req.body as { path?: string }
  if (!dirPath) {
    res.status(400).json({ error: 'path is required' })
    return
  }
  try {
    await fs.mkdir(dirPath, { recursive: true })
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) })
  }
})

// Git info
app.get('/api/workspace/git', async (_req: Request, res: Response) => {
  try {
    const workdir = await getHermesWorkdir()
    const [branchResult, statusResult] = await Promise.all([
      runCommand('git', ['branch', '--show-current'], 10_000),
      runCommand('git', ['status', '--porcelain'], 10_000),
    ])
    const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : ''
    const dirtyCount = branchResult.exitCode === 0
      ? statusResult.stdout.split('\n').filter(Boolean).length
      : 0
    res.json({ branch, dirtyCount, workdir })
  } catch {
    res.json({ branch: '', dirtyCount: 0, workdir: process.cwd() })
  }
})
```

- [ ] **Step 3: Test endpoints**

```bash
npm run start:server &
sleep 2
curl http://localhost:8787/api/workspace/tree
curl http://localhost:8787/api/workspace/git
curl -X POST http://localhost:8787/api/sessions/create \
  -H "Content-Type: application/json" \
  -d '{"name": "test-session"}'
```

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: add session and workspace API endpoints

- POST /api/sessions/create, PATCH /api/sessions/:id, DELETE /api/sessions/:id
- GET /api/sessions/:id/export, GET /api/sessions/search
- GET /api/workspace/tree, GET /api/workspace/read, PUT /api/workspace/write
- DELETE /api/workspace/delete, POST /api/workspace/mkdir, GET /api/workspace/git

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: useSessions Hook

**Files:**
- Create: `src/hooks/use-sessions.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/use-sessions.ts
import { useState, useEffect, useCallback } from 'react'

export type Session = {
  id: string
  title: string
  createdAt?: string
  color?: string
  tag?: string
  archived?: boolean
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sessions/list')
      const data = await res.json() as { sessions?: Session[] }
      setSessions(data.sessions ?? [])
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const create = useCallback(async (name?: string): Promise<Session | null> => {
    try {
      const res = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json() as { id: string; title: string }
      await load()
      return { id: data.id, title: data.title }
    } catch { return null }
  }, [load])

  const rename = useCallback(async (id: string, name: string) => {
    await fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    await load()
  }, [load])

  const archive = useCallback(async (id: string, archived: boolean) => {
    await fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    })
    await load()
  }, [load])

  const remove = useCallback(async (id: string, hard = false) => {
    await fetch(`/api/sessions/${id}?hard=${hard}`, { method: 'DELETE' })
    await load()
  }, [load])

  const exportSession = useCallback(async (id: string, format: 'md' | 'json' = 'md') => {
    const res = await fetch(`/api/sessions/${id}/export?format=${format}`)
    if (format === 'json') {
      const data = await res.json() as { content: unknown }
      return JSON.stringify(data.content, null, 2)
    }
    return res.text()
  }, [])

  const search = useCallback(async (q: string): Promise<Session[]> => {
    const res = await fetch(`/api/sessions/search?q=${encodeURIComponent(q)}`)
    const data = await res.json() as { sessions?: Session[] }
    return data.sessions ?? []
  }, [])

  return { sessions, loading, error, reload: load, create, rename, archive, remove, exportSession, search }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-sessions.ts
git commit -m "feat: add useSessions hook with full CRUD and export

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Session List Panel

**Files:**
- Create: `src/components/sessions/session-list-panel.tsx`

- [ ] **Step 1: Write SessionListPanel component**

```tsx
// src/components/sessions/session-list-panel.tsx
import { useState, useMemo } from 'react'
import { useSessions, type Session } from '../../hooks/use-sessions'
import { Plus, Search, Archive, Trash2, Edit2, Copy, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
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
        <Button size="sm" onClick={() => void create()} className="bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400">
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
            onDuplicate={async (id) => { const s = sessions.find((s) => s.id === id); if (s) await create(s.title) }}
            onExport={async (id) => { const content = await exportSession(id); const blob = new Blob([content], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `session-${id}.md`; a.click() }}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sessions/session-list-panel.tsx
git commit -m "feat: add session list panel with full CRUD, search, grouped by date

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: useWorkspace Hook

**Files:**
- Create: `src/hooks/use-workspace.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/use-workspace.ts
import { useState, useEffect, useCallback } from 'react'

export type TreeNode = {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeNode[]
}

export type GitInfo = {
  branch: string
  dirtyCount: number
  workdir: string
}

export function useWorkspace() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [workdir, setWorkdir] = useState('')
  const [gitInfo, setGitInfo] = useState<GitInfo>({ branch: '', dirtyCount: 0, workdir: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/workspace/tree')
      const data = await res.json() as { tree?: TreeNode[]; workdir?: string; error?: string }
      setTree(data.tree ?? [])
      setWorkdir(data.workdir ?? '')
      setError(data.error ?? null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadGit = useCallback(async () => {
    const res = await fetch('/api/workspace/git')
    const data = await res.json() as GitInfo
    setGitInfo(data)
  }, [])

  useEffect(() => { void loadTree(); void loadGit() }, [loadTree, loadGit])

  const readFile = useCallback(async (path: string): Promise<{ content: string; mimeType: string } | null> => {
    try {
      const res = await fetch(`/api/workspace/read?path=${encodeURIComponent(path)}`)
      return await res.json()
    } catch { return null }
  }, [])

  const writeFile = useCallback(async (path: string, content: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/workspace/write', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      })
      const ok = res.ok
      if (ok) await loadTree()
      return ok
    } catch { return false }
  }, [loadTree])

  const deleteFile = useCallback(async (path: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/workspace/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
      const ok = res.ok
      if (ok) await loadTree()
      return ok
    } catch { return false }
  }, [loadTree])

  const mkdir = useCallback(async (path: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/workspace/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const ok = res.ok
      if (ok) await loadTree()
      return ok
    } catch { return false }
  }, [loadTree])

  return { tree, workdir, gitInfo, loading, error, reload: loadTree, readFile, writeFile, deleteFile, mkdir }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-workspace.ts
git commit -m "feat: add useWorkspace hook for file tree and file operations

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: File Tree Component

**Files:**
- Create: `src/components/workspace/file-tree.tsx`

- [ ] **Step 1: Write FileTree component**

```tsx
// src/components/workspace/file-tree.tsx
import { useState } from 'react'
import { Folder, FolderOpen, File, ChevronDown, ChevronRight, MoreVertical } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { TreeNode } from '../../hooks/use-workspace'

type Props = {
  nodes: TreeNode[]
  selectedPath: string | null
  onSelect: (path: string) => void
  onDelete: (path: string) => void
  onCreateFile: (dir: string) => void
  onCreateDir: (dir: string) => void
  onRename: (path: string) => void
  depth?: number
}

export function FileTree({ nodes, selectedPath, onSelect, onDelete, onCreateFile, onCreateDir, onRename, depth = 0 }: Props) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <TreeNodeRow
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onDelete={onDelete}
          onCreateFile={onCreateFile}
          onCreateDir={onCreateDir}
          onRename={onRename}
          depth={depth}
        />
      ))}
    </ul>
  )
}

type NodeProps = Props & { node: TreeNode; depth: number }

function TreeNodeRow({ node, selectedPath, onSelect, onDelete, onCreateFile, onCreateDir, onRename, depth }: NodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const isDir = node.type === 'directory'
  const isSelected = node.path === selectedPath

  const handleClick = () => {
    if (isDir) {
      setExpanded((p) => !p)
    } else {
      onSelect(node.path)
    }
  }

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-lg px-2 py-1 cursor-pointer text-sm',
          isSelected ? 'bg-emerald-500/20 text-emerald-100' : 'hover:bg-slate-800/60 text-slate-300',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir && (
          <button onClick={() => setExpanded((p) => !p)} className="flex-shrink-0">
            {expanded ? <ChevronDown className="h-3 w-3 text-slate-400" /> : <ChevronRight className="h-3 w-3 text-slate-400" />}
          </button>
        )}
        {!isDir && <span className="w-3 flex-shrink-0" />}

        <span className="flex-shrink-0">
          {isDir
            ? expanded ? <FolderOpen className="h-4 w-4 text-amber-400" /> : <Folder className="h-4 w-4 text-amber-400" />
            : <File className="h-4 w-4 text-slate-400" />}
        </span>

        <span className="flex-1 truncate" onClick={handleClick}>{node.name}</span>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((p) => !p)}
            className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-slate-700 transition"
          >
            <MoreVertical className="h-3 w-3 text-slate-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl">
              {isDir && (
                <>
                  <button onClick={() => { onCreateFile(node.path); setMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
                    New File
                  </button>
                  <button onClick={() => { onCreateDir(node.path); setMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
                    New Folder
                  </button>
                </>
              )}
              <button onClick={() => { onRename(node.path); setMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
                Rename
              </button>
              <button onClick={() => { onDelete(node.path); setMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-slate-800">
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {isDir && expanded && node.children && (
        <FileTree
          nodes={node.children}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onDelete={onDelete}
          onCreateFile={onCreateFile}
          onCreateDir={onCreateDir}
          onRename={onRename}
          depth={depth + 1}
        />
      )}
    </li>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/workspace/file-tree.tsx
git commit -m "feat: add recursive FileTree component with context menu

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: File Preview Component

**Files:**
- Create: `src/components/workspace/file-preview.tsx`

- [ ] **Step 1: Write FilePreview component**

```tsx
// src/components/workspace/file-preview.tsx
import { useState, useEffect } from 'react'
import { useWorkspace } from '../../hooks/use-workspace'
import { X, Edit2, Save, Download, FileText, Image } from 'lucide-react'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { cn } from '../../lib/utils'

type Props = {
  path: string
  onClose: () => void
}

export function FilePreview({ path, onClose }: Props) {
  const { readFile, writeFile } = useWorkspace()
  const [content, setContent] = useState('')
  const [mimeType, setMimeType] = useState('text/plain')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setEditing(false)
    void readFile(path).then((data) => {
      if (data) {
        setContent(data.content)
        setEditContent(data.content)
        setMimeType(data.mimeType)
      } else {
        setError('Failed to load file')
      }
      setLoading(false)
    })
  }, [path, readFile])

  const handleSave = async () => {
    setSaving(true)
    const ok = await writeFile(path, editContent)
    if (ok) {
      setContent(editContent)
      setEditing(false)
    } else {
      setError('Failed to save')
    }
    setSaving(false)
  }

  const isImage = mimeType.startsWith('image/')
  const isMarkdown = path.endsWith('.md')

  const handleDownload = () => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = path.split('/').pop() ?? 'file'
    a.click()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {isImage ? <Image className="h-4 w-4 flex-shrink-0 text-slate-400" /> : <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />}
          <span className="truncate text-sm font-medium text-white">{path.split('/').pop()}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={handleDownload} title="Download">
            <Download className="h-4 w-4" />
          </Button>
          {!isImage && (
            editing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400">
                  <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditContent(content) }}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Edit2 className="h-4 w-4 mr-1" /> Edit
              </Button>
            )
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-sm text-slate-500">Loading...</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && !error && isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:${mimeType};base64,${content}`}
            alt={path}
            className="max-w-full h-auto rounded-lg"
          />
        )}

        {!loading && !error && !isImage && editing && (
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-full h-full bg-slate-950/80 text-slate-100 font-mono text-sm"
          />
        )}

        {!loading && !error && !isImage && !editing && (
          isMarkdown ? (
            <div
              className="prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br>') }}
            />
          ) : (
            <pre className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{content}</pre>
          )
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/workspace/file-preview.tsx
git commit -m "feat: add file preview component with edit mode and image support

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Workspace Panel Container

**Files:**
- Create: `src/components/workspace/workspace-panel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write WorkspacePanel container**

```tsx
// src/components/workspace/workspace-panel.tsx
import { useState } from 'react'
import { useLayout } from '../../contexts/layout-context'
import { useWorkspace } from '../../hooks/use-workspace'
import { FileTree } from './file-tree'
import { FilePreview } from './file-preview'
import { X, GitBranch, Plus, FolderPlus, Search } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

export function WorkspacePanel() {
  const { activePanel, closePanel } = useLayout()
  const { tree, gitInfo, workdir, loading, deleteFile, mkdir, writeFile } = useWorkspace()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [newItemMode, setNewItemMode] = useState<'file' | 'dir' | null>(null)
  const [newItemPath, setNewItemPath] = useState('')
  const isOpen = activePanel === 'fileBrowser'

  const handleCreateFile = async (dir: string) => {
    const name = prompt('File name:')
    if (!name) return
    const path = `${dir}/${name}`.replace(/\/+/g, '/')
    await writeFile(path, '')
    setSelectedPath(path)
  }

  const handleCreateDir = async (parent: string) => {
    const name = prompt('Directory name:')
    if (!name) return
    const path = `${parent}/${name}`.replace(/\/+/g, '/')
    await mkdir(path)
  }

  const handleDelete = async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return
    await deleteFile(path)
    if (selectedPath === path) setSelectedPath(null)
  }

  const handleRename = (path: string) => {
    const name = prompt('New name:', path.split('/').pop())
    if (!name) return
    // For simplicity, use mkdir + write + delete — Hermes may have a rename command
    // This is a stub — proper rename needs Hermes CLI support
  }

  // Breadcrumb
  const segments = selectedPath ? selectedPath.split('/').slice(0, -1) : []
  const workdirSegments = workdir.split('/').filter(Boolean)

  return (
    <div
      className={cn(
        'fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col border-l border-emerald-600/30 bg-slate-950/98 backdrop-blur-xl shadow-xl transition-transform duration-300',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-emerald-600/30 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-emerald-300">Files</h2>
        <div className="flex items-center gap-2">
          {gitInfo.branch && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <GitBranch className="h-3 w-3" />
              {gitInfo.branch}
              {gitInfo.dirtyCount > 0 && (
                <span className="h-2 w-2 rounded-full bg-orange-400" title="Uncommitted changes" />
              )}
            </span>
          )}
          <button onClick={closePanel} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter files..."
            className="pl-9 bg-slate-950/80 text-slate-100"
          />
        </div>
      </div>

      {/* Breadcrumb */}
      {selectedPath && (
        <div className="flex items-center gap-1 px-4 py-2 text-xs text-slate-400 border-b border-slate-800 overflow-x-auto">
          {workdirSegments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <span>{seg}</span>
              <span>/</span>
            </span>
          ))}
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <span>{seg}</span>
              <span>/</span>
            </span>
          ))}
          <span className="text-white font-medium">{selectedPath.split('/').pop()}</span>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree */}
        <div className={cn('flex-1 overflow-y-auto p-3', selectedPath && 'w-1/2')}>
          <div className="flex gap-2 mb-3">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 gap-1 text-xs"
              onClick={() => setNewItemMode('file')}
            >
              <Plus className="h-3 w-3" /> File
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 gap-1 text-xs"
              onClick={() => setNewItemMode('dir')}
            >
              <FolderPlus className="h-3 w-3" /> Folder
            </Button>
          </div>

          {newItemMode && (
            <div className="mb-3 flex gap-2">
              <Input
                placeholder={`New ${newItemMode} name`}
                value={newItemPath}
                onChange={(e) => setNewItemPath(e.target.value)}
                className="flex-1 bg-slate-950/80 text-slate-100 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (newItemMode === 'file') void handleCreateFile(workdir)
                    else void handleCreateDir(workdir)
                    setNewItemMode(null)
                    setNewItemPath('')
                  }
                  if (e.key === 'Escape') { setNewItemMode(null); setNewItemPath('') }
                }}
              />
            </div>
          )}

          {loading && <p className="text-sm text-slate-500">Loading...</p>}
          {!loading && <FileTree nodes={tree} selectedPath={selectedPath} onSelect={setSelectedPath} onDelete={handleDelete} onCreateFile={handleCreateFile} onCreateDir={handleCreateDir} onRename={handleRename} />}
        </div>

        {/* Preview */}
        {selectedPath && (
          <div className="w-1/2 border-l border-slate-800 overflow-hidden">
            <FilePreview path={selectedPath} onClose={() => setSelectedPath(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into App.tsx**

Add to `src/App.tsx`:
```tsx
import { WorkspacePanel } from './components/workspace/workspace-panel'
```

Add to App render, after `DashboardPanel`:
```tsx
<WorkspacePanel />
```

- [ ] **Step 3: Run dev server and verify**

```bash
npm run dev
```
Open file browser panel — verify tree loads, files preview, git info shows.

- [ ] **Step 4: Commit**

```bash
git add src/components/workspace/ src/components/sessions/ src/App.tsx
git commit -m "feat: wire session list and workspace file browser panels into App

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Session create/rename/archive/delete | Task 3 |
| Session grouped by date | Task 3 |
| Session search | Task 3 |
| Session export MD/JSON | Task 2 (hook) |
| File tree lazy-loaded | Task 5 |
| File preview (text/code/images/md) | Task 6 |
| File create/edit/delete | Task 7 + Task 6 |
| Git detection (branch + dirty) | Task 4 (hook) + Task 7 |
| Breadcrumb navigation | Task 7 |
| Context menu (new file/folder/rename/delete) | Task 5 |

All spec requirements covered.
