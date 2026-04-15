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
    // stub — proper rename needs Hermes CLI support
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
          <button onClick={closePanel} type="button" aria-label="Close file browser" className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
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