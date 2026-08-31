import type { Interval } from '@/api/types'
import { DAY, HOUR } from './timeframes'

export type Timezone = 'utc' | 'local'

/**
 * Offset applied when handing timestamps to lightweight-charts.
 *
 * The library renders numeric times as UTC, so "show me local time" is
 * implemented by shifting the value. The offset is read per timestamp, which
 * keeps DST boundaries honest across a multi-year window.
 */
export function tzOffsetMs(ms: number, tz: Timezone): number {
  return tz === 'utc' ? 0 : -new Date(ms).getTimezoneOffset() * 60_000
}

/** Price formatting that keeps a symbol's own precision (BTC vs SHIB). */
export function priceDecimals(sample: number, hint?: number | null): number {
  if (hint !== undefined && hint !== null) return Math.min(hint, 8)
  const abs = Math.abs(sample)
  if (abs >= 1000) return 2
  if (abs >= 1) return 3
  if (abs >= 0.01) return 5
  return 8
}

export function formatPrice(value: number, decimals: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

const UNITS = [
  { limit: 1e12, suffix: 'T' },
  { limit: 1e9, suffix: 'B' },
  { limit: 1e6, suffix: 'M' },
  { limit: 1e3, suffix: 'K' },
]

export function formatCompact(value: number): string {
  const abs = Math.abs(value)
  for (const { limit, suffix } of UNITS) {
    if (abs >= limit) return `${(value / limit).toFixed(2)}${suffix}`
  }
  return value.toFixed(2)
}

export function formatPercent(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function formatTimestamp(ms: number, tz: Timezone, interval: Interval): string {
  const shifted = new Date(ms + tzOffsetMs(ms, tz))
  const date = shifted.toISOString().slice(0, 10)
  if (interval === '1d' || interval === '1w') return date
  const time = shifted.toISOString().slice(11, 16)
  return `${date} ${time}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < HOUR) return `${Math.round(ms / 60_000)}min`
  if (ms < DAY) return `${(ms / HOUR).toFixed(1)}h`
  return `${(ms / DAY).toFixed(1)}d`
}

export function formatListingAge(listedAtMs: number): string {
  const days = Math.floor((Date.now() - listedAtMs) / DAY)
  if (days <= 0) return '今天'
  if (days < 30) return `${days}天`
  if (days < 365) return `${Math.floor(days / 30)}个月`
  return `${(days / 365).toFixed(1)}年`
}

export function timezoneLabel(tz: Timezone): string {
  if (tz === 'utc') return 'UTC'
  const offsetMinutes = -new Date().getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const hours = Math.floor(Math.abs(offsetMinutes) / 60)
  const minutes = Math.abs(offsetMinutes) % 60
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`
}
