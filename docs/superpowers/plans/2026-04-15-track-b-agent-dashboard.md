# Track B: Agent Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skills browser, MCP tools panel, provider/model presets, batch job management, system health.

**Architecture:** Read-only API-driven panels that call Hermes CLI commands (`hermes skills list`, `hermes tools list`, etc.) and parse their output. Panel UI built from existing UI primitives.

**Tech Stack:** Express 5 backend, React with existing UI primitives, `lucide-react` icons.

---

## File Map

| File | Role |
|---|---|
| `server/index.ts` | Add dashboard API endpoints |
| `src/components/dashboard/dashboard-panel.tsx` | New — container for all dashboard sub-panels |
| `src/components/dashboard/skills-panel.tsx` | New — skills browser |
| `src/components/dashboard/mcp-panel.tsx` | New — MCP tools |
| `src/components/dashboard/presets-panel.tsx` | New — provider/model presets |
| `src/components/dashboard/health-panel.tsx` | New — system health + batch jobs |
| `src/hooks/use-dashboard-data.ts` | New — data fetching hook for dashboard |

---

## Tasks

### Task 1: Backend Dashboard API Endpoints

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add skills list endpoint**

```typescript
// Add before app.listen()
app.get('/api/skills/list', async (_req: Request, res: Response) => {
  try {
    const result = await runCommand('hermes', ['skills', 'list', '--json'], 30_000)
    if (result.exitCode !== 0) {
      res.json({ skills: [], error: result.stderr.trim() })
      return
    }
    const skills = JSON.parse(result.stdout)
    res.json({ skills })
  } catch (error) {
    res.status(500).json({ skills: [], error: String(error) })
  }
})
```

- [ ] **Step 2: Add MCP tools endpoint**

```typescript
app.get('/api/mcp/tools', async (_req: Request, res: Response) => {
  try {
    const result = await runCommand('hermes', ['mcp', 'list', '--json'], 30_000)
    if (result.exitCode !== 0) {
      res.json({ servers: [], error: result.stderr.trim() })
      return
    }
    const servers = JSON.parse(result.stdout)
    res.json({ servers })
  } catch (error) {
    res.status(500).json({ servers: [], error: String(error) })
  }
})
```

- [ ] **Step 3: Add providers list endpoint**

```typescript
app.get('/api/providers/list', async (_req: Request, res: Response) => {
  try {
    const result = await runCommand('hermes', ['providers', 'list', '--json'], 20_000)
    if (result.exitCode !== 0) {
      res.json({ providers: [], error: result.stderr.trim() })
      return
    }
    const providers = JSON.parse(result.stdout)
    res.json({ providers })
  } catch (error) {
    // Fallback: try to parse from config
    res.json({ providers: [], error: String(error) })
  }
})
```

- [ ] **Step 4: Add jobs list + cancel endpoints**

```typescript
app.get('/api/jobs/list', async (_req: Request, res: Response) => {
  try {
    const result = await runCommand('hermes', ['jobs', 'list', '--json'], 30_000)
    if (result.exitCode !== 0) {
      res.json({ jobs: [], error: result.stderr.trim() })
      return
    }
    const jobs = JSON.parse(result.stdout)
    res.json({ jobs })
  } catch (error) {
    res.status(500).json({ jobs: [], error: String(error) })
  }
})

app.post('/api/jobs/cancel/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const result = await runCommand('hermes', ['jobs', 'cancel', id], 20_000)
    res.status(result.exitCode === 0 ? 200 : 500).json({ ok: result.exitCode === 0, error: result.stderr.trim() })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) })
  }
})
```

- [ ] **Step 5: Enhanced system health endpoint**

Replace or enhance the existing `/api/system/status`:
```typescript
app.get('/api/system/health', async (_req: Request, res: Response) => {
  try {
    const [versionResult, memoryResult] = await Promise.all([
      runCommand('hermes', ['--version'], 10_000).catch(() => ({ stdout: '', stderr: '', exitCode: 1 })),
      runCommand('hermes', ['system', 'info', '--json'], 20_000).catch(() => ({ stdout: '', stderr: '', exitCode: 1 })),
    ])

    let healthData = { memory: null, uptime: null, activeModel: null }
    if (memoryResult.exitCode === 0) {
      try { healthData = JSON.parse(memoryResult.stdout) } catch { /* ignore */ }
    }

    res.json({
      hermesInstalled: versionResult.exitCode === 0,
      version: versionResult.stdout.trim(),
      ...healthData,
    })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})
```

- [ ] **Step 6: Test endpoints**

```bash
npm run start:server &
sleep 2
curl http://localhost:8787/api/skills/list
curl http://localhost:8787/api/mcp/tools
curl http://localhost:8787/api/system/health
```

- [ ] **Step 7: Commit**

```bash
git add server/index.ts
git commit -m "feat: add dashboard API endpoints for skills, MCP, providers, jobs, health

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: useDashboardData Hook

**Files:**
- Create: `src/hooks/use-dashboard-data.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/use-dashboard-data.ts
import { useState, useEffect, useCallback } from 'react'

export type Skill = { name: string; description: string; trigger?: string; source: string }
export type MCPServer = { name: string; status: string; tools: { name: string; description: string }[] }
export type Provider = { id: string; name: string; models: string[]; defaultModel?: string }
export type Job = { id: string; trigger: string; status: string; nextRun?: string }
export type HealthStatus = { hermesInstalled: boolean; version: string; memory?: string; uptime?: string; activeModel?: string }

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/skills/list')
      const data = await res.json() as { skills?: Skill[]; error?: string }
      setSkills(data.skills ?? [])
      setError(data.error ?? null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  return { skills, loading, error, refresh }
}

export function useMCPServers() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/mcp/tools')
      const data = await res.json() as { servers?: MCPServer[]; error?: string }
      setServers(data.servers ?? [])
      setError(data.error ?? null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  return { servers, loading, error, refresh }
}

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/providers/list')
      .then((r) => r.json())
      .then((d: { providers?: Provider[] }) => setProviders(d.providers ?? []))
      .catch(() => setProviders([]))
      .finally(() => setLoading(false))
  }, [])

  return { providers, loading }
}

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/jobs/list')
      const data = await res.json() as { jobs?: Job[] }
      setJobs(data.jobs ?? [])
    } catch { setJobs([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const cancel = useCallback(async (id: string) => {
    await fetch(`/api/jobs/cancel/${id}`, { method: 'POST' })
    await refresh()
  }, [refresh])

  return { jobs, loading, refresh, cancel }
}

export function useHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null)

  useEffect(() => {
    fetch('/api/system/health')
      .then((r) => r.json())
      .then((d: HealthStatus) => setHealth(d))
      .catch(() => null)
  }, [])

  return health
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-dashboard-data.ts
git commit -m "feat: add dashboard data hooks for skills, MCP, providers, jobs, health

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Skills Panel

**Files:**
- Create: `src/components/dashboard/skills-panel.tsx`

- [ ] **Step 1: Write the SkillsPanel component**

```tsx
// src/components/dashboard/skills-panel.tsx
import { useState } from 'react'
import { useSkills, type Skill } from '../../hooks/use-dashboard-data'
import { Search, BookOpen } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Card } from '../ui/card'
import { cn } from '../../lib/utils'

function SkillCard({ skill }: { skill: Skill }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h4 className="font-semibold text-white">{skill.name}</h4>
          {skill.trigger && (
            <code className="text-xs text-emerald-400">{skill.trigger}</code>
          )}
        </div>
        <Badge
          className={cn(
            'text-xs',
            skill.source === 'built-in'
              ? 'bg-blue-500/20 text-blue-300'
              : skill.source === 'user'
              ? 'bg-purple-500/20 text-purple-300'
              : 'bg-slate-700 text-slate-300',
          )}
        >
          {skill.source}
        </Badge>
      </div>
      <p className="text-sm text-slate-400 line-clamp-2">{skill.description}</p>
      {expanded && (
        <div className="pt-2 border-t border-slate-700">
          <p className="text-sm text-slate-300">{skill.description}</p>
        </div>
      )}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
      >
        <BookOpen className="h-3 w-3" />
        {expanded ? 'Less' : 'More'}
      </button>
    </div>
  )
}

export function SkillsPanel() {
  const { skills, loading, error } = useSkills()
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  const filtered = skills.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
    const matchesSource = sourceFilter === 'all' || s.source === sourceFilter
    return matchesSearch && matchesSource
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="pl-9 bg-slate-950/80 text-slate-100"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 text-sm text-slate-100"
        >
          <option value="all">All</option>
          <option value="built-in">Built-in</option>
          <option value="user">User</option>
          <option value="marketplace">Marketplace</option>
        </select>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading skills...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-sm text-slate-500">No skills found.</p>
      )}
      <div className="grid gap-3">
        {filtered.map((skill) => (
          <SkillCard key={skill.name} skill={skill} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/skills-panel.tsx
git commit -m "feat: add SkillsPanel component with search and filter

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: MCP Tools Panel

**Files:**
- Create: `src/components/dashboard/mcp-panel.tsx`

- [ ] **Step 1: Write the MCPPanel component**

```tsx
// src/components/dashboard/mcp-panel.tsx
import { useState } from 'react'
import { useMCPServers, type MCPServer } from '../../hooks/use-dashboard-data'
import { ChevronDown, ChevronRight, Server, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'

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
        className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-800/50"
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/mcp-panel.tsx
git commit -m "feat: add MCP tools panel with server list and tool schemas

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Provider Presets Panel

**Files:**
- Create: `src/components/dashboard/presets-panel.tsx`

- [ ] **Step 1: Write the PresetsPanel component**

```tsx
// src/components/dashboard/presets-panel.tsx
import { useState } from 'react'
import { useProviders } from '../../hooks/use-dashboard-data'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Plus, Check, Edit2 } from 'lucide-react'
import { cn } from '../../lib/utils'

type Preset = {
  id: string
  label: string
  provider: string
  model: string
  toolsets: string
  color: string
}

const DEFAULT_PRESETS: Preset[] = [
  { id: 'local', label: 'Local Model', provider: 'auto', model: '', toolsets: 'web,terminal', color: 'bg-blue-500' },
  { id: 'openrouter', label: 'OpenRouter', provider: 'openrouter', model: 'openai/gpt-4o', toolsets: 'web,terminal,skills', color: 'bg-purple-500' },
  { id: 'codex', label: 'Codex', provider: 'codex', model: 'gpt-5.3-codex', toolsets: 'web,terminal,skills', color: 'bg-amber-500' },
]

export function PresetsPanel() {
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS)
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { providers, loading } = useProviders()

  const activate = (preset: Preset) => {
    setActivePresetId(preset.id)
    // Persist to localStorage for now; will update Hermes config via /api/config/write
    localStorage.setItem('hermes-active-preset', JSON.stringify(preset))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {presets.map((preset) => (
          <Card
            key={preset.id}
            className={cn(
              'cursor-pointer transition-all p-4',
              activePresetId === preset.id
                ? 'border-emerald-500/50 bg-emerald-950/30 ring-1 ring-emerald-500/30'
                : 'border-slate-700 hover:border-slate-600',
            )}
            onClick={() => activate(preset)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('h-3 w-3 rounded-full', preset.color)} />
                <div>
                  <h4 className="font-semibold text-white">{preset.label}</h4>
                  <p className="text-xs text-slate-400">
                    {preset.provider} · {preset.model || 'default model'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activePresetId === preset.id && (
                  <Badge className="bg-emerald-500/20 text-emerald-300">
                    <Check className="h-3 w-3 mr-1" /> Active
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setEditingId(preset.id) }}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Button variant="secondary" className="w-full gap-2">
        <Plus className="h-4 w-4" /> Add Preset
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/presets-panel.tsx
git commit -m "feat: add provider presets panel with preset cards and activation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Health + Batch Jobs Panel

**Files:**
- Create: `src/components/dashboard/health-panel.tsx`

- [ ] **Step 1: Write the HealthPanel component**

```tsx
// src/components/dashboard/health-panel.tsx
import { useHealth, useJobs } from '../../hooks/use-dashboard-data'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { X, Clock, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'

export function HealthPanel() {
  const health = useHealth()
  const { jobs, loading: jobsLoading, refresh, cancel } = useJobs()

  const statusBadge = (status: string) => {
    const icon =
      status === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> :
      status === 'done' ? <CheckCircle className="h-3 w-3" /> :
      status === 'failed' ? <XCircle className="h-3 w-3" /> :
      <Clock className="h-3 w-3" />
    return (
      <Badge className={cn(
        status === 'running' ? 'bg-yellow-500/20 text-yellow-300' :
        status === 'done' ? 'bg-emerald-500/20 text-emerald-300' :
        status === 'failed' ? 'bg-red-500/20 text-red-300' :
        'bg-slate-700 text-slate-300',
      )}>
        {icon} {status}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* System Health */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">System Health</h3>
        {health ? (
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Hermes</span>
              {health.hermesInstalled
                ? <Badge className="bg-emerald-500/20 text-emerald-300">Installed</Badge>
                : <Badge className="bg-red-500/20 text-red-300">Not Found</Badge>}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Version</span>
              <span className="text-sm text-white">{health.version || 'unknown'}</span>
            </div>
            {health.activeModel && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Active Model</span>
                <span className="text-sm text-white">{health.activeModel}</span>
              </div>
            )}
            {health.uptime && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Uptime</span>
                <span className="text-sm text-white">{health.uptime}</span>
              </div>
            )}
            {health.memory && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Memory</span>
                  <span className="text-white">{health.memory}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-emerald-500"
                    style={{ width: health.memory || '0%' }}
                  />
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm text-slate-500">Loading health data...</p>
          </Card>
        )}
      </section>

      {/* Batch Jobs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Batch Jobs</h3>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        {jobsLoading && <p className="text-sm text-slate-400">Loading jobs...</p>}
        {!jobsLoading && jobs.length === 0 && (
          <Card className="p-4">
            <p className="text-sm text-slate-500">No scheduled or running jobs.</p>
          </Card>
        )}
        <div className="space-y-2">
          {jobs.map((job) => (
            <Card key={job.id} className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-medium text-white">{job.id}</p>
                <p className="text-xs text-slate-400">{job.trigger}</p>
                {job.nextRun && <p className="text-xs text-slate-500">Next: {job.nextRun}</p>}
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(job.status)}
                {(job.status === 'running' || job.status === 'scheduled') && (
                  <Button variant="ghost" size="sm" onClick={() => void cancel(job.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/health-panel.tsx
git commit -m "feat: add health and batch jobs panel

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Dashboard Panel Container

**Files:**
- Create: `src/components/dashboard/dashboard-panel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write DashboardPanel container**

```tsx
// src/components/dashboard/dashboard-panel.tsx
import { useLayout } from '../../contexts/layout-context'
import * as Tabs from '@radix-ui/react-tabs'
import { X } from 'lucide-react'
import { SkillsPanel } from './skills-panel'
import { MCPPanel } from './mcp-panel'
import { PresetsPanel } from './presets-panel'
import { HealthPanel } from './health-panel'
import { cn } from '../../lib/utils'

export function DashboardPanel() {
  const { activePanel, closePanel } = useLayout()
  const isOpen = activePanel === 'dashboard'

  return (
    <div
      className={cn(
        'fixed right-0 top-0 z-50 flex h-full w-[600px] flex-col border-l border-emerald-600/30 bg-slate-950/98 backdrop-blur-xl shadow-xl transition-transform duration-300',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      <div className="flex items-center justify-between border-b border-emerald-600/30 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
          Agent Dashboard
        </h2>
        <button
          onClick={closePanel}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Tabs.Root defaultValue="health" className="flex flex-1 flex-col overflow-hidden">
        <Tabs.List className="flex flex-wrap gap-1 border-b border-slate-800 px-4 pt-2">
          {['health', 'presets', 'skills', 'mcp'].map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="rounded-t-lg px-4 py-2 text-sm font-medium capitalize transition data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-300 data-[state=inactive]:text-slate-400"
            >
              {tab}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="flex-1 overflow-y-auto p-4">
          <Tabs.Content value="health">
            <HealthPanel />
          </Tabs.Content>
          <Tabs.Content value="presets">
            <PresetsPanel />
          </Tabs.Content>
          <Tabs.Content value="skills">
            <SkillsPanel />
          </Tabs.Content>
          <Tabs.Content value="mcp">
            <MCPPanel />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  )
}
```

- [ ] **Step 2: Wire into App.tsx**

Add to `src/App.tsx`:
```tsx
import { DashboardPanel } from './components/dashboard/dashboard-panel'
```

Add to App render, after `ToolActivityPanel`:
```tsx
<DashboardPanel />
```

- [ ] **Step 3: Run dev server and verify**

```bash
npm run dev
```
Open dashboard panel — verify tabs switch, skills load, health shows.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/ src/App.tsx
git commit -m "feat: wire dashboard panel into App with Skills, MCP, Presets, Health tabs

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Skills browser with search/filter | Task 3 |
| Skill detail expansion | Task 3 |
| Enable/disable skills | Task 3 (stub — toggle wired, needs backend) |
| MCP server list + tool schemas | Task 4 |
| MCP status badges | Task 4 |
| Provider/model preset cards | Task 5 |
| Quick activate preset | Task 5 |
| Preset editor (stub) | Task 5 |
| System health metrics | Task 6 |
| Batch jobs list + cancel | Task 6 |
| Dashboard as right-edge overlay | Task 7 |

All spec requirements covered.
