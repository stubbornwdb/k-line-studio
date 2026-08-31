import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '@/api/client'
import {
  useCandles,
  useDrawingMutations,
  useDrawings,
  useExchanges,
  useNoteMutations,
  useNotes,
  useRefreshCandles,
  useMarketOverview,
  useSymbols,
} from '@/api/queries'
import type { DrawingDraft, Interval, Note, NoteDraft } from '@/api/types'
import { CandleProgress } from '@/components/CandleProgress'
import { MarketStrip } from '@/components/MarketStrip'
import { NoteDialog, type NoteFormValue } from '@/components/NoteDialog'
import { MonitorPanel } from '@/components/MonitorPanel'
import { NotesPanel } from '@/components/NotesPanel'
import { ShortcutsDialog } from '@/components/ShortcutsDialog'
import { StatusBar } from '@/components/StatusBar'
import { StoragePanel } from '@/components/StoragePanel'
import { TopBar } from '@/components/TopBar'
import { CandleChart, type HoverBar } from '@/components/chart/CandleChart'
import { ChartLegend } from '@/components/chart/ChartLegend'
import { ChartToolbar } from '@/components/chart/ChartToolbar'
import { ReplayControls } from '@/components/chart/ReplayControls'
import { Button } from '@/components/ui/Button'
import { TOOL_HINTS } from '@/lib/drawings'
import { priceDecimals } from '@/lib/format'
import { DEFAULT_OVERLAYS } from '@/lib/indicators'
import { INTERVAL_MS, estimateBars, resolveRange } from '@/lib/timeframes'
import { playAlertSound } from '@/lib/alerts'
import { useSession } from '@/store/useSession'

/** Re-resolve preset ranges periodically so the window follows new bars. */
const RANGE_TICK_MS = 1_000

export default function App() {
  const session = useSession()
  const [tick, setTick] = useState(0)
  const [hover, setHover] = useState<HoverBar | null>(null)
  const [noteForm, setNoteForm] = useState<NoteFormValue | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const seenAlertIdsRef = useRef(new Set<number>())
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), RANGE_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', session.theme === 'dark')
  }, [session.theme])

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === mainRef.current)
    }
    syncFullscreen()
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  // Esc disarms the active tool; Delete removes the selected drawing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const state = useSession.getState()
      if (event.key === 'Escape') {
        state.setTool('none')
        state.selectDrawing(null)
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        state.selectedDrawingId !== null
      ) {
        event.preventDefault()
        drawingMutationsRef.current.remove.mutate(state.selectedDrawingId)
        state.selectDrawing(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const range = useMemo(
    () =>
      resolveRange(session.rangePreset, session.interval, {
        start: session.customStart,
        end: session.customEnd,
      }),
    // `tick` intentionally re-anchors preset windows to the newest bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.rangePreset, session.interval, session.customStart, session.customEnd, tick],
  )

  const query = useCandles({
    exchange: session.exchange,
    symbol: session.symbol,
    interval: session.interval,
    start: range.start,
    end: range.end,
    live: range.live,
    refreshIntervalMs: session.refreshIntervalMs,
  })
  const refresh = useRefreshCandles()
  const marketOverview = useMarketOverview(
    session.exchange,
    session.symbol,
    session.refreshIntervalMs,
  )
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  const toggleFullscreen = async () => {
    const target = mainRef.current
    if (!target) return
    try {
      if (document.fullscreenElement === target) {
        await document.exitFullscreen()
      } else {
        await target.requestFullscreen()
      }
    } catch {
      // Browsers may reject fullscreen without a user gesture or policy support.
    }
  }

  useEffect(() => {
    const ids = marketOverview.data?.triggered_alert_ids ?? []
    const fresh = ids.filter((id) => !seenAlertIdsRef.current.has(id))
    ids.forEach((id) => seenAlertIdsRef.current.add(id))
    if (session.monitorSoundEnabled && fresh.length > 0) playAlertSound()
  }, [marketOverview.data?.triggered_alert_ids, session.monitorSoundEnabled])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key === '?') {
        event.preventDefault()
        setShortcutsOpen(true)
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        refreshRef.current.mutate({
          exchange: session.exchange,
          symbol: session.symbol,
          interval: session.interval,
          start: range.start,
          end: range.end,
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [range.end, range.start, session.exchange, session.interval, session.symbol])

  const { data: exchanges } = useExchanges()
  const { data: symbolList } = useSymbols(session.exchange)
  const { data: allNotes, isLoading: notesLoading } = useNotes(session.exchange, session.symbol)
  const noteMutations = useNoteMutations(session.exchange, session.symbol)
  const { data: allDrawings } = useDrawings(session.exchange, session.symbol)
  const drawingMutations = useDrawingMutations(session.exchange, session.symbol)
  // The Delete-key handler is registered once, so it reads mutations via a ref.
  const drawingMutationsRef = useRef(drawingMutations)
  drawingMutationsRef.current = drawingMutations

  const candles = query.data?.candles ?? []
  const exchangeName =
    exchanges?.find((item) => item.key === session.exchange)?.name ?? session.exchange

  const decimals = useMemo(() => {
    const info = symbolList?.symbols.find((item) => item.symbol === session.symbol)
    const sample = candles.at(-1)?.c ?? 0
    return priceDecimals(sample, info?.price_precision)
  }, [symbolList, session.symbol, candles])

  const notes = useMemo(
    () =>
      (allNotes ?? []).filter(
        (note) => note.interval === null || note.interval === session.interval,
      ),
    [allNotes, session.interval],
  )

  const drawings = useMemo(
    () =>
      (allDrawings ?? []).filter(
        (item) => item.interval === null || item.interval === session.interval,
      ),
    [allDrawings, session.interval],
  )

  const overlays = useMemo(
    () => DEFAULT_OVERLAYS.filter((overlay) => session.overlayIds.includes(overlay.id)),
    [session.overlayIds],
  )

  const visibleBars = session.replay.active ? session.replay.index + 1 : null
  const lastIndex = Math.min(visibleBars ?? candles.length, candles.length) - 1
  const lastVisible = candles[lastIndex]
  // With no crosshair the legend describes the newest visible bar.
  const legendPrevClose =
    hover?.previousClose ?? (lastIndex > 0 ? candles[lastIndex - 1].c : null)

  const openNoteAt = (timeMs: number, price: number | null) => {
    setNoteForm({
      time_ms: timeMs,
      // The click resolves to a sub-tick price; store it at the symbol's precision.
      price: price === null ? null : Number(price.toFixed(decimals)),
      title: '',
      body: '',
      kind: 'observation',
      tags: [],
      interval: session.interval,
    })
    session.setTool('none')
  }

  const editNote = (note: Note) => {
    session.selectNote(note.id)
    setNoteForm({
      id: note.id,
      time_ms: note.time_ms,
      price: note.price,
      title: note.title,
      body: note.body,
      kind: note.kind,
      tags: note.tags,
      interval: note.interval,
    })
  }

  const submitNote = ({ id, ...draft }: NoteDraft & { id?: number }) => {
    if (id) noteMutations.update.mutate({ id, ...draft })
    else noteMutations.create.mutate(draft)
    setNoteForm(null)
  }

  const createDrawing = (
    draft: Omit<DrawingDraft, 'exchange' | 'symbol' | 'interval'>,
  ) => {
    drawingMutations.create.mutate({
      ...draft,
      exchange: session.exchange,
      symbol: session.symbol,
      // Null = every timeframe, which is what a trend line normally means.
      interval: null,
    })
    session.setTool('none')
  }

  const errorMessage = query.isError ? ((query.error as Error)?.message ?? '请求失败') : null

  return (
    <div className="flex h-full flex-col bg-panel text-ink">
      <TopBar
        range={range}
        estimatedBars={estimateBars(range.start, range.end, session.interval)}
      />

      <div className="flex min-h-0 flex-1">
        <main ref={mainRef} className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-end border-b border-edge bg-panel px-3 py-1.5">
            <ChartToolbar
              canReplay={candles.length > 10}
              drawingCount={(allDrawings ?? []).length}
              onClearDrawings={() => drawingMutations.clear.mutate()}
              onStartReplay={() => session.startReplay(Math.floor(candles.length * 0.6))}
              onRefresh={() =>
                refresh.mutate({
                  exchange: session.exchange,
                  symbol: session.symbol,
                  interval: session.interval,
                  start: range.start,
                  end: range.end,
                })
              }
              refreshing={refresh.isPending || query.isFetching}
              refreshIntervalMs={session.refreshIntervalMs}
              live={range.live}
              lastUpdatedAt={query.dataUpdatedAt}
              isFullscreen={isFullscreen}
              onIntervalChange={session.setRefreshInterval}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              onToggleFullscreen={toggleFullscreen}
              exportHref={api.url('/candles/export', {
                exchange: session.exchange,
                symbol: session.symbol,
                interval: session.interval,
                start: range.start,
                end: range.end,
              })}
            />
          </div>

          <MarketStrip
            symbol={session.symbol}
            ticker={marketOverview.data?.selected}
            fallbackPrice={lastVisible?.c ?? null}
            updatedAt={marketOverview.data?.updated_at}
          />

          <CandleProgress job={query.progress} />

          <div className="relative min-h-0 flex-1">
            <ChartLegend
              symbol={session.symbol}
              interval={session.interval}
              exchangeName={exchangeName}
              bar={hover?.candle ?? lastVisible ?? null}
              previousClose={legendPrevClose}
              decimals={decimals}
              timezone={session.timezone}
              overlays={overlays}
            />

            {session.activeTool !== 'none' && (
              <div
                className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded border
                  border-accent bg-accent/15 px-2 py-1 text-2xs text-accent"
              >
                {TOOL_HINTS[session.activeTool]}
              </div>
            )}

            {candles.length === 0 && !query.isLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2">
                <p className="text-xs text-ink-muted">该区间没有数据</p>
                <Button variant="solid" size="sm" onClick={() => void query.refetch()}>
                  重试
                </Button>
              </div>
            )}

            <CandleChart
              key={`${session.exchange}|${session.symbol}|${session.interval}|${range.start}|${range.end}`}
              candles={candles}
              notes={notes}
              drawings={drawings}
              isPlaceholderData={query.isPlaceholderData}
              theme={session.theme}
              timezone={session.timezone}
              showVolume={session.showVolume}
              logScale={session.logScale}
              overlays={overlays}
              decimals={decimals}
              intervalMs={INTERVAL_MS[session.interval]}
              visibleBars={visibleBars}
              fitKey={`${session.exchange}|${session.symbol}|${session.interval}|${session.rangePreset}`}
              activeTool={session.activeTool}
              selectedNoteId={session.selectedNoteId}
              selectedDrawingId={session.selectedDrawingId}
              onHover={setHover}
              onAddNoteAt={openNoteAt}
              onSelectNote={(id) => {
                session.selectNote(id)
                session.setSidebarTab('notes')
              }}
              onCreateDrawing={createDrawing}
              onUpdateDrawing={(id, patch) => drawingMutations.update.mutate({ id, ...patch })}
              onDeleteDrawing={(id) => {
                drawingMutations.remove.mutate(id)
                session.selectDrawing(null)
              }}
              onSelectDrawing={session.selectDrawing}
              onFinishTool={() => session.setTool('none')}
            />
          </div>

          {session.replay.active && candles.length > 0 && (
            <ReplayControls
              candles={candles}
              interval={session.interval}
              timezone={session.timezone}
            />
          )}

          <StatusBar
            meta={query.data?.meta}
            count={candles.length}
            start={range.start}
            end={range.end}
            interval={session.interval}
            timezone={session.timezone}
            loading={query.isFetching}
            error={errorMessage}
            progress={query.progress}
          />
        </main>

        {session.sidebarOpen && (
        <aside className="flex w-72 shrink-0 flex-col border-l border-edge bg-panel xl:w-80">
          <div className="flex border-b border-edge">
            {(
              [
                ['notes', '笔记'],
                ['storage', '缓存'],
                ['monitor', '盯盘'],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => session.setSidebarTab(tab)}
                className={`flex-1 py-2 text-2xs font-medium transition-colors ${
                  session.sidebarTab === tab
                    ? 'border-b-2 border-accent text-ink'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1">
            {session.sidebarTab === 'notes' ? (
              <NotesPanel
                notes={notes}
                loading={notesLoading}
                interval={session.interval}
                timezone={session.timezone}
                decimals={decimals}
                selectedId={session.selectedNoteId}
                onSelect={session.selectNote}
                onEdit={editNote}
                onCreate={() =>
                  openNoteAt(lastVisible?.t ?? Date.now(), lastVisible?.c ?? null)
                }
              />
            ) : session.sidebarTab === 'storage' ? (
              <StoragePanel
                timezone={session.timezone}
                onOpen={(exchange, symbol, interval: Interval) => {
                  session.setMarket(exchange, symbol)
                  session.setInterval(interval)
                }}
              />
            ) : (
              <MonitorPanel
                exchange={session.exchange}
                currentSymbol={session.symbol}
                overview={marketOverview.data}
                isLoading={marketOverview.isLoading}
                isError={marketOverview.isError}
                error={(marketOverview.error as Error | null) ?? null}
                refreshIntervalMs={session.refreshIntervalMs}
                onOpen={session.setSymbol}
              />
            )}
          </div>
        </aside>
        )}
      </div>

      <NoteDialog
        open={noteForm !== null}
        value={noteForm}
        exchange={session.exchange}
        symbol={session.symbol}
        interval={session.interval}
        timezone={session.timezone}
        onClose={() => setNoteForm(null)}
        onSubmit={submitNote}
        onDelete={(id) => {
          noteMutations.remove.mutate(id)
          setNoteForm(null)
        }}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
