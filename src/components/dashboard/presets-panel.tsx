// src/components/dashboard/presets-panel.tsx
import { useState } from 'react'
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
  const savedPreset = localStorage.getItem('hermes-active-preset')
const savedPresetId = savedPreset ? JSON.parse(savedPreset).id : null
const [activePresetId, setActivePresetId] = useState<string | null>(savedPresetId)

  const activate = (preset: Preset) => {
    setActivePresetId(preset.id)
    try {
      localStorage.setItem('hermes-active-preset', JSON.stringify(preset))
    } catch {
      // localStorage unavailable (private mode, quota exceeded)
    }
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
                  onClick={(e) => { e.stopPropagation(); }}
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