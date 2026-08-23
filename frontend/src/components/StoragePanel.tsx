import { Database, Trash2 } from 'lucide-react'

import { useDropSeries, useStoredSeries } from '@/api/queries'
import type { Interval } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { formatTimestamp, type Timezone } from '@/lib/format'

interface Props {
  timezone: Timezone
  onOpen: (exchange: string, symbol: string, interval: Interval) => void
}

/** What the local database already holds -- the cache is a feature, so show it. */
export function StoragePanel({ timezone, onOpen }: Props) {
  const { data, isLoading } = useStoredSeries()
  const drop = useDropSeries()
  const totalBars = (data ?? []).reduce((sum, row) => sum + row.bars, 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
          本地缓存 · {(data ?? []).length} 组
        </span>
        <span className="flex items-center gap-1 font-mono text-2xs text-ink-muted">
          <Database className="h-3 w-3" />
          {totalBars.toLocaleString()} 根
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="px-3 py-4 text-2xs text-ink-muted">读取中…</p>}
        {!isLoading && (data ?? []).length === 0 && (
          <p className="px-3 py-4 text-2xs leading-relaxed text-ink-muted">
            还没有缓存。任何查询过的区间都会写入数据库，下次查询同一区间直接命中本地。
          </p>
        )}

        {(data ?? []).map((row) => (
          <div
            key={`${row.exchange}-${row.symbol}-${row.interval}`}
            className="group flex items-center gap-2 border-b border-edge px-3 py-2 hover:bg-panel-soft"
          >
            <button
              type="button"
              onClick={() => onOpen(row.exchange, row.symbol, row.interval)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-xs font-medium">
                {row.symbol}
                <span className="ml-1.5 text-2xs font-normal text-ink-muted">
                  {row.exchange} · {row.interval}
                </span>
              </p>
              <p className="mt-0.5 font-mono text-2xs text-ink-muted">
                {formatTimestamp(row.first_open, timezone, row.interval)} →{' '}
                {formatTimestamp(row.last_open, timezone, row.interval)}
              </p>
            </button>
            <span className="shrink-0 font-mono text-2xs text-ink-muted">
              {row.bars.toLocaleString()}
            </span>
            <Button
              size="icon"
              variant="danger"
              className="opacity-0 transition group-hover:opacity-100"
              title="删除该缓存"
              disabled={drop.isPending}
              onClick={() =>
                drop.mutate({
                  exchange: row.exchange,
                  symbol: row.symbol,
                  interval: row.interval,
                })
              }
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
