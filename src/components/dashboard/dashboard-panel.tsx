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
          type="button"
          onClick={closePanel}
          aria-label="Close dashboard panel"
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Tabs.Root defaultValue="health" aria-label="Agent Dashboard sections" className="flex flex-1 flex-col overflow-hidden">
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