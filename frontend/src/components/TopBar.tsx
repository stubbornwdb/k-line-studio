import { CalendarRange, CandlestickChart, PanelRight, Star } from 'lucide-react'
import { useState } from 'react'

import { useExchanges, useWatchlist, useWatchlistMutations } from '@/api/queries'
import type { Interval } from '@/api/types'
import { SymbolPicker } from '@/components/SymbolPicker'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import {
  ALL_INTERVALS,
  QUICK_INTERVALS,
  RANGE_PRESETS,
  toDateInput,
  type ResolvedRange,
} from '@/lib/timeframes'
import { useSession } from '@/store/useSession'

const STRIP_PRESETS = ['1D', '1W', '1M', '3M', '1Y']

interface Props {
  range: ResolvedRange
  estimatedBars: number
}

export function TopBar({ range, estimatedBars }: Props) {
  const session = useSession()
  const { data: exchanges } = useExchanges()
  const { data: watchlist } = useWatchlist()
  const watchlistMutations = useWatchlistMutations()
  const [customOpen, setCustomOpen] = useState(session.rangePreset === 'custom')

  const active = exchanges?.find((item) => item.key === session.exchange)
  const intervals = active?.intervals ?? ALL_INTERVALS
  const favorite = watchlist?.find(
    (item) => item.exchange === session.exchange && item.symbol === session.symbol,
  )

  return (
    <header className="border-b border-edge bg-panel">
      <div className="space-y-2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 pr-2">
            <CandlestickChart className="h-4 w-4 text-accent" />
            <div>
              <div className="text-sm font-semibold leading-none">K-Line Studio</div>
              <div className="mt-0.5 text-2xs text-ink-muted">盯盘 / 复盘 / 收藏</div>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Select
              value={session.exchange}
              onChange={(event) => {
                const key = event.target.value
                const fallback = key === 'okx' ? 'BTC-USDT-SWAP' : 'BTCUSDT'
                session.setMarket(key, fallback)
              }}
              className="w-36"
              aria-label="交易所"
            >
              {(exchanges ?? []).map((exchange) => (
                <option key={exchange.key} value={exchange.key}>
                  {exchange.name}
                </option>
              ))}
            </Select>

            <SymbolPicker
              exchange={session.exchange}
              symbol={session.symbol}
              onSelect={session.setSymbol}
            />
            <Button
              size="icon"
              active={Boolean(favorite)}
              title={favorite ? '取消收藏' : '收藏交易对'}
              disabled={watchlistMutations.add.isPending || watchlistMutations.remove.isPending}
              onClick={() => {
                if (favorite) watchlistMutations.remove.mutate(favorite.id)
                else
                  watchlistMutations.add.mutate({
                    exchange: session.exchange,
                    symbol: session.symbol,
                  })
              }}
            >
              <Star className="h-3.5 w-3.5" fill={favorite ? 'currentColor' : 'none'} />
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2 text-2xs text-ink-muted">
            <span>
              约 <span className="font-mono text-ink">{estimatedBars.toLocaleString()}</span> 根 K 线
            </span>
            <Button
              size="icon"
              active={session.sidebarOpen}
              onClick={session.toggleSidebar}
              title="显示 / 隐藏侧栏"
            >
              <PanelRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-edge/70 pt-2">
          <span className="hidden text-2xs font-medium uppercase tracking-[0.16em] text-ink-muted lg:inline">
            周期
          </span>
          <Segmented
            options={QUICK_INTERVALS.filter((i) => intervals.includes(i)).map((value) => ({
              value,
              label: value,
            }))}
            value={session.interval}
            onChange={(value) => session.setInterval(value)}
          />
          <Select
            value={session.interval}
            onChange={(event) => session.setInterval(event.target.value as Interval)}
            className="w-20"
            aria-label="周期"
          >
            {intervals.map((interval) => (
              <option key={interval} value={interval}>
                {interval}
              </option>
            ))}
          </Select>

          <span className="mx-1 hidden h-5 w-px bg-edge md:block" />

          <Segmented
            options={RANGE_PRESETS.filter((preset) => STRIP_PRESETS.includes(preset.key)).map(
              (preset) => ({ value: preset.key, label: preset.label, title: preset.label }),
            )}
            value={session.rangePreset}
            onChange={(value) => {
              setCustomOpen(false)
              session.setRangePreset(value)
            }}
          />
          <Button
            size="sm"
            active={session.rangePreset === 'custom'}
            onClick={() => {
              setCustomOpen((open) => !open)
              if (session.rangePreset !== 'custom') {
                session.setCustomRange(
                  session.customStart ?? toDateInput(range.start),
                  session.customEnd ?? toDateInput(range.end),
                )
              }
            }}
          >
            <CalendarRange className="h-3 w-3" />
            自定义
          </Button>
        </div>
      </div>

      {customOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-edge bg-panel-soft px-3 py-2">
          <span className="text-2xs text-ink-muted">起始 (UTC)</span>
          <input
            type="date"
            className="field"
            value={session.customStart ?? toDateInput(range.start)}
            onChange={(event) => session.setCustomRange(event.target.value, session.customEnd)}
          />
          <span className="text-2xs text-ink-muted">结束 (UTC)</span>
          <input
            type="date"
            className="field"
            value={session.customEnd ?? toDateInput(range.end)}
            onChange={(event) => session.setCustomRange(session.customStart, event.target.value)}
          />
          <span className="text-2xs text-ink-muted">
            后端会按交易所单次上限自动分批拉取，只补本地缺失的区间
          </span>
        </div>
      )}
    </header>
  )
}
