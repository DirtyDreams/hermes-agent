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

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/sessions/list')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { sessions?: Session[]; error?: string }
      if (data.error) {
        setError(data.error)
        setSessions([])
      } else {
        setSessions(data.sessions ?? [])
      }
    } catch (e) {
      setError(String(e))
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const create = useCallback(async (name?: string): Promise<Session | null> => {
    try {
      const res = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json() as { session?: Session; error?: string }
      if (data.error) throw new Error(data.error)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await reload()
      return data.session ?? null
    } catch (e) {
      setError(String(e))
      return null
    }
  }, [reload])

  const rename = useCallback(async (id: string, title: string): Promise<void> => {
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { error?: string }
      if (data.error) throw new Error(data.error)
      await reload()
    } catch (e) {
      setError(String(e))
    }
  }, [reload])

  const archive = useCallback(async (id: string, archived: boolean): Promise<void> => {
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { error?: string }
      if (data.error) throw new Error(data.error)
      await reload()
    } catch (e) {
      setError(String(e))
    }
  }, [reload])

  const remove = useCallback(async (id: string, hard?: boolean): Promise<void> => {
    try {
      const url = hard ? `/api/sessions/${id}?hard=true` : `/api/sessions/${id}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { error?: string }
      if (data.error) throw new Error(data.error)
      await reload()
    } catch (e) {
      setError(String(e))
    }
  }, [reload])

  const exportSession = useCallback(async (id: string, format?: 'md' | 'json'): Promise<string> => {
    const url = format ? `/api/sessions/${id}/export?format=${format}` : `/api/sessions/${id}/export`
    const res = await fetch(url)
    return res.text()
  }, [])

  const search = useCallback(async (q: string): Promise<Session[]> => {
    const res = await fetch(`/api/sessions/search?q=${encodeURIComponent(q)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { sessions?: Session[]; error?: string }
    if (data.error) throw new Error(data.error)
    return data.sessions ?? []
  }, [])

  return {
    sessions,
    loading,
    error,
    reload,
    create,
    rename,
    archive,
    remove,
    exportSession,
    search,
  }
}
