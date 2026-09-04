/**
 * Interactive drawing overlay.
 *
 * An SVG sheet laid exactly over the chart's plot area. It knows nothing about
 * lightweight-charts: `CandleChart` hands it a `bridge` of four conversion
 * functions, so this file is pure geometry + pointer handling.
 *
 * Pointer routing: the root is `pointer-events: none` so panning and zooming
 * still reach the chart underneath; only the invisible hit-paths and the drag
 * handles opt back in, and they opt *out* again while a tool is armed so the
 * next click goes to the chart (which drives anchor placement).
 */

import { Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { Drawing, DrawingPatch } from '@/api/types'
import { DRAW_COLORS, HIT_TOLERANCE, type ChartTool } from '@/lib/drawings'
import { formatDuration, formatPercent, formatPrice } from '@/lib/format'
import type { MoveStats } from '@/lib/series'

export interface Anchor {
  t: number
  p: number
}

export interface DrawingBridge {
  /** timestamp -> x, in plot-area pixels */
  toX: (ms: number) => number | null
  /** price -> y */
  toY: (price: number) => number | null
  /** x -> timestamp */
  fromX: (x: number) => number
  /** y -> price */
  fromY: (y: number) => number
  width: number
  height: number
}

export interface Preview {
  kind: 'trendline' | 'horizontal' | 'measure'
  from: Anchor | null
  to: Anchor | null
  stats: MoveStats | null
}

interface Props {
  bridge: DrawingBridge
  /** Bumped on every pan / zoom / resize so coordinates are recomputed. */
  version: number
  drawings: Drawing[]
  preview: Preview | null
  activeTool: ChartTool
  selectedId: number | null
  decimals: number
  onSelect: (id: number | null) => void
  onCommit: (id: number, patch: DrawingPatch) => void
  onDelete: (id: number) => void
}

type Handle = 'a' | 'b' | 'line'

interface DragState {
  id: number
  handle: Handle
  pointerId: number
  originX: number
  originY: number
  /** Anchor coordinates when the drag started. */
  baseAX: number
  baseAY: number
  baseBX: number
  baseBY: number
  patch: DrawingPatch | null
}

const DEFAULT_COLOR = DRAW_COLORS[0]
const HANDLE_RADIUS = 4.5

export function DrawingLayer({
  bridge,
  version,
  drawings,
  preview,
  activeTool,
  selectedId,
  decimals,
  onSelect,
  onCommit,
  onDelete,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const interactive = activeTool === 'none'

  // Resolve every drawing to pixels. `version` is in the dependency list on
  // purpose: the numbers change without `drawings` changing whenever the user
  // pans or zooms.
  const shapes = useMemo(() => {
    void version
    return drawings
      .map((drawing) => {
        const live = drag?.id === drawing.id && drag.patch ? { ...drawing, ...drag.patch } : drawing
        return toShape(live, bridge)
      })
      .filter((shape): shape is Shape => shape !== null)
  }, [drawings, bridge, version, drag])

  const previewShape = useMemo(() => {
    void version
    return preview ? toPreviewShape(preview, bridge) : null
  }, [preview, bridge, version])

  // Dragging is tracked on the window (the pointer routinely leaves the small
  // handle it started on) and reads its inputs through refs, so the listeners
  // are attached once per drag instead of once per pointer move -- otherwise
  // the very first move, arriving in the same frame as the press, is lost.
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const liveRef = useRef({ drawings, bridge, onCommit })
  liveRef.current = { drawings, bridge, onCommit }
  const dragging = drag !== null

  useEffect(() => {
    if (!dragging) return
    const root = rootRef.current
    if (!root) return

    const onMove = (event: PointerEvent) => {
      const active = dragRef.current
      if (!active || event.pointerId !== active.pointerId) return
      const rect = root.getBoundingClientRect()
      const dx = event.clientX - rect.left - active.originX
      const dy = event.clientY - rect.top - active.originY
      setDrag((current) =>
        current
          ? {
              ...current,
              patch: buildPatch(current, dx, dy, liveRef.current.drawings, liveRef.current.bridge),
            }
          : current,
      )
    }
    const onUp = (event: PointerEvent) => {
      const active = dragRef.current
      if (!active || event.pointerId !== active.pointerId) return
      // Commit outside the state updater: updaters must stay pure, and React
      // invokes them twice in development.
      if (active.patch) liveRef.current.onCommit(active.id, active.patch)
      setDrag(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging])

  const startDrag = (event: React.PointerEvent, shape: Shape, handle: Handle) => {
    if (!interactive) return
    event.stopPropagation()
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    onSelect(shape.drawing.id)
    setDrag({
      id: shape.drawing.id,
      handle,
      pointerId: event.pointerId,
      originX: event.clientX - rect.left,
      originY: event.clientY - rect.top,
      baseAX: shape.x1,
      baseAY: shape.y1,
      baseBX: shape.x2,
      baseBY: shape.y2,
      patch: null,
    })
  }

  const selected = shapes.find((shape) => shape.drawing.id === selectedId)

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute left-0 top-0"
      // lightweight-charts stacks its interaction canvas at z-index 2; the
      // overlay has to sit above it or its hit-paths never get the pointer.
      style={{ zIndex: 3 }}
    >
      <svg
        width={bridge.width}
        height={bridge.height}
        className="overflow-visible"
        style={{ display: 'block' }}
      >
        {shapes.map((shape) => (
          <ShapeView
            key={shape.drawing.id}
            shape={shape}
            selected={shape.drawing.id === selectedId}
            interactive={interactive}
            decimals={decimals}
            onSelect={() => onSelect(shape.drawing.id)}
            onStartDrag={startDrag}
          />
        ))}

        {previewShape && <PreviewView shape={previewShape} decimals={decimals} />}
      </svg>

      {selected && !drag && (
        <StylePopover
          shape={selected}
          paneWidth={bridge.width}
          onPatch={(patch) => onCommit(selected.drawing.id, patch)}
          onDelete={() => onDelete(selected.drawing.id)}
        />
      )}
    </div>
  )
}

// --------------------------------------------------------------------- shapes

interface Shape {
  drawing: Drawing
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  dashed: boolean
  horizontal: boolean
}

function toShape(drawing: Drawing, bridge: DrawingBridge): Shape | null {
  const color = drawing.color || DEFAULT_COLOR
  const dashed = drawing.style === 'dashed'

  if (drawing.kind === 'horizontal') {
    const y = bridge.toY(drawing.p1)
    if (y === null) return null
    return {
      drawing,
      x1: 0,
      y1: y,
      x2: bridge.width,
      y2: y,
      color,
      dashed,
      horizontal: true,
    }
  }

  if (drawing.t1 === null || drawing.t2 === null || drawing.p2 === null) return null
  const x1 = bridge.toX(drawing.t1)
  const y1 = bridge.toY(drawing.p1)
  const x2 = bridge.toX(drawing.t2)
  const y2 = bridge.toY(drawing.p2)
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null
  return { drawing, x1, y1, x2, y2, color, dashed, horizontal: false }
}

interface PreviewShape {
  kind: Preview['kind']
  x1: number
  y1: number
  x2: number
  y2: number
  stats: MoveStats | null
  width: number
}

function toPreviewShape(preview: Preview, bridge: DrawingBridge): PreviewShape | null {
  if (preview.kind === 'horizontal') {
    const anchor = preview.to ?? preview.from
    const y = anchor ? bridge.toY(anchor.p) : null
    if (y === null) return null
    return { kind: 'horizontal', x1: 0, y1: y, x2: bridge.width, y2: y, stats: null, width: bridge.width }
  }

  if (!preview.from || !preview.to) return null
  const x1 = bridge.toX(preview.from.t)
  const y1 = bridge.toY(preview.from.p)
  const x2 = bridge.toX(preview.to.t)
  const y2 = bridge.toY(preview.to.p)
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null
  return { kind: preview.kind, x1, y1, x2, y2, stats: preview.stats, width: bridge.width }
}

/** Convert a pixel delta into a patch on the dragged drawing's anchors. */
function buildPatch(
  drag: DragState,
  dx: number,
  dy: number,
  drawings: Drawing[],
  bridge: DrawingBridge,
): DrawingPatch {
  const drawing = drawings.find((item) => item.id === drag.id)
  if (!drawing) return {}

  if (drawing.kind === 'horizontal') {
    // Only the level matters; horizontal lines span the whole width.
    return { p1: bridge.fromY(drag.baseAY + dy) }
  }

  if (drag.handle === 'a') {
    return { t1: bridge.fromX(drag.baseAX + dx), p1: bridge.fromY(drag.baseAY + dy) }
  }
  if (drag.handle === 'b') {
    return { t2: bridge.fromX(drag.baseBX + dx), p2: bridge.fromY(drag.baseBY + dy) }
  }
  return {
    t1: bridge.fromX(drag.baseAX + dx),
    p1: bridge.fromY(drag.baseAY + dy),
    t2: bridge.fromX(drag.baseBX + dx),
    p2: bridge.fromY(drag.baseBY + dy),
  }
}

// ----------------------------------------------------------------------- views

interface ShapeViewProps {
  shape: Shape
  selected: boolean
  interactive: boolean
  decimals: number
  onSelect: () => void
  onStartDrag: (event: React.PointerEvent, shape: Shape, handle: Handle) => void
}

function ShapeView({
  shape,
  selected,
  interactive,
  decimals,
  onSelect,
  onStartDrag,
}: ShapeViewProps) {
  const { drawing, x1, y1, x2, y2, color, dashed, horizontal } = shape
  const events = interactive ? 'stroke' : 'none'

  return (
    <g>
      {/* Fat transparent stroke: the actual click / drag target. */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="transparent"
        strokeWidth={HIT_TOLERANCE * 2}
        style={{ pointerEvents: events, cursor: interactive ? 'move' : 'default' }}
        onPointerDown={(event) => {
          onSelect()
          onStartDrag(event, shape, 'line')
        }}
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={selected ? drawing.width + 1 : drawing.width}
        strokeDasharray={dashed ? '6 4' : undefined}
        strokeLinecap="round"
      />

      {horizontal && (
        <>
          {drawing.label && (
            <text x={6} y={y1 - 5} fill={color} fontSize={10} className="font-sans">
              {drawing.label}
            </text>
          )}
          <PriceTag x={shape.x2 - 4} y={y1} color={color} text={formatPrice(drawing.p1, decimals)} />
        </>
      )}

      {selected && (
        <>
          {!horizontal && (
            <DragHandle
              x={x1}
              y={y1}
              color={color}
              onPointerDown={(event) => onStartDrag(event, shape, 'a')}
            />
          )}
          <DragHandle
            x={horizontal ? (x1 + x2) / 2 : x2}
            y={y2}
            color={color}
            onPointerDown={(event) => onStartDrag(event, shape, horizontal ? 'line' : 'b')}
          />
        </>
      )}
    </g>
  )
}

function DragHandle({
  x,
  y,
  color,
  onPointerDown,
}: {
  x: number
  y: number
  color: string
  onPointerDown: (event: React.PointerEvent) => void
}) {
  return (
    <circle
      cx={x}
      cy={y}
      r={HANDLE_RADIUS}
      fill="#fff"
      stroke={color}
      strokeWidth={2}
      style={{ pointerEvents: 'all', cursor: 'grab' }}
      onPointerDown={onPointerDown}
    />
  )
}

function PriceTag({
  x,
  y,
  color,
  text,
}: {
  x: number
  y: number
  color: string
  text: string
}) {
  const width = text.length * 6 + 8
  return (
    <g>
      <rect x={x - width} y={y - 8} width={width} height={16} rx={2} fill={color} opacity={0.9} />
      <text
        x={x - width / 2}
        y={y + 4}
        textAnchor="middle"
        fontSize={10}
        fill="#fff"
        className="font-mono"
      >
        {text}
      </text>
    </g>
  )
}

function PreviewView({ shape, decimals }: { shape: PreviewShape; decimals: number }) {
  const { kind, x1, y1, x2, y2, stats } = shape
  const measuring = kind === 'measure'
  const color = measuring ? (stats?.up ? '#26a69a' : '#ef5350') : DEFAULT_COLOR

  return (
    <g>
      {measuring && (
        <rect
          x={Math.min(x1, x2)}
          y={Math.min(y1, y2)}
          width={Math.abs(x2 - x1)}
          height={Math.abs(y2 - y1)}
          fill={color}
          fillOpacity={0.12}
          stroke={color}
          strokeOpacity={0.5}
          strokeDasharray="4 3"
        />
      )}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="5 4"
      />
      {measuring && stats && (
        <MeasureBadge
          x={(x1 + x2) / 2}
          y={Math.min(y1, y2) - 10}
          color={color}
          stats={stats}
          decimals={decimals}
          paneWidth={shape.width}
        />
      )}
    </g>
  )
}

function MeasureBadge({
  x,
  y,
  color,
  stats,
  decimals,
  paneWidth,
}: {
  x: number
  y: number
  color: string
  stats: MoveStats
  decimals: number
  paneWidth: number
}) {
  const sign = stats.absolute >= 0 ? '+' : '-'
  const priceLine = `${sign}${formatPrice(Math.abs(stats.absolute), decimals)}  ${formatPercent(
    stats.percent,
  )}`
  const spanLine = `${stats.bars} 根 · ${formatDuration(stats.durationMs)}`
  const width = Math.max(priceLine.length, spanLine.length) * 6.2 + 16

  // Keep the badge inside the plot area even when measuring near an edge.
  const left = Math.min(Math.max(x - width / 2, 2), Math.max(paneWidth - width - 2, 2))
  const top = Math.max(y - 34, 2)

  return (
    <g>
      <rect x={left} y={top} width={width} height={34} rx={3} fill={color} />
      <text x={left + width / 2} y={top + 14} textAnchor="middle" fontSize={11} fill="#fff">
        {priceLine}
      </text>
      <text
        x={left + width / 2}
        y={top + 27}
        textAnchor="middle"
        fontSize={10}
        fill="#fff"
        opacity={0.85}
      >
        {spanLine}
      </text>
    </g>
  )
}

function StylePopover({
  shape,
  paneWidth,
  onPatch,
  onDelete,
}: {
  shape: Shape
  paneWidth: number
  onPatch: (patch: DrawingPatch) => void
  onDelete: () => void
}) {
  const midX = (shape.x1 + shape.x2) / 2
  const left = Math.min(Math.max(midX - 70, 4), Math.max(paneWidth - 144, 4))
  const top = Math.max(Math.min(shape.y1, shape.y2) - 40, 4)

  return (
    <div
      className="pointer-events-auto absolute flex items-center gap-1 rounded border border-edge
        bg-panel px-1.5 py-1 shadow-lg"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {DRAW_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          onClick={() => onPatch({ color })}
          className="focus-ring h-4 w-4 rounded-full border border-edge transition hover:scale-110"
          style={{ background: color }}
        />
      ))}
      <span className="mx-0.5 h-4 w-px bg-edge" />
      <button
        type="button"
        title="实线 / 虚线"
        onClick={() => onPatch({ style: shape.dashed ? 'solid' : 'dashed' })}
        className="focus-ring flex h-5 w-6 items-center justify-center rounded hover:bg-panel-soft"
      >
        <svg width={16} height={2} className="overflow-visible">
          <line
            x1={0}
            y1={1}
            x2={16}
            y2={1}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray={shape.dashed ? '4 3' : undefined}
          />
        </svg>
      </button>
      <button
        type="button"
        title="删除 (Delete)"
        onClick={onDelete}
        className="focus-ring flex h-5 w-5 items-center justify-center rounded text-bear hover:bg-bear/10"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}
