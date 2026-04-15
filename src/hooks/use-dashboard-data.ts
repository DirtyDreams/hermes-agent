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