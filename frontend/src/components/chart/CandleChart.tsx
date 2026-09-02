/**
 * Imperative lightweight-charts wrapper.
 *
 * React owns *what* is drawn (props in, callbacks out); the chart instance is
 * created once and mutated through refs, which is what the library expects.
 * Nothing else in the app imports lightweight-charts -- the drawing overlay
 * gets plain pixel/price conversion functions through `DrawingBridge`.
 */

import {
  PriceScaleMode,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Logical,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Candle, Drawing, DrawingDraft, DrawingPatch, Note } from '@/api/types'
import {
  PALETTES,
  VOLUME_SCALE_ID,
  VOLUME_SCALE_MARGINS,
  chartOptions,
  type ThemeName,
} from '@/lib/chartTheme'
import { DEFAULT_DRAW_COLOR, type ChartTool } from '@/lib/drawings'
import { tzOffsetMs, type Timezone } from '@/lib/format'
import { computeOverlay, type OverlayConfig, type Point } from '@/lib/indicators'
import { logicalToMs, measureMove, msToLogical, snapToBar } from '@/lib/series'
import {
  DrawingLayer,
  type Anchor,
  type DrawingBridge,
  type Preview,
} from './DrawingLayer'

export interface HoverBar {
  candle: Candle
  previousClose: number | null
}

interface Props {
  candles: Candle[]
  notes: Note[]
  drawings: Drawing[]
  isPlaceholderData: boolean
  theme: ThemeName
  timezone: Timezone
  showVolume: boolean
  logScale: boolean
  overlays: OverlayConfig[]
  decimals: number
  /** Bar duration in ms -- anchors are extrapolated with it beyond the data. */
  intervalMs: number
  /** Number of bars to reveal; `null` shows everything (replay off). */
  visibleBars: number | null
  /** Changing this refits the viewport (new symbol / timeframe / range). */
  fitKey: string
  /** Optional bar time to place near the middle of the visible chart. */
  focusTimeMs: number | null
  activeTool: ChartTool
  selectedNoteId: number | null
  selectedDrawingId: number | null
  onHover: (bar: HoverBar | null) => void
  onAddNoteAt: (timeMs: number, price: number) => void
  onSelectNote: (id: number) => void
  onCreateDrawing: (draft: Omit<DrawingDraft, 'exchange' | 'symbol' | 'interval'>) => void
  onUpdateDrawing: (id: number, patch: DrawingPatch) => void
  onDeleteDrawing: (id: number) => void
  onSelectDrawing: (id: number | null) => void
  /** Called when a tool has done its job and should disarm itself. */
  onFinishTool: () => void
}

const NOTE_STYLE: Record<Note['kind'], { color: string; shape: SeriesMarker<Time>['shape'] }> = {
  long: { color: '#26a69a', shape: 'arrowUp' },
  short: { color: '#ef5350', shape: 'arrowDown' },
  observation: { color: '#f0b90b', shape: 'circle' },
}

const DEFAULT_LIVE_VISIBLE_BARS = 160

/** A shape being placed: first anchor down, second one still pending. */
interface Pending {
  kind: 'trendline' | 'measure'
  from: Anchor
  /** Set once the second click lands -- a finished measurement lingers. */
  to: Anchor | null
}

export function CandleChart(props: Props) {
  const {
    candles,
    notes,
    drawings,
    isPlaceholderData,
    theme,
    timezone,
    showVolume,
    logScale,
    overlays,
    decimals,
    intervalMs,
    visibleBars,
    fitKey,
    focusTimeMs,
    activeTool,
    selectedNoteId,
    selectedDrawingId,
    onUpdateDrawing,
    onDeleteDrawing,
    onSelectDrawing,
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const overlayRefs = useRef(new Map<string, ISeriesApi<'Line'>>())
  const priceLineRef = useRef<IPriceLine | null>(null)
  const fittedKeyRef = useRef<string | null>(null)

  // Callbacks change every render; the chart subscribes only once.
  const handlers = useRef(props)
  handlers.current = props

  const view = useMemo(
    () => buildView(candles, timezone, theme, visibleBars),
    [candles, timezone, theme, visibleBars],
  )
  // The chart subscriptions below read the freshest view through this ref.
  const viewRef = useRef(view)
  viewRef.current = view

  // --- drawing state (chart-local: pixels and crosshair, not app data) ------
  const pendingRef = useRef<Pending | null>(null)
  const [pending, setPendingState] = useState<Pending | null>(null)
  const [cursor, setCursor] = useState<Anchor | null>(null)
  const [pane, setPane] = useState({ width: 0, height: 0 })
  const [viewportVersion, setViewportVersion] = useState(0)
  const frameRef = useRef<number | null>(null)

  const cursorRef = useRef<Anchor | null>(null)
  cursorRef.current = cursor

  const setPending = useCallback((next: Pending | null) => {
    pendingRef.current = next
    setPendingState(next)
  }, [])

  /** Coalesce viewport invalidations to one per animation frame. */
  const bumpViewport = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      setViewportVersion((value) => value + 1)
    })
  }, [])

  // --- create / destroy -----------------------------------------------------
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      ...chartOptions(handlers.current.theme),
      width: container.clientWidth,
      height: container.clientHeight,
    })
    chartRef.current = chart
    candleRef.current = chart.addCandlestickSeries()
    volumeRef.current = chart.addHistogramSeries({
      priceScaleId: VOLUME_SCALE_ID,
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale(VOLUME_SCALE_ID).applyOptions({ scaleMargins: VOLUME_SCALE_MARGINS })
    // A fresh chart instance needs its own initial fit (StrictMode remounts).
    fittedKeyRef.current = null

    const pointFromEvent = (param: MouseEventParams): Anchor | null => {
      if (!param.point) return null
      const price = candleRef.current?.coordinateToPrice(param.point.y)
      const logical = chart.timeScale().coordinateToLogical(param.point.x)
      if (price === null || price === undefined || logical === null) return null
      const current = handlers.current
      return { t: logicalToMs(current.candles, current.intervalMs, logical), p: Number(price) }
    }

    const onCrosshair = (param: MouseEventParams) => {
      const current = handlers.current
      const index =
        param.time === undefined ? undefined : viewRef.current.index.get(param.time as number)
      if (index === undefined) {
        current.onHover(null)
      } else {
        const source = viewRef.current.source
        current.onHover({
          candle: source[index],
          previousClose: index > 0 ? source[index - 1].c : null,
        })
      }

      // Rubber-band preview only matters while a tool is armed.
      if (current.activeTool === 'none' || current.activeTool === 'note') {
        if (cursorRef.current !== null) setCursor(null)
        return
      }
      setCursor(pointFromEvent(param))
    }

    const onClick = (param: MouseEventParams) => {
      const current = handlers.current
      const anchor = pointFromEvent(param)
      if (!anchor) return

      switch (current.activeTool) {
        case 'note': {
          // Notes are bar markers, so snap the anchor to a bar open.
          const index = snapToBar(current.candles, anchor.t)
          const barTime = index === -1 ? anchor.t : current.candles[index].t
          current.onAddNoteAt(barTime, anchor.p)
          return
        }
        case 'horizontal':
          current.onCreateDrawing({
            kind: 'horizontal',
            t1: null,
            p1: anchor.p,
            t2: null,
            p2: null,
            color: DEFAULT_DRAW_COLOR,
            width: 1,
            style: 'solid',
            label: '',
          })
          return
        case 'trendline':
        case 'measure': {
          const tool = current.activeTool
          const active = pendingRef.current
          // Start over unless we are mid-shape with the same tool.
          if (!active || active.kind !== tool || active.to !== null) {
            setPending({ kind: tool, from: anchor, to: null })
            return
          }
          if (tool === 'trendline') {
            current.onCreateDrawing({
              kind: 'trendline',
              t1: active.from.t,
              p1: active.from.p,
              t2: anchor.t,
              p2: anchor.p,
              color: DEFAULT_DRAW_COLOR,
              width: 1,
              style: 'solid',
              label: '',
            })
            setPending(null)
          } else {
            // A finished measurement stays on screen; the ruler itself is a
            // one-shot tool, so it disarms and the next bare click clears it.
            setPending({ ...active, to: anchor })
            current.onFinishTool()
          }
          return
        }
        default: {
          // No tool armed: clicking bare canvas clears selections, and a click
          // on a note's bar selects that note.
          setPending(null)
          current.onSelectDrawing(null)
          const hit = nearestNote(current.notes, anchor.t, current.candles)
          if (hit) current.onSelectNote(hit.id)
        }
      }
    }

    chart.subscribeCrosshairMove(onCrosshair)
    chart.subscribeClick(onClick)
    chart.timeScale().subscribeVisibleLogicalRangeChange(bumpViewport)

    // A price-axis drag or a wheel zoom moves the drawings without changing the
    // logical range, so watch raw pointer activity too (button held only).
    const onPointerMove = (event: PointerEvent) => {
      if (event.buttons !== 0) bumpViewport()
    }
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('wheel', bumpViewport, { passive: true })

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height })
        bumpViewport()
      }
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('wheel', bumpViewport)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(bumpViewport)
      chart.unsubscribeCrosshairMove(onCrosshair)
      chart.unsubscribeClick(onClick)
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
      overlayRefs.current.clear()
      priceLineRef.current = null
    }
  }, [bumpViewport, setPending])

  // Esc abandons an in-progress shape or dismisses a finished measurement.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pendingRef.current) setPending(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPending])

  // Switching tools drops a half-finished shape, but keeps a finished
  // measurement on screen (that is the answer the user just asked for).
  useEffect(() => {
    setCursor(null)
    const active = pendingRef.current
    if (active && active.to === null) setPending(null)
  }, [activeTool, setPending])

  // --- theme ----------------------------------------------------------------
  useEffect(() => {
    const chart = chartRef.current
    const series = candleRef.current
    if (!chart || !series) return
    const palette = PALETTES[theme]
    chart.applyOptions(chartOptions(theme))
    series.applyOptions({
      upColor: palette.bullFill,
      downColor: palette.bearFill,
      borderUpColor: palette.bull,
      borderDownColor: palette.bear,
      wickUpColor: palette.bull,
      wickDownColor: palette.bear,
    })
  }, [theme])

  // --- price scale ----------------------------------------------------------
  useEffect(() => {
    candleRef.current?.applyOptions({
      priceFormat: { type: 'price', precision: decimals, minMove: 10 ** -decimals },
    })
    bumpViewport()
  }, [decimals, bumpViewport])

  useEffect(() => {
    chartRef.current
      ?.priceScale('right')
      .applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal })
    bumpViewport()
  }, [logScale, bumpViewport])

  // --- data -----------------------------------------------------------------
  useEffect(() => {
    candleRef.current?.setData(view.bars)
    volumeRef.current?.setData(showVolume ? view.volume : [])

    // Only reframe when real data for a new selection arrives. Placeholder
    // data is the previous symbol, and using it here would lock the viewport
    // to the wrong scale until the user manually zooms.
    if (!isPlaceholderData && view.bars.length > 0 && fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey
      const scale = chartRef.current?.timeScale()
      if (scale) {
        if (focusTimeMs !== null) {
          const focusIndex = nearestBarIndex(candles, focusTimeMs)
          const radius = Math.min(80, Math.max(20, Math.floor(view.bars.length / 3)))
          scale.setVisibleLogicalRange({
            from: Math.max(0, focusIndex - radius),
            to: Math.min(view.bars.length - 1, focusIndex + radius),
          })
        } else if (visibleBars === null && view.bars.length > DEFAULT_LIVE_VISIBLE_BARS) {
          const start = Math.max(0, view.bars.length - DEFAULT_LIVE_VISIBLE_BARS)
          scale.setVisibleLogicalRange({ from: start, to: view.bars.length - 1 + 8 })
        } else {
          scale.fitContent()
        }
      }
    }
    bumpViewport()
  }, [view, showVolume, fitKey, bumpViewport, isPlaceholderData, visibleBars, focusTimeMs, candles])

  // --- plot-area size (drives the overlay's viewBox) ------------------------
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const size = chart.paneSize()
    setPane((current) =>
      current.width === size.width && current.height === size.height ? current : size,
    )
  }, [viewportVersion, view])

  // --- indicator overlays ---------------------------------------------------
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const live = overlayRefs.current

    for (const [id, series] of live) {
      if (!overlays.some((o) => o.id === id)) {
        chart.removeSeries(series)
        live.delete(id)
      }
    }
    for (const config of overlays) {
      let series = live.get(config.id)
      if (!series) {
        series = chart.addLineSeries({
          color: config.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        live.set(config.id, series)
      } else {
        series.applyOptions({ color: config.color })
      }
      series.setData(computeOverlay(config, view.closes))
    }
  }, [overlays, view])

  // --- note markers ---------------------------------------------------------
  useEffect(() => {
    const series = candleRef.current
    if (!series) return
    const markers = notes.flatMap<SeriesMarker<UTCTimestamp>>((note) => {
      const barIndex = snapToBar(candles, note.time_ms)
      if (barIndex === -1 || barIndex >= view.bars.length) return []
      const style = NOTE_STYLE[note.kind]
      return [
        {
          time: view.bars[barIndex].time,
          position: note.kind === 'short' ? 'aboveBar' : 'belowBar',
          color: note.color || style.color,
          shape: style.shape,
          size: note.id === selectedNoteId ? 2 : 1,
          text: truncate(note.title, 18),
        },
      ]
    })

    series.setMarkers(markers)
  }, [notes, candles, view, selectedNoteId])

  // --- selected note price line --------------------------------------------
  useEffect(() => {
    const series = candleRef.current
    if (!series) return
    if (priceLineRef.current) {
      series.removePriceLine(priceLineRef.current)
      priceLineRef.current = null
    }
    const note = notes.find((n) => n.id === selectedNoteId)
    if (!note?.price) return
    priceLineRef.current = series.createPriceLine({
      price: note.price,
      color: note.color || NOTE_STYLE[note.kind].color,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: truncate(note.title, 12),
    })
  }, [notes, selectedNoteId])

  // --- overlay bridge -------------------------------------------------------
  const bridge = useMemo<DrawingBridge>(
    () => ({
      toX: (ms) => {
        const scale = chartRef.current?.timeScale()
        if (!scale) return null
        return scale.logicalToCoordinate(msToLogical(candles, intervalMs, ms) as Logical)
      },
      toY: (price) => candleRef.current?.priceToCoordinate(price) ?? null,
      fromX: (x) => {
        const logical = chartRef.current?.timeScale().coordinateToLogical(x)
        return logical === null || logical === undefined
          ? 0
          : logicalToMs(candles, intervalMs, logical)
      },
      fromY: (y) => Number(candleRef.current?.coordinateToPrice(y) ?? 0),
      width: pane.width,
      height: pane.height,
    }),
    [candles, intervalMs, pane.width, pane.height],
  )

  const preview = useMemo<Preview | null>(() => {
    if (pending) {
      const to = pending.to ?? cursor
      return {
        kind: pending.kind,
        from: pending.from,
        to,
        stats:
          pending.kind === 'measure' && to
            ? measureMove(pending.from, to, candles, intervalMs)
            : null,
      }
    }
    if (activeTool === 'horizontal' && cursor) {
      return { kind: 'horizontal', from: null, to: cursor, stats: null }
    }
    return null
  }, [pending, cursor, activeTool, candles, intervalMs])

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full ${activeTool !== 'none' ? 'cursor-crosshair' : ''}`}
      data-testid="candle-chart"
    >
      {pane.width > 0 && (
        <DrawingLayer
          bridge={bridge}
          version={viewportVersion}
          drawings={drawings}
          preview={preview}
          activeTool={activeTool}
          selectedId={selectedDrawingId}
          decimals={decimals}
          onSelect={onSelectDrawing}
          onCommit={onUpdateDrawing}
          onDelete={onDeleteDrawing}
        />
      )}
    </div>
  )
}

interface ChartView {
  bars: CandlestickData<UTCTimestamp>[]
  volume: HistogramData<UTCTimestamp>[]
  closes: Point[]
  /** chart time (seconds) -> index into `source` */
  index: Map<number, number>
  source: Candle[]
}

/**
 * One pass over the data producing every series the chart needs, plus a lookup
 * from chart time back to the original bar (crosshair and click handling).
 * Replay truncation happens here so indicators never see future bars.
 */
function buildView(
  candles: Candle[],
  timezone: Timezone,
  theme: ThemeName,
  visibleBars: number | null,
): ChartView {
  const palette = PALETTES[theme]
  const source = visibleBars === null ? candles : candles.slice(0, Math.max(visibleBars, 1))

  const bars: CandlestickData<UTCTimestamp>[] = []
  const volume: HistogramData<UTCTimestamp>[] = []
  const closes: Point[] = []
  const index = new Map<number, number>()

  source.forEach((candle, i) => {
    const seconds = ((candle.t + tzOffsetMs(candle.t, timezone)) / 1000) as UTCTimestamp
    index.set(seconds, i)
    bars.push({ time: seconds, open: candle.o, high: candle.h, low: candle.l, close: candle.c })
    volume.push({
      time: seconds,
      value: candle.v,
      color: candle.c >= candle.o ? palette.volumeUp : palette.volumeDown,
    })
    closes.push({ time: seconds, value: candle.c })
  })

  return { bars, volume, closes, index, source }
}

function nearestBarIndex(candles: Candle[], targetMs: number): number {
  if (candles.length === 0) return 0
  let low = 0
  let high = candles.length - 1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (candles[middle].t === targetMs) return middle
    if (candles[middle].t < targetMs) low = middle + 1
    else high = middle - 1
  }
  if (low >= candles.length) return candles.length - 1
  if (high < 0) return 0
  return targetMs - candles[high].t <= candles[low].t - targetMs ? high : low
}

function nearestNote(notes: Note[], timeMs: number, candles: Candle[]): Note | null {
  const target = snapToBar(candles, timeMs)
  if (target === -1) return null
  for (const note of notes) {
    if (snapToBar(candles, note.time_ms) === target) return note
  }
  return null
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
