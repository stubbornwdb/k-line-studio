import type { LineData, UTCTimestamp } from 'lightweight-charts'

export interface Point {
  time: UTCTimestamp
  value: number
}

/** Simple moving average. Leading bars without a full window are skipped. */
export function sma(points: Point[], period: number): LineData[] {
  if (period <= 1 || points.length < period) return []
  const out: LineData[] = []
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    sum += points[i].value
    if (i >= period) sum -= points[i - period].value
    if (i >= period - 1) {
      out.push({ time: points[i].time, value: sum / period })
    }
  }
  return out
}

/** Exponential moving average, seeded with the first `period` bars' SMA. */
export function ema(points: Point[], period: number): LineData[] {
  if (period <= 1 || points.length < period) return []
  const k = 2 / (period + 1)
  const out: LineData[] = []
  let seed = 0
  for (let i = 0; i < period; i += 1) seed += points[i].value
  let value = seed / period
  out.push({ time: points[period - 1].time, value })
  for (let i = period; i < points.length; i += 1) {
    value = points[i].value * k + value * (1 - k)
    out.push({ time: points[i].time, value })
  }
  return out
}

export type OverlayType = 'ma' | 'ema'

export interface OverlayConfig {
  id: string
  type: OverlayType
  period: number
  color: string
}

/** Binance-style defaults: three moving averages in warm-to-cool order. */
export const DEFAULT_OVERLAYS: OverlayConfig[] = [
  { id: 'ma7', type: 'ma', period: 7, color: '#f0b90b' },
  { id: 'ma25', type: 'ma', period: 25, color: '#e15fed' },
  { id: 'ma99', type: 'ma', period: 99, color: '#4f9bff' },
]

export function computeOverlay(config: OverlayConfig, points: Point[]): LineData[] {
  return config.type === 'ema' ? ema(points, config.period) : sma(points, config.period)
}
