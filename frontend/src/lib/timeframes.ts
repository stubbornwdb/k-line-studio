import type { Interval } from '@/api/types'

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export const INTERVAL_MS: Record<Interval, number> = {
  '1m': MINUTE,
  '3m': 3 * MINUTE,
  '5m': 5 * MINUTE,
  '15m': 15 * MINUTE,
  '30m': 30 * MINUTE,
  '1h': HOUR,
  '2h': 2 * HOUR,
  '4h': 4 * HOUR,
  '6h': 6 * HOUR,
  '12h': 12 * HOUR,
  '1d': DAY,
  '1w': 7 * DAY,
}

/** Shown as a flat row of buttons, like an exchange's timeframe strip. */
export const QUICK_INTERVALS: Interval[] = ['5m', '15m', '1h', '4h', '1d']
export const ALL_INTERVALS: Interval[] = Object.keys(INTERVAL_MS) as Interval[]

export interface RangePreset {
  key: string
  label: string
  ms: number
}

export const RANGE_PRESETS: RangePreset[] = [
  { key: '1D', label: '1天', ms: DAY },
  { key: '3D', label: '3天', ms: 3 * DAY },
  { key: '1W', label: '1周', ms: 7 * DAY },
  { key: '1M', label: '1月', ms: 30 * DAY },
  { key: '3M', label: '3月', ms: 90 * DAY },
  { key: '6M', label: '6月', ms: 180 * DAY },
  { key: '1Y', label: '1年', ms: 365 * DAY },
  { key: '3Y', label: '3年', ms: 3 * 365 * DAY },
]

export interface ResolvedRange {
  start: number
  end: number
  /** True when the window runs up to "now", i.e. the last bar is still forming. */
  live: boolean
}

/**
 * Turn the UI selection into an absolute window.
 *
 * Preset ranges are anchored to the current bar so the query key stays stable
 * between renders (and cache hits actually happen): `end` is snapped to the
 * open of the forming bar.
 */
export function resolveRange(
  preset: string,
  interval: Interval,
  custom: { start?: string; end?: string },
  now = Date.now(),
): ResolvedRange {
  if (preset === 'custom') {
    const start = parseDateInput(custom.start)
    const end = parseDateInput(custom.end, true)
    if (start !== undefined && end !== undefined && end > start) {
      return { start, end, live: end >= now - INTERVAL_MS[interval] }
    }
  }

  const step = INTERVAL_MS[interval]
  const end = Math.floor(now / step) * step
  const span = RANGE_PRESETS.find((p) => p.key === preset)?.ms ?? 30 * DAY
  return { start: end - span, end: end + step - 1, live: true }
}

/** `2024-03-05` (a date input) is read as UTC midnight; `end` gets end-of-day. */
export function parseDateInput(value: string | undefined, endOfDay = false): number | undefined {
  if (!value) return undefined
  const hasTime = value.includes('T')
  const parsed = Date.parse(hasTime ? `${value}Z` : `${value}T00:00:00Z`)
  if (Number.isNaN(parsed)) return undefined
  return endOfDay && !hasTime ? parsed + DAY - 1 : parsed
}

export function toDateInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function toDateTimeInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16)
}

/** Bars a window would contain -- used to warn before a giant request. */
export function estimateBars(start: number, end: number, interval: Interval): number {
  return Math.max(0, Math.floor((end - start) / INTERVAL_MS[interval]) + 1)
}
