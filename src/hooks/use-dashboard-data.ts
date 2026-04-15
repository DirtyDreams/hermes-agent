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
    setError(null)
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
    setError(null)
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/providers/list')
      .then((r) => r.json())
      .then((d: { providers?: Provider[]; error?: string }) => {
        if (d.error) setError(d.error)
        setProviders(d.providers ?? [])
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { providers, loading, error }
}

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/jobs/list')
      const data = await res.json() as { jobs?: Job[]; error?: string }
      if (data.error) {
        setError(data.error)
        setJobs([])
      } else {
        setJobs(data.jobs ?? [])
      }
    } catch (e) {
      setError(String(e))
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const cancel = useCallback(async (id: string) => {
    await fetch(`/api/jobs/cancel/${id}`, { method: 'POST' })
    await refresh()
  }, [refresh])

  return { jobs, loading, error, refresh, cancel }
}

export function useHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/system/health')
      .then((r) => r.json())
      .then((d: HealthStatus) => { setHealth(d); setError(null) })
      .catch((e) => { setError(String(e)); setHealth(null) })
      .finally(() => setLoading(false))
  }, [])

  return { health, loading, error }
}