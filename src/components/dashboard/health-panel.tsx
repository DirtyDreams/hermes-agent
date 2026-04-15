// src/components/dashboard/health-panel.tsx
import { useHealth, useJobs } from '../../hooks/use-dashboard-data'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { X, Clock, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'

export function HealthPanel() {
  const health = useHealth()
  const { jobs, loading: jobsLoading, refresh, cancel } = useJobs()

  const statusBadge = (status: string) => {
    const icon =
      status === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> :
      status === 'done' ? <CheckCircle className="h-3 w-3" /> :
      status === 'failed' ? <XCircle className="h-3 w-3" /> :
      <Clock className="h-3 w-3" />
    return (
      <Badge className={cn(
        status === 'running' ? 'bg-yellow-500/20 text-yellow-300' :
        status === 'done' ? 'bg-emerald-500/20 text-emerald-300' :
        status === 'failed' ? 'bg-red-500/20 text-red-300' :
        'bg-slate-700 text-slate-300',
      )}>
        {icon} {status}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* System Health */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">System Health</h3>
        {health ? (
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Hermes</span>
              {health.hermesInstalled
                ? <Badge className="bg-emerald-500/20 text-emerald-300">Installed</Badge>
                : <Badge className="bg-red-500/20 text-red-300">Not Found</Badge>}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Version</span>
              <span className="text-sm text-white">{health.version || 'unknown'}</span>
            </div>
            {health.activeModel && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Active Model</span>
                <span className="text-sm text-white">{health.activeModel}</span>
              </div>
            )}
            {health.uptime && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Uptime</span>
                <span className="text-sm text-white">{health.uptime}</span>
              </div>
            )}
            {health.memory && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Memory</span>
                  <span className="text-white">{health.memory}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-emerald-500"
                    style={{ width: health.memory || '0%' }}
                  />
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm text-slate-500">Loading health data...</p>
          </Card>
        )}
      </section>

      {/* Batch Jobs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Batch Jobs</h3>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        {jobsLoading && <p className="text-sm text-slate-400">Loading jobs...</p>}
        {!jobsLoading && jobs.length === 0 && (
          <Card className="p-4">
            <p className="text-sm text-slate-500">No scheduled or running jobs.</p>
          </Card>
        )}
        <div className="space-y-2">
          {jobs.map((job) => (
            <Card key={job.id} className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-medium text-white">{job.id}</p>
                <p className="text-xs text-slate-400">{job.trigger}</p>
                {job.nextRun && <p className="text-xs text-slate-500">Next: {job.nextRun}</p>}
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(job.status)}
                {(job.status === 'running' || job.status === 'scheduled') && (
                  <Button variant="ghost" size="sm" onClick={() => void cancel(job.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}