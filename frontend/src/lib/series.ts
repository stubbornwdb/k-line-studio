/**
 * Bar-index <-> timestamp conversions.
 *
 * lightweight-charts positions everything by *logical index* (bars are evenly
 * spaced regardless of the gaps between them), while drawings are anchored to
 * *timestamps* so that a line drawn on 1h lands on the same spot on 4h. These
 * helpers translate between the two, extrapolating past both ends of the data
 * so a line stays geometrically correct while panning beyond the last bar.
 */

import type { Candle } from '@/api/types'

/** Index of the last bar opening at or before `ms`; -1 when out of range. */
export function snapToBar(candles: Candle[], ms: number): number {
  if (candles.length === 0 || ms < candles[0].t) return -1
  let low = 0
  let high = candles.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (candles[mid].t <= ms) low = mid
    else high = mid - 1
  }
  return low
}

/** Timestamp -> fractional logical index. */
export function msToLogical(candles: Candle[], step: number, ms: number): number {
  if (candles.length === 0) return 0
  const firstT = candles[0].t
  const lastIndex = candles.length - 1
  const lastT = candles[lastIndex].t

  if (ms <= firstT) return (ms - firstT) / step
  if (ms >= lastT) return lastIndex + (ms - lastT) / step

  const index = snapToBar(candles, ms)
  const barT = candles[index].t
  // Interpolate against the *next stored bar*, not `step`: exchanges skip bars
  // with no trades, and a line crossing such a gap should still look straight.
  const nextT = index + 1 <= lastIndex ? candles[index + 1].t : barT + step
  const span = nextT - barT || step
  return index + (ms - barT) / span
}

/** Fractional logical index -> timestamp. */
export function logicalToMs(candles: Candle[], step: number, logical: number): number {
  if (candles.length === 0) return 0
  const lastIndex = candles.length - 1

  if (logical <= 0) return Math.round(candles[0].t + logical * step)
  if (logical >= lastIndex) return Math.round(candles[lastIndex].t + (logical - lastIndex) * step)

  const index = Math.floor(logical)
  const fraction = logical - index
  const barT = candles[index].t
  const nextT = candles[index + 1].t
  return Math.round(barT + (nextT - barT) * fraction)
}

export interface MoveStats {
  /** Price difference, signed. */
  absolute: number
  /** Percentage change relative to the first anchor. */
  percent: number
  /** Distance in bars (what a chart actually shows). */
  bars: number
  /** Wall-clock span. */
  durationMs: number
  up: boolean
}

/** The numbers TradingView's measure tool puts on screen. */
export function measureMove(
  from: { t: number; p: number },
  to: { t: number; p: number },
  candles: Candle[],
  step: number,
): MoveStats {
  const absolute = to.p - from.p
  return {
    absolute,
    percent: from.p === 0 ? 0 : (absolute / Math.abs(from.p)) * 100,
    bars: Math.abs(
      Math.round(msToLogical(candles, step, to.t) - msToLogical(candles, step, from.t)),
    ),
    durationMs: Math.abs(to.t - from.t),
    up: absolute >= 0,
  }
}
