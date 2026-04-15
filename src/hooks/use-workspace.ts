import { useState, useEffect, useCallback } from 'react'

export type TreeNode = { name: string; path: string; type: 'file' | 'directory'; children?: TreeNode[] }
export type GitInfo = { branch: string; dirtyCount: number; workdir: string }

interface WorkspaceTreeResponse {
  tree: TreeNode[]
  workdir: string
}

interface WorkspaceReadResponse {
  content: string
  mimeType: string
}

interface OkResponse {
  ok: boolean
}

export function useWorkspace() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [workdir, setWorkdir] = useState<string>('')
  const [gitInfo, setGitInfo] = useState<GitInfo>({ branch: '', dirtyCount: 0, workdir: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [treeRes, gitRes] = await Promise.all([
        fetch('/api/workspace/tree'),
        fetch('/api/workspace/git'),
      ])
      if (!treeRes.ok) throw new Error(`HTTP ${treeRes.status}`)
      if (!gitRes.ok) throw new Error(`HTTP ${gitRes.status}`)

      const treeData = await treeRes.json() as WorkspaceTreeResponse
      const gitData = await gitRes.json() as GitInfo

      setTree(treeData.tree)
      setWorkdir(treeData.workdir)
      setGitInfo(gitData)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [treeRes, gitRes] = await Promise.all([
          fetch('/api/workspace/tree', { signal: controller.signal }),
          fetch('/api/workspace/git', { signal: controller.signal }),
        ])
        if (!treeRes.ok) throw new Error(`HTTP ${treeRes.status}`)
        if (!gitRes.ok) throw new Error(`HTTP ${gitRes.status}`)
        const treeData = await treeRes.json() as WorkspaceTreeResponse
        const gitData = await gitRes.json() as GitInfo
        setTree(treeData.tree)
        setWorkdir(treeData.workdir)
        setGitInfo(gitData)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    void run()
    return () => controller.abort()
  }, [])

  const readFile = useCallback(async (path: string): Promise<{ content: string; mimeType: string } | null> => {
    try {
      const res = await fetch(`/api/workspace/read?path=${encodeURIComponent(path)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as WorkspaceReadResponse
      return { content: data.content, mimeType: data.mimeType }
    } catch {
      return null
    }
  }, [])

  const writeFile = useCallback(async (path: string, content: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/workspace/write', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as OkResponse
      if (data.ok) {
        await reload()
        return true
      }
      return false
    } catch {
      return false
    }
  }, [reload])

  const deleteFile = useCallback(async (path: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/workspace/delete?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as OkResponse
      if (data.ok) {
        await reload()
        return true
      }
      return false
    } catch {
      return false
    }
  }, [reload])

  const mkdir = useCallback(async (path: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/workspace/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as OkResponse
      if (data.ok) {
        await reload()
        return true
      }
      return false
    } catch {
      return false
    }
  }, [reload])

  return {
    tree,
    workdir,
    gitInfo,
    loading,
    error,
    reload,
    readFile,
    writeFile,
    deleteFile,
    mkdir,
  }
}