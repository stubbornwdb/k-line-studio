import { Pause, Play, RefreshCw, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import type { RefreshInterval } from '@/store/useSession'

const OPTIONS: { value: RefreshInterval | null; label: string }[] = [
  { value: 5000, label: '5 秒' },
  { value: 10000, label: '10 秒' },
  { value: 15000, label: '15 秒' },
  { value: 30000, label: '30 秒' },
  { value: 60000, label: '60 秒' },
  { value: null, label: '关闭' },
]

interface Props {
  intervalMs: RefreshInterval | null
  lastUpdatedAt: number
  live: boolean
  loading: boolean
  onIntervalChange: (value: RefreshInterval | null) => void
  onRefresh: () => void
}

export function RefreshControl({
  intervalMs,
  lastUpdatedAt,
  live,
  loading,
  onIntervalChange,
  onRefresh,
}: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  const active = live && intervalMs !== null
  const remaining = active
    ? Math.max(0, Math.ceil((lastUpdatedAt + intervalMs - now) / 1000))
    : null

  return (
    <div className="flex items-center gap-1 rounded border border-edge bg-panel-soft pl-2">
      <Timer className="h-3.5 w-3.5 text-accent" />
      <span className="hidden text-2xs text-ink-muted sm:inline">
        {active ? (loading ? '刷新中' : `${remaining}s`) : live ? '已暂停' : '历史区间'}
      </span>
      <Select
        aria-label="自动刷新频率"
        value={intervalMs === null ? 'off' : String(intervalMs)}
        onChange={(event) => {
          const value = event.target.value
          onIntervalChange(value === 'off' ? null : (Number(value) as RefreshInterval))
        }}
        className="h-7 w-[4.6rem] border-0 bg-transparent px-1 text-2xs focus:ring-0"
      >
        {OPTIONS.map((option) => (
          <option key={option.value ?? 'off'} value={option.value ?? 'off'}>
            {option.label}
          </option>
        ))}
      </Select>
      <Button
        size="icon"
        className="h-7 w-7 rounded-l-none"
        title={active ? '暂停自动刷新' : '启用自动刷新'}
        onClick={() => onIntervalChange(active ? null : 15000)}
      >
        {active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </Button>
      <Button
        size="icon"
        className="h-7 w-7"
        disabled={loading}
        title="立即刷新"
        onClick={onRefresh}
      >
        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  )
}
