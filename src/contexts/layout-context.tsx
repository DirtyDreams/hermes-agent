import { createContext, useContext, useState, type ReactNode } from 'react'

type ActivePanel = 'none' | 'toolActivity' | 'fileBrowser' | 'dashboard'
type SidebarExpanded = 'expanded' | 'collapsed'

type LayoutState = {
  sidebarExpanded: SidebarExpanded
  activePanel: ActivePanel
  openPanel: (panel: ActivePanel) => void
  closePanel: () => void
  toggleSidebar: () => void
}

const LayoutContext = createContext<LayoutState | null>(null)

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarExpanded, setSidebarExpanded] = useState<SidebarExpanded>('expanded')
  const [activePanel, setActivePanel] = useState<ActivePanel>('none')

  const openPanel = (panel: ActivePanel) => setActivePanel(panel)
  const closePanel = () => setActivePanel('none')
  const toggleSidebar = () =>
    setSidebarExpanded((prev) => (prev === 'expanded' ? 'collapsed' : 'expanded'))

  return (
    <LayoutContext.Provider value={{ sidebarExpanded, activePanel, openPanel, closePanel, toggleSidebar }}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider')
  return ctx
}