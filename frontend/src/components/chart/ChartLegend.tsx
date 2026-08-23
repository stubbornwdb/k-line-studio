import clsx from 'clsx'

import type { Candle, Interval } from '@/api/types'
import { formatCompact, formatPercent, formatPrice, formatTimestamp } from '@/lib/format'
import type { Timezone } from '@/lib/format'
import type { OverlayConfig } from '@/lib/indicators'

interface Props {
  symbol: string
  interval: Interval
  exchangeName: string
  bar: Candle | null
  previousClose: number | null
  decimals: number
  timezone: Timezone
  overlays: OverlayConfig[]
}

/** The floating OHLC readout exchanges put in the chart's top-left corner. */
export function ChartLegend({
  symbol,
  interval,
  exchangeName,
  bar,
  previousClose,
  decimals,
  timezone,
  overlays,
}: Props) {
  const change =
    bar && previousClose ? ((bar.c - previousClose) / previousClose) * 100 : bar ? 0 : null
  const up = bar ? bar.c >= bar.o : true

  return (
    <div className="pointer-events-none absolute left-3 top-2 z-10 space-y-1 font-mono text-2xs">
      <div className="pointer-events-auto flex items-center gap-2 font-sans">
        <span className="text-xs font-semibold tracking-tight">{symbol}</span>
        <span className="chip bg-panel-soft text-ink-muted">{interval}</span>
        <span className="text-ink-muted">{exchangeName}</span>
      </div>

      {bar ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <Value label="开" value={formatPrice(bar.o, decimals)} up={up} />
          <Value label="高" value={formatPrice(bar.h, decimals)} up={up} />
          <Value label="低" value={formatPrice(bar.l, decimals)} up={up} />
          <Value label="收" value={formatPrice(bar.c, decimals)} up={up} />
          {change !== null && (
            <span className={clsx(up ? 'text-bull' : 'text-bear')}>{formatPercent(change)}</span>
          )}
          <span className="text-ink-muted">
            量 <span className="text-ink">{formatCompact(bar.v)}</span>
          </span>
          <span className="text-ink-muted">{formatTimestamp(bar.t, timezone, interval)}</span>
        </div>
      ) : (
        <div className="text-ink-muted">移动鼠标查看单根 K 线数据</div>
      )}

      {overlays.length > 0 && (
        <div className="flex items-center gap-3">
          {overlays.map((overlay) => (
            <span key={overlay.id} className="flex items-center gap-1" style={{ color: overlay.color }}>
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: overlay.color }} />
              {overlay.type.toUpperCase()}
              {overlay.period}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Value({ label, value, up }: { label: string; value: string; up: boolean }) {
  return (
    <span className="text-ink-muted">
      {label} <span className={up ? 'text-bull' : 'text-bear'}>{value}</span>
    </span>
  )
}
