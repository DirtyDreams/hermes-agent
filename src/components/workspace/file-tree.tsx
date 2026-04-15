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
          <button
            type="button"
            aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
            onClick={() => setExpanded((p) => !p)}
            className="flex-shrink-0"
          >
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
            type="button"
            aria-label="More options"
            aria-expanded={menuOpen}
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