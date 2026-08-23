/** React Query bindings. One hook per resource, keys centralised below. */

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import type {
  CandleSeries,
  CandleJob,
  Drawing,
  DrawingDraft,
  DrawingPatch,
  Exchange,
  Interval,
  Note,
  NoteDraft,
  StoredSeries,
  SymbolList,
  MarketOverview,
  PriceAlert,
  PriceAlertInput,
  WatchlistItem,
} from './types'

export const queryKeys = {
  exchanges: ['exchanges'] as const,
  symbols: (exchange: string) => ['symbols', exchange] as const,
  candles: (
    exchange: string,
    symbol: string,
    interval: Interval,
    start: number,
    end: number,
  ) => ['candles', exchange, symbol, interval, start, end] as const,
  notes: (exchange: string, symbol: string) => ['notes', exchange, symbol] as const,
  drawings: (exchange: string, symbol: string) => ['drawings', exchange, symbol] as const,
  storage: ['storage'] as const,
  watchlist: ['watchlist'] as const,
  market: (exchange: string, symbol?: string) => ['market', exchange, symbol ?? ''] as const,
  alerts: (exchange: string, symbol?: string) => ['alerts', exchange, symbol ?? 'all'] as const,
}

export function useExchanges() {
  return useQuery({
    queryKey: queryKeys.exchanges,
    queryFn: () => api.get<Exchange[]>('/exchanges'),
    staleTime: Infinity,
  })
}

export function useSymbols(exchange: string | undefined) {
  return useQuery({
    queryKey: queryKeys.symbols(exchange ?? ''),
    queryFn: () => api.get<SymbolList>(`/exchanges/${exchange}/symbols`),
    enabled: Boolean(exchange),
    staleTime: 10 * 60 * 1000,
  })
}

interface CandleArgs {
  exchange: string
  symbol: string
  interval: Interval
  start: number
  end: number
  /** Poll the newest bar while the window ends "now". */
  live?: boolean
  refreshIntervalMs?: number | null
}

export function useCandles({
  exchange,
  symbol,
  interval,
  start,
  end,
  live,
  refreshIntervalMs,
}: CandleArgs) {
  const [progress, setProgress] = useState<CandleJob | null>(null)
  useEffect(() => {
    setProgress(null)
  }, [exchange, symbol, interval, start, end])

  const query = useQuery({
    queryKey: queryKeys.candles(exchange, symbol, interval, start, end),
    queryFn: () =>
      waitForCandleJob(
        { exchange, symbol, interval, start, end },
        setProgress,
      ),
    enabled: Boolean(exchange && symbol),
    // Cached bars come back in milliseconds; keep them around while panning.
    staleTime: live ? 0 : 5 * 60 * 1000,
    refetchInterval: live && refreshIntervalMs ? refreshIntervalMs : false,
    placeholderData: (previous) => previous,
    retry: 1,
  })
  return { ...query, progress }
}

export function useRefreshCandles() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (args: Omit<CandleArgs, 'live'>) =>
      waitForCandleJob({ ...args, refresh: true }),
    onSuccess: (data, args) => {
      client.setQueryData(
        queryKeys.candles(args.exchange, args.symbol, args.interval, args.start, args.end),
        data,
      )
      void client.invalidateQueries({ queryKey: queryKeys.storage })
    },
  })
}

async function waitForCandleJob(
  args: Omit<CandleArgs, 'live'> & { refresh?: boolean },
  onProgress?: (job: CandleJob) => void,
): Promise<CandleSeries> {
  const first = await api.post<CandleJob>('/candle-jobs', args)
  onProgress?.(first)
  let current = first
  while (current.status === 'queued' || current.status === 'running') {
    await new Promise((resolve) => window.setTimeout(resolve, 450))
    current = await api.get<CandleJob>(`/candle-jobs/${current.id}`)
    onProgress?.(current)
  }
  if (current.status === 'failed') {
    throw new Error(current.error || current.message || 'K 线加载失败')
  }
  if (!current.result) {
    throw new Error('K 线任务完成但没有返回数据')
  }
  return current.result
}

export function useNotes(exchange: string, symbol: string) {
  return useQuery({
    queryKey: queryKeys.notes(exchange, symbol),
    queryFn: () => api.get<Note[]>('/notes', { exchange, symbol, limit: 2000 }),
    enabled: Boolean(exchange && symbol),
  })
}

export function useNoteMutations(exchange: string, symbol: string) {
  const client = useQueryClient()
  const invalidate = () =>
    void client.invalidateQueries({ queryKey: queryKeys.notes(exchange, symbol) })

  const create = useMutation({
    mutationFn: (draft: NoteDraft) => api.post<Note>('/notes', draft),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, ...patch }: Partial<NoteDraft> & { id: number }) =>
      api.patch<Note>(`/notes/${id}`, patch),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/notes/${id}`),
    onSuccess: invalidate,
  })

  return { create, update, remove }
}

export function useStoredSeries() {
  return useQuery({
    queryKey: queryKeys.storage,
    queryFn: () => api.get<StoredSeries[]>('/storage/series'),
    staleTime: 30 * 1000,
  })
}

export function useDropSeries() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (args: { exchange: string; symbol: string; interval?: Interval }) =>
      api.delete<{ deleted: number }>('/storage/series', args),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.storage })
      void client.invalidateQueries({ queryKey: ['candles'] })
    },
  })
}

export function useWatchlist() {
  return useQuery({
    queryKey: queryKeys.watchlist,
    queryFn: () => api.get<WatchlistItem[]>('/watchlist'),
    staleTime: 30 * 1000,
  })
}

export function useWatchlistMutations() {
  const client = useQueryClient()
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: queryKeys.watchlist })
    void client.invalidateQueries({ queryKey: ['market'] })
  }
  const add = useMutation({
    mutationFn: (payload: { exchange: string; symbol: string }) =>
      api.post<WatchlistItem>('/watchlist', payload),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/watchlist/${id}`),
    onSuccess: invalidate,
  })
  return { add, remove }
}

export function useMarketOverview(
  exchange: string,
  symbol?: string,
  refreshIntervalMs?: number | null,
) {
  const refetchInterval = refreshIntervalMs === null ? false : refreshIntervalMs ?? 15_000
  return useQuery({
    queryKey: queryKeys.market(exchange, symbol),
    queryFn: () => api.get<MarketOverview>('/market/overview', { exchange, symbol }),
    enabled: Boolean(exchange && symbol),
    refetchInterval,
    staleTime: 5_000,
    retry: 1,
  })
}

export function useAlerts(exchange: string, symbol?: string) {
  return useQuery({
    queryKey: queryKeys.alerts(exchange, symbol),
    queryFn: () => api.get<PriceAlert[]>('/alerts', { exchange, symbol }),
    enabled: Boolean(exchange),
  })
}

export function useAlertMutations(exchange: string, symbol?: string) {
  const client = useQueryClient()
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: queryKeys.alerts(exchange) })
    void client.invalidateQueries({ queryKey: queryKeys.market(exchange) })
  }
  const create = useMutation({
    mutationFn: (payload: PriceAlertInput) => api.post<PriceAlert>('/alerts', payload),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, ...patch }: Partial<PriceAlertInput> & { id: number; enabled?: boolean }) =>
      api.patch<PriceAlert>(`/alerts/${id}`, patch),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/alerts/${id}`),
    onSuccess: invalidate,
  })
  return { create, update, remove, symbol }
}

export function useDrawings(exchange: string, symbol: string) {
  return useQuery({
    queryKey: queryKeys.drawings(exchange, symbol),
    queryFn: () => api.get<Drawing[]>('/drawings', { exchange, symbol, limit: 2000 }),
    enabled: Boolean(exchange && symbol),
  })
}

/**
 * Drawing writes patch the cache directly instead of refetching: dragging a
 * trend line's endpoint commits on pointer-up, and a round trip through a
 * refetch would make the line visibly jump back before settling.
 */
export function useDrawingMutations(exchange: string, symbol: string) {
  const client = useQueryClient()
  const key = queryKeys.drawings(exchange, symbol)
  const patchCache = (update: (current: Drawing[]) => Drawing[]) =>
    client.setQueryData<Drawing[]>(key, (current) => update(current ?? []))

  const create = useMutation({
    mutationFn: (draft: DrawingDraft) => api.post<Drawing>('/drawings', draft),
    onSuccess: (created) => patchCache((current) => [...current, created]),
  })

  const update = useMutation({
    mutationFn: ({ id, ...patch }: DrawingPatch & { id: number }) =>
      api.patch<Drawing>(`/drawings/${id}`, patch),
    onSuccess: (saved) =>
      patchCache((current) => current.map((item) => (item.id === saved.id ? saved : item))),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/drawings/${id}`),
    onSuccess: (_result, id) => patchCache((current) => current.filter((item) => item.id !== id)),
  })

  const clear = useMutation({
    mutationFn: () => api.delete<{ deleted: number }>('/drawings', { exchange, symbol }),
    onSuccess: () => patchCache(() => []),
  })

  return { create, update, remove, clear }
}
