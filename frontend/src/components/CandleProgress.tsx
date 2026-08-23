import { AlertTriangle, Download, LoaderCircle } from 'lucide-react'

import type { CandleJob } from '@/api/types'

interface Props {
  job: CandleJob | null
}

export function CandleProgress({ job }: Props) {
  if (!job || job.status === 'completed') return null

  const failed = job.status === 'failed'
  const percent = Math.round(job.progress * 100)
  return (
    <div className="border-b border-edge bg-panel-soft px-3 py-2">
      <div className="flex items-center gap-2 text-2xs">
        {failed ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-bear" />
        ) : (
          <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
        )}
        <span className={failed ? 'text-bear' : 'text-ink'}>{job.message}</span>
        <span className="ml-auto font-mono text-ink-muted">{percent}%</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-edge">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            failed ? 'bg-bear' : 'bg-accent'
          }`}
          style={{ width: `${Math.max(failed ? 100 : 3, percent)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-2xs text-ink-muted">
        <span className="font-mono">
          {job.symbol} · {job.interval}
        </span>
        {job.pages > 0 && (
          <span>
            批次 {job.page}/{job.pages}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Download className="h-3 w-3" />
          {job.fetched.toLocaleString()} 根
        </span>
        {job.gaps > 0 && <span>缺口 {job.gap}/{job.gaps}</span>}
        {job.status === 'queued' && <span>排队中</span>}
        {failed && job.error && <span className="truncate">{job.error}</span>}
      </div>
    </div>
  )
}
