import clsx from 'clsx'
import {
  ArrowDownUp,
  Bell,
  BellOff,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Download,
  Minus,
  Plus,
  Star,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import {
  useAlertMutations,
  useAlerts,
  useNewListings,
  useWatchlist,
  useWatchlistMutations,
} from '@/api/queries'
import type {
  AlertDirection,
  AlertKind,
  MarketOverview,
  PriceAlertInput,
  Ticker,
} from '@/api/types'
import { BatchFetchDialog } from '@/components/BatchFetchDialog'
import { Button } from '@/components/ui/Button'
import { Label, Select, TextInput } from '@/components/ui/Field'
import { formatCompact, formatListingAge, formatPercent, formatPrice, priceDecimals } from '@/lib/format'
import { useSession } from '@/store/useSession'

type View = 'favorites' | 'new_listings' | 'gainers' | 'losers'
type NewListingSort = 'time' | 'change' | 'volume'

const AGE_PRESETS = [
  { days: 7, label: '7天' },
  { days: 30, label: '30天' },
  { days: 90, label: '90天' },
  { days: 180, label: '半年' },
  { days: 365, label: '1年' },
  { days: 730, label: '2年' },
  { days: 1095, label: '3年' },
] as const

const SORT_OPTIONS: { value: NewListingSort; label: string }[] = [
  { value: 'time', label: '上线时间' },
  { value: 'change', label: '涨跌幅' },
  { value: 'volume', label: '成交量' },
]

interface Props {
  exchange: string
  currentSymbol: string
  overview: MarketOverview | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  refreshIntervalMs: number | null
  onOpen: (symbol: string) => void
}

const VIEWS: { value: View; label: string }[] = [
  { value: 'favorites', label: '收藏' },
  { value: 'new_listings', label: '次新币' },
  { value: 'gainers', label: '涨幅榜' },
  { value: 'losers', label: '跌幅榜' },
]

export function MonitorPanel({
  exchange,
  currentSymbol,
  overview,
  isLoading,
  isError,
  error,
  refreshIntervalMs,
  onOpen,
}: Props) {
  const soundEnabled = useSession((state) => state.monitorSoundEnabled)
  const toggleMonitorSound = useSession((state) => state.toggleMonitorSound)
  const [view, setView] = useState<View>('favorites')
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertKind, setAlertKind] = useState<AlertKind>('price')
  const [alertDirection, setAlertDirection] = useState<AlertDirection>('above')
  const [threshold, setThreshold] = useState('')
  const [ageDays, setAgeDays] = useState(90)
  const [sortBy, setSortBy] = useState<NewListingSort>('time')
  const [batchOpen, setBatchOpen] = useState(false)
  const [listingQuery, setListingQuery] = useState('')
  const { data: watchlist } = useWatchlist()
  const watchlistMutations = useWatchlistMutations()
  const { data: alerts } = useAlerts(exchange)
  const alertMutations = useAlertMutations(exchange)
  const deferredListingQuery = useDeferredValue(listingQuery.trim())
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const rows = overview?.[view] ?? []
  const newListings = useNewListings(exchange, deferredListingQuery, ageDays, sortBy)
  const favoriteIds = useMemo(
    () =>
      new Map(
        (watchlist ?? [])
          .filter((item) => item.exchange === exchange)
          .map((item) => [item.symbol, item.id]),
      ),
    [exchange, watchlist],
  )

  const toggleFavorite = (symbol: string, id?: number) => {
    if (id) watchlistMutations.remove.mutate(id)
    else watchlistMutations.add.mutate({ exchange, symbol })
  }

  useEffect(() => {
    if (view !== 'new_listings') return
    scrollRef.current?.scrollTo({ top: 0 })
  }, [deferredListingQuery, view, ageDays, sortBy])

  useEffect(() => {
    if (view !== 'new_listings') return
    const root = scrollRef.current
    const target = loadMoreRef.current
    if (!root || !target) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (!newListings.hasNextPage || newListings.isFetchingNextPage) return
        void newListings.fetchNextPage()
      },
      { root, rootMargin: '240px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [newListings, view])

  const listingPages = newListings.data?.pages ?? []
  const listingRows = listingPages.flatMap((page) => page.items)
  const listingTotal = listingPages[0]?.total ?? 0
  const listingHasMore = Boolean(newListings.hasNextPage)
  const listingLoading = newListings.isLoading && listingRows.length === 0
  const listingError = newListings.isError ? ((newListings.error as Error)?.message ?? '次新币加载失败') : null
  const listingEmpty = !listingLoading && !listingError && listingRows.length === 0
  const summary = [
    { label: '收藏', value: overview?.favorites.length ?? 0 },
    { label: '次新', value: overview?.new_listings.length ?? 0 },
    { label: '上涨', value: overview?.gainers.length ?? 0 },
    { label: '下跌', value: overview?.losers.length ?? 0 },
  ]

  const createAlert = () => {
    const value = Number(threshold)
    if (!Number.isFinite(value)) return
    const payload: PriceAlertInput = {
      exchange,
      symbol: currentSymbol,
      kind: alertKind,
      direction: alertDirection,
      threshold: value,
    }
    alertMutations.create.mutate(payload, {
      onSuccess: () => {
        setThreshold('')
        setAlertOpen(false)
      },
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="border-b border-edge px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CircleDollarSign className="h-4 w-4 text-ink-muted" />
              盯盘
            </div>
            <p className="mt-1 text-2xs text-ink-muted">
              {exchange.toUpperCase()} · {refreshLabel(refreshIntervalMs)}
            </p>
          </div>
          <Button
            size="icon"
            active={soundEnabled}
            title={soundEnabled ? '关闭声音提醒' : '启用声音提醒'}
            onClick={toggleMonitorSound}
          >
            {soundEnabled ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-4 border-b border-edge">
          {VIEWS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setView(item.value)}
              className={clsx(
                'border-b-2 px-1 py-2 text-2xs transition-colors',
                view === item.value
                  ? 'border-accent font-medium text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-4 divide-x divide-edge border-y border-edge bg-panel-soft">
          {summary.map((item) => (
            <div key={item.label} className="px-2 py-2">
              <div className="text-[0.625rem] text-ink-muted">{item.label}</div>
              <div className="mt-0.5 font-mono text-xs font-semibold text-ink">
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {view === 'new_listings' && (
          <div className="mt-3 space-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <Clock className="h-3 w-3 text-ink-muted" />
              <span className="shrink-0 text-2xs font-medium text-ink-muted">上线时间</span>
              <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
                {AGE_PRESETS.map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => setAgeDays(preset.days)}
                    className={clsx(
                      'shrink-0 rounded-sm px-1.5 py-1 text-2xs transition-colors',
                      ageDays === preset.days
                        ? 'bg-accent/15 text-accent'
                        : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <ArrowDownUp className="h-3 w-3 text-ink-muted" />
              <span className="shrink-0 text-2xs font-medium text-ink-muted">排序</span>
              <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSortBy(opt.value)}
                    className={clsx(
                      'shrink-0 rounded-sm px-1.5 py-1 text-2xs transition-colors',
                      sortBy === opt.value
                        ? 'bg-accent/15 text-accent'
                        : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <TextInput
              value={listingQuery}
              onChange={(event) => setListingQuery(event.target.value)}
              placeholder="搜索交易对，如 BTR、BTCUSDT"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs text-ink-muted">
                已加载 {listingRows.length}
                {listingTotal > 0 && ` / ${listingTotal}`} 个次新合约
              </span>
              <Button
                size="sm"
                title="批量拉取 K 线"
                disabled={listingRows.length === 0}
                onClick={() => setBatchOpen(true)}
              >
                <Download className="h-3 w-3" />
                批量拉取
              </Button>
            </div>
          </div>
        )}

        {view === 'new_listings' && (
          <BatchFetchDialog
            open={batchOpen}
            exchange={exchange}
            tickers={listingRows}
            listingTotal={listingTotal}
            listingQuery={deferredListingQuery}
            listingDays={ageDays}
            listingSort={sortBy}
            onClose={() => setBatchOpen(false)}
          />
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <EmptyState text="正在读取交易所行情…" />}
        {isError && <EmptyState text={(error as Error)?.message ?? '行情加载失败'} error />}
        {view !== 'new_listings' && !isLoading && !isError && rows.length === 0 && (
          <EmptyState text={view === 'favorites' ? '还没有收藏交易对' : '暂无符合条件的合约'} />
        )}
        {view !== 'new_listings' && !isLoading && !isError && rows.length > 0 && (
          <div className="divide-y divide-edge">
            {rows.map((ticker) => (
              <TickerRow
                key={ticker.symbol}
                ticker={ticker}
                favoriteId={favoriteIds.get(ticker.symbol)}
                active={ticker.symbol === currentSymbol}
                showAge={false}
                onOpen={onOpen}
                onToggleFavorite={() => toggleFavorite(ticker.symbol, favoriteIds.get(ticker.symbol))}
              />
            ))}
          </div>
        )}

        {view === 'new_listings' && listingLoading && <EmptyState text="正在读取次新币…" />}
        {view === 'new_listings' && listingError && <EmptyState text={listingError} error />}
        {view === 'new_listings' && listingEmpty && (
          <EmptyState
            text={deferredListingQuery ? '没有匹配的次新币' : '没有符合筛选条件的次新币'}
          />
        )}
        {view === 'new_listings' && !listingLoading && !listingError && listingRows.length > 0 && (
          <div className="divide-y divide-edge">
            {listingRows.map((ticker) => (
              <TickerRow
                key={ticker.symbol}
                ticker={ticker}
                favoriteId={favoriteIds.get(ticker.symbol)}
                active={ticker.symbol === currentSymbol}
                showAge
                onOpen={onOpen}
                onToggleFavorite={() =>
                  toggleFavorite(ticker.symbol, favoriteIds.get(ticker.symbol))
                }
              />
            ))}
            <div ref={loadMoreRef} className="px-3 py-2 text-center text-2xs text-ink-muted">
              {newListings.isFetchingNextPage
                ? '继续加载中…'
                : listingHasMore
                  ? '下滑继续加载更多'
                  : '已经到底了'}
            </div>
          </div>
        )}

        <section className="border-t border-edge px-3 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Bell className="h-3.5 w-3.5 text-ink-muted" />
              当前提醒
            </div>
            <Button size="sm" active={alertOpen} onClick={() => setAlertOpen((value) => !value)}>
              <Plus className="h-3 w-3" /> 新建
            </Button>
          </div>

          {alertOpen && (
            <div className="mt-3 space-y-2 rounded-sm border border-edge bg-panel-soft p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Label>
                  指标
                  <Select
                    value={alertKind}
                    onChange={(event) => setAlertKind(event.target.value as AlertKind)}
                  >
                    <option value="price">最新价格</option>
                    <option value="change_24h">24h 涨跌幅</option>
                  </Select>
                </Label>
                <Label>
                  方向
                  <Select
                    value={alertDirection}
                    onChange={(event) =>
                      setAlertDirection(event.target.value as AlertDirection)
                    }
                  >
                    <option value="above">高于</option>
                    <option value="below">低于</option>
                  </Select>
                </Label>
              </div>
              <Label hint={alertKind === 'change_24h' ? '例如 5 表示 +5%' : undefined}>
                {alertKind === 'change_24h' ? '阈值 (%)' : '阈值'}
                <TextInput
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                  inputMode="decimal"
                  placeholder={alertKind === 'change_24h' ? '5' : '70000'}
                />
              </Label>
              <div className="flex items-center justify-between text-2xs text-ink-muted">
                <span>{currentSymbol}</span>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!threshold || alertMutations.create.isPending}
                  onClick={createAlert}
                >
                  保存提醒
                </Button>
              </div>
            </div>
          )}

          <div className="mt-2 space-y-1.5">
            {(alerts ?? [])
              .filter((alert) => alert.symbol === currentSymbol)
              .map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center gap-2 border-b border-edge px-1 py-2 text-2xs last:border-b-0"
                >
                  {alert.enabled ? (
                    <Bell className="h-3 w-3 text-accent" />
                  ) : (
                    <BellOff className="h-3 w-3 text-ink-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {alert.kind === 'price' ? '价格' : '24h'}{' '}
                    {alert.direction === 'above' ? '≥' : '≤'} {alert.threshold}
                  </span>
                  <Button
                    size="icon"
                    className="h-6 w-6"
                    title={alert.enabled ? '停用' : '重新启用'}
                    onClick={() =>
                      alertMutations.update.mutate({ id: alert.id, enabled: !alert.enabled })
                    }
                  >
                    {alert.enabled ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  </Button>
                  <Button
                    size="icon"
                    className="h-6 w-6"
                    title="删除"
                    onClick={() => alertMutations.remove.mutate(alert.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function refreshLabel(intervalMs: number | null) {
  if (intervalMs === null) return '自动刷新已关闭'
  return `自动刷新 ${intervalMs / 1000} 秒`
}

function TickerRow({
  ticker,
  favoriteId,
  active,
  showAge,
  onOpen,
  onToggleFavorite,
}: {
  ticker: Ticker
  favoriteId?: number
  active: boolean
  showAge: boolean
  onOpen: (symbol: string) => void
  onToggleFavorite: (id?: number) => void
}) {
  const decimals = priceDecimals(ticker.last)
  const positive = ticker.change_24h_pct >= 0
  return (
    <div
      className={clsx(
        'relative flex items-center gap-2 border-b border-edge px-3 py-2.5 transition-colors hover:bg-panel-soft',
        active && 'bg-accent/5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent',
      )}
    >
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(ticker.symbol)}>
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold">{ticker.display}</span>
          {active && <span className="text-[0.625rem] text-accent">当前</span>}
          {showAge && ticker.listed_at !== null && (
            <span className="text-[0.625rem] text-ink-muted">
              {formatListingAge(ticker.listed_at)}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 font-mono text-2xs">
          <span>{formatPrice(ticker.last, decimals)}</span>
          <span className={positive ? 'text-bull' : 'text-bear'}>
            {formatPercent(ticker.change_24h_pct)}
          </span>
          {ticker.volume_24h !== null && (
            <span className="text-ink-muted">{formatCompact(ticker.volume_24h)}</span>
          )}
        </div>
      </button>
      <Button
        size="icon"
        className="h-6 w-6"
        active={favoriteId !== undefined}
        title={favoriteId ? '取消收藏' : '收藏'}
        onClick={() => onToggleFavorite(favoriteId)}
      >
        <Star className="h-3 w-3" fill={favoriteId !== undefined ? 'currentColor' : 'none'} />
      </Button>
      <ChevronRight className="h-3 w-3 text-ink-muted" />
    </div>
  )
}

function EmptyState({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <p className={clsx('px-3 py-8 text-center text-2xs', error ? 'text-bear' : 'text-ink-muted')}>
      {text}
    </p>
  )
}
