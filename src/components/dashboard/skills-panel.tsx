// src/components/dashboard/skills-panel.tsx
import { useState } from 'react'
import { useSkills, type Skill } from '../../hooks/use-dashboard-data'
import { Search, BookOpen } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
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