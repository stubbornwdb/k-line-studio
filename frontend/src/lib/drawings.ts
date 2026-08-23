/** Drawing-tool constants and hit testing. */

import type { DrawingKind } from '@/api/types'

export type ChartTool = 'none' | 'note' | 'trendline' | 'horizontal' | 'measure'

/** Tools that place a shape; `note` and `measure` are handled separately. */
export const SHAPE_TOOLS: Record<'trendline' | 'horizontal', DrawingKind> = {
  trendline: 'trendline',
  horizontal: 'horizontal',
}

/** How many clicks a tool needs before it commits. */
export const TOOL_CLICKS: Record<ChartTool, number> = {
  none: 0,
  note: 1,
  horizontal: 1,
  trendline: 2,
  measure: 2,
}

export const TOOL_HINTS: Record<ChartTool, string> = {
  none: '',
  note: '点击 K 线上任意位置以添加笔记 · Esc 取消',
  horizontal: '点击确定价格，画出一条水平线 · Esc 取消',
  trendline: '点击起点，再点击终点，画出趋势线 · Esc 取消',
  measure: '点击起点，再点击终点，测量涨跌幅 · Esc 取消',
}

export const DRAW_COLORS = ['#2962ff', '#26a69a', '#ef5350', '#f0b90b', '#9598a1'] as const

export const DEFAULT_DRAW_COLOR = DRAW_COLORS[0]

/** Pointer slack for selecting a line, in pixels. */
export const HIT_TOLERANCE = 6

/** Shortest distance from a point to a segment -- used for hit testing. */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1)

  // Projection of the point onto the segment, clamped to its ends.
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
