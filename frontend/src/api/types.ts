/** Wire types -- mirror of the FastAPI schemas. */

export type Interval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '12h'
  | '1d'
  | '1w'

export interface Exchange {
  key: string
  name: string
  market: string
  website: string
  intervals: Interval[]
  max_candles_per_page: number
}

export interface SymbolInfo {
  symbol: string
  display: string
  base: string
  quote: string
  contract_type: string
  price_precision: number | null
  listed_at: number | null
}

export interface SymbolList {
  exchange: string
  count: number
  cached_at: number
  symbols: SymbolInfo[]
}

/** Terse on purpose: a response can carry tens of thousands of bars. */
export interface Candle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
  q: number | null
}

export interface SeriesMeta {
  from_cache: number
  fetched: number
  gaps_filled: number
  live_bar: boolean
  truncated: boolean
  elapsed_ms: number
}

export interface CandleSeries {
  exchange: string
  symbol: string
  interval: Interval
  start: number
  end: number
  count: number
  meta: SeriesMeta
  candles: Candle[]
}

export interface FirstCandle {
  exchange: string
  symbol: string
  interval: Interval
  time: number
}

export type CandleJobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface CandleJob {
  id: string
  status: CandleJobStatus
  exchange: string
  symbol: string
  interval: Interval
  start: number
  end: number
  stage: string
  message: string
  progress: number
  page: number
  pages: number
  fetched: number
  expected: number
  gap: number
  gaps: number
  created_at: number
  updated_at: number
  error: string | null
  result: CandleSeries | null
}

export type NoteKind = 'long' | 'short' | 'observation'

export interface Note {
  id: number
  exchange: string
  symbol: string
  interval: Interval | null
  time_ms: number
  price: number | null
  title: string
  body: string
  kind: NoteKind
  color: string | null
  tags: string[]
  created_at: number
  updated_at: number
}

export interface NoteDraft {
  exchange: string
  symbol: string
  interval: Interval | null
  time_ms: number
  price: number | null
  title: string
  body: string
  kind: NoteKind
  tags: string[]
}

export interface StoredSeries {
  exchange: string
  symbol: string
  interval: Interval
  bars: number
  first_open: number
  last_open: number
}

export interface Ticker {
  symbol: string
  display: string
  last: number
  change_24h_pct: number
  volume_24h: number | null
  high_24h: number | null
  low_24h: number | null
  listed_at: number | null
}

export interface MarketOverview {
  exchange: string
  updated_at: number
  selected: Ticker | null
  favorites: Ticker[]
  new_listings: Ticker[]
  gainers: Ticker[]
  losers: Ticker[]
  triggered_alert_ids: number[]
}

export interface MarketListingPage {
  exchange: string
  query: string
  total: number
  limit: number
  next_cursor: string | null
  has_more: boolean
  items: Ticker[]
}

export interface WatchlistItem {
  id: number
  exchange: string
  symbol: string
  created_at: number
}

export type AlertKind = 'price' | 'change_24h'
export type AlertDirection = 'above' | 'below'

export interface PriceAlert {
  id: number
  exchange: string
  symbol: string
  kind: AlertKind
  direction: AlertDirection
  threshold: number
  enabled: boolean
  triggered_at: number | null
  created_at: number
  updated_at: number
}

export interface PriceAlertInput {
  exchange: string
  symbol: string
  kind: AlertKind
  direction: AlertDirection
  threshold: number
}

export interface BatchJobInput {
  exchange: string
  symbols?: string[]
  intervals?: string[]
  range_days: number
  listing_query?: string
  listing_days?: number
  listing_sort?: 'time' | 'change' | 'volume'
  items?: { symbol: string; interval: string }[]
}

export interface BatchItemStatus {
  symbol: string
  interval: string
  status: CandleJobStatus
  fetched: number
  attempts: number
  error: string | null
}

export interface BatchJob {
  id: string
  status: CandleJobStatus
  exchange: string
  total: number
  completed: number
  failed: number
  items: BatchItemStatus[]
  created_at: number
  updated_at: number
}

export type DrawingKind = 'trendline' | 'horizontal'
export type DrawingStyle = 'solid' | 'dashed'

/** A chart drawing. Anchors are (time, price) so they survive timeframe changes. */
export interface Drawing {
  id: number
  exchange: string
  symbol: string
  /** null = visible on every timeframe */
  interval: Interval | null
  kind: DrawingKind
  /** null for a horizontal line, which spans the full width */
  t1: number | null
  p1: number
  t2: number | null
  p2: number | null
  color: string | null
  width: number
  style: DrawingStyle
  label: string
  created_at: number
  updated_at: number
}

export type DrawingDraft = Omit<Drawing, 'id' | 'created_at' | 'updated_at'>

export type DrawingPatch = Partial<
  Pick<Drawing, 't1' | 'p1' | 't2' | 'p2' | 'color' | 'width' | 'style' | 'label' | 'interval'>
>
