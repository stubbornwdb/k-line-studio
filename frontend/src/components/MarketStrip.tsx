import { Activity, BarChart3, Clock3, TrendingDown, TrendingUp } from 'lucide-react'

import type { Ticker } from '@/api/types'
import { formatCompact, formatPercent, formatPrice, priceDecimals } from '@/lib/format'

interface Props {
  symbol: string
  ticker: Ticker | null | undefined
  fallbackPrice: number | null
  updatedAt?: number
}

export function MarketStrip({ symbol, ticker, fallbackPrice, updatedAt }: Props) {
  const price = ticker?.last ?? fallbackPrice
  const positive = (ticker?.change_24h_pct ?? 0) >= 0
  const decimals = priceDecimals(price ?? 0)

  return (
    <div className="grid grid-cols-2 border-b border-edge bg-panel-soft sm:grid-cols-3 lg:grid-cols-6">
      <Metric label={symbol} value={price === null ? '--' : formatPrice(price, decimals)} lead />
      <Metric
        label="24H 涨跌"
        value={ticker ? formatPercent(ticker.change_24h_pct) : '--'}
        tone={ticker ? (positive ? 'bull' : 'bear') : undefined}
        icon={ticker ? (positive ? TrendingUp : TrendingDown) : Activity}
      />
      <Metric label="24H 高" value={ticker?.high_24h == null ? '--' : formatPrice(ticker.high_24h, decimals)} />
      <Metric label="24H 低" value={ticker?.low_24h == null ? '--' : formatPrice(ticker.low_24h, decimals)} />
      <Metric label="成交额" value={ticker?.volume_24h == null ? '--' : formatCompact(ticker.volume_24h)} icon={BarChart3} />
      <Metric
        label="行情状态"
        value={updatedAt ? `更新 ${new Date(updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '等待行情'}
        icon={Clock3}
      />
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
  icon: Icon,
  lead = false,
}: {
  label: string
  value: string
  tone?: 'bull' | 'bear'
  icon?: typeof Activity
  lead?: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-r border-b border-edge bg-panel px-4 py-2.5 last:border-r-0 lg:border-b-0">
      {Icon && (
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${
            tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : 'text-ink-muted'
          }`}
        />
      )}
      <div className="min-w-0">
        <div className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-ink-muted">
          {label}
        </div>
        <div
          className={`truncate font-mono ${lead ? 'text-base font-semibold' : 'text-xs'} ${
            tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : 'text-ink'
          }`}
        >
          {value}
        </div>
      </div>
    </div>
  )
}
