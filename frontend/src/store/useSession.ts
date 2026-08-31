/**
 * The whole UI selection lives here: what to chart, how to draw it, and where
 * the replay cursor is. Persisted so a reload lands you back on the same setup.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Interval } from '@/api/types'
import type { ThemeName } from '@/lib/chartTheme'
import type { ChartTool } from '@/lib/drawings'
import type { Timezone } from '@/lib/format'
import { DEFAULT_OVERLAYS } from '@/lib/indicators'

export type SidebarTab = 'notes' | 'storage' | 'monitor'
export type RefreshInterval = 5000 | 10000 | 15000 | 30000 | 60000

export interface ReplayState {
  active: boolean
  /** Index of the last visible bar. */
  index: number
  playing: boolean
  /** Bars per second. */
  speed: number
}

interface SessionState {
  exchange: string
  symbol: string
  interval: Interval
  rangePreset: string
  customStart?: string
  customEnd?: string

  theme: ThemeName
  timezone: Timezone
  showVolume: boolean
  logScale: boolean
  overlayIds: string[]
  refreshIntervalMs: RefreshInterval | null
  monitorSoundEnabled: boolean

  sidebarTab: SidebarTab
  sidebarOpen: boolean
  /** Only one pointer tool can be armed at a time, like a chart app's toolbar. */
  activeTool: ChartTool
  selectedNoteId: number | null
  selectedDrawingId: number | null
  replay: ReplayState

  setMarket: (exchange: string, symbol: string) => void
  setSymbol: (symbol: string) => void
  setInterval: (interval: Interval) => void
  setRangePreset: (preset: string) => void
  setCustomRange: (start?: string, end?: string) => void

  toggleTheme: () => void
  toggleTimezone: () => void
  toggleVolume: () => void
  toggleLogScale: () => void
  toggleOverlay: (id: string) => void
  setRefreshInterval: (interval: RefreshInterval | null) => void
  toggleMonitorSound: () => void

  setSidebarTab: (tab: SidebarTab) => void
  toggleSidebar: () => void
  setTool: (tool: ChartTool) => void
  selectNote: (id: number | null) => void
  selectDrawing: (id: number | null) => void

  startReplay: (index: number) => void
  stopReplay: () => void
  setReplayIndex: (index: number) => void
  setReplayPlaying: (playing: boolean) => void
  setReplaySpeed: (speed: number) => void
}

const DEFAULTS = {
  exchange: 'binance',
  symbol: 'BTCUSDT',
  interval: '1h' as Interval,
  rangePreset: '1M',
  theme: 'dark' as ThemeName,
  timezone: 'utc' as Timezone,
  showVolume: true,
  logScale: false,
  overlayIds: DEFAULT_OVERLAYS.map((o) => o.id),
  refreshIntervalMs: 15000 as RefreshInterval,
  monitorSoundEnabled: false,
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      sidebarTab: 'notes',
      sidebarOpen: true,
      activeTool: 'none',
      selectedNoteId: null,
      selectedDrawingId: null,
      replay: { active: false, index: 0, playing: false, speed: 4 },

      setMarket: (exchange, symbol) =>
        set({ exchange, symbol, replay: { active: false, index: 0, playing: false, speed: 4 } }),
      setSymbol: (symbol) =>
        set({
          symbol,
          selectedNoteId: null,
          selectedDrawingId: null,
          activeTool: 'none',
          replay: { active: false, index: 0, playing: false, speed: 4 },
        }),
      setInterval: (interval) =>
        set((state) => ({
          interval,
          // Bar indices are meaningless across timeframes.
          replay: { ...state.replay, active: false, playing: false, index: 0 },
        })),
      setRangePreset: (rangePreset) => set({ rangePreset }),
      setCustomRange: (customStart, customEnd) =>
        set({ customStart, customEnd, rangePreset: 'custom' }),

      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      toggleTimezone: () => set((s) => ({ timezone: s.timezone === 'utc' ? 'local' : 'utc' })),
      toggleVolume: () => set((s) => ({ showVolume: !s.showVolume })),
      toggleLogScale: () => set((s) => ({ logScale: !s.logScale })),
      toggleOverlay: (id) =>
        set((s) => ({
          overlayIds: s.overlayIds.includes(id)
            ? s.overlayIds.filter((o) => o !== id)
            : [...s.overlayIds, id],
        })),
      setRefreshInterval: (refreshIntervalMs) => set({ refreshIntervalMs }),
      toggleMonitorSound: () =>
        set((state) => ({ monitorSoundEnabled: !state.monitorSoundEnabled })),

      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      // Arming a tool clears the current selection so the toolbar and the
      // floating style popover are never both live at once.
      setTool: (activeTool) => set({ activeTool, selectedDrawingId: null }),
      selectNote: (selectedNoteId) => set({ selectedNoteId }),
      selectDrawing: (selectedDrawingId) =>
        set({ selectedDrawingId, activeTool: 'none' }),

      startReplay: (index) =>
        set((s) => ({ replay: { ...s.replay, active: true, index, playing: false } })),
      stopReplay: () =>
        set((s) => ({ replay: { ...s.replay, active: false, playing: false } })),
      setReplayIndex: (index) => set((s) => ({ replay: { ...s.replay, index } })),
      setReplayPlaying: (playing) => set((s) => ({ replay: { ...s.replay, playing } })),
      setReplaySpeed: (speed) => set((s) => ({ replay: { ...s.replay, speed } })),
    }),
    {
      name: 'kline-studio-session',
      version: 1,
      // Transient UI state (replay cursor, selection) is intentionally excluded.
      partialize: (state) => ({
        exchange: state.exchange,
        symbol: state.symbol,
        interval: state.interval,
        rangePreset: state.rangePreset,
        customStart: state.customStart,
        customEnd: state.customEnd,
        theme: state.theme,
        timezone: state.timezone,
        showVolume: state.showVolume,
        logScale: state.logScale,
        overlayIds: state.overlayIds,
        refreshIntervalMs: state.refreshIntervalMs,
        monitorSoundEnabled: state.monitorSoundEnabled,
        sidebarTab: state.sidebarTab,
        sidebarOpen: state.sidebarOpen,
      }),
    },
  ),
)
