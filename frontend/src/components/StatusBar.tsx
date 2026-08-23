import clsx from 'clsx'
import { AlertTriangle, Database, Download, Radio, Timer } from 'lucide-react'

import type { CandleJob, Interval, SeriesMeta } from '@/api/types'
import { formatDuration, formatTimestamp, type Timezone } from '@/lib/format'
import { useEffect, useState } from 'react'

interface Props {
  meta: SeriesMeta | undefined
  count: number
  start: number
  end: number
  interval: Interval
  timezone: Timezone
  loading: boolean
  error: string | null
  progress?: CandleJob | null
}

/** One line that makes the caching behaviour observable while you work. */
export function StatusBar({
  meta,
  count,
  start,
  end,
  interval,
  timezone,
  loading,
  error,
  progress,
}: Props) {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <footer
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge bg-panel
        px-3 py-1.5 font-mono text-2xs text-ink-muted"
    >
      <span className={clsx(loading && 'animate-pulse text-accent')}>
        {loading ? progress?.message ?? '拉取中…' : `${count.toLocaleString()} 根 K 线`}
      </span>

      {loading && progress && progress.pages > 0 && (
        <span className="font-mono text-accent">
          {Math.round(progress.progress * 100)}% · {progress.page}/{progress.pages} 批
        </span>
      )}

      <span>
        {formatTimestamp(start, timezone, interval)} → {formatTimestamp(end, timezone, interval)}
      </span>

      {meta && (
        <>
          <span className="flex items-center gap-1">
            <Database className="h-3 w-3" />
            本地 {meta.from_cache.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            新拉 {meta.fetched.toLocaleString()}
            {meta.gaps_filled > 0 && ` (${meta.gaps_filled} 段缺口)`}
          </span>
          <span className="flex items-center gap-1">
            <Timer className="h-3 w-3" />
            {formatDuration(meta.elapsed_ms)}
          </span>
          {meta.live_bar && (
            <span className="flex items-center gap-1 text-bull">
              <Radio className="h-3 w-3" />
              含未收盘 K 线
            </span>
          )}
          {meta.truncated && (
            <span className="flex items-center gap-1 text-[#f0b90b]">
              <AlertTriangle className="h-3 w-3" />
              区间超出单次上限，已截取最近部分
            </span>
          )}
        </>
      )}

      {error && (
        <span className="flex items-center gap-1 text-bear">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </span>
      )}

      <span className={clsx('ml-auto flex items-center gap-1', online ? 'text-bull' : 'text-bear')}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {online ? '网络正常' : '网络断开'}
      </span>
    </footer>
  )
}
