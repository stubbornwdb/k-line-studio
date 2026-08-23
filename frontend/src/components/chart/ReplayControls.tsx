import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, X } from 'lucide-react'
import { useEffect } from 'react'

import type { Candle, Interval } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { formatTimestamp, type Timezone } from '@/lib/format'
import { useSession } from '@/store/useSession'

const SPEEDS = [1, 2, 4, 8, 16]

interface Props {
  candles: Candle[]
  interval: Interval
  timezone: Timezone
}

/**
 * Bar-by-bar replay ("复盘"): the chart only sees bars up to the cursor, so
 * indicators and the price scale stay honest about what was knowable then.
 */
export function ReplayControls({ candles, interval, timezone }: Props) {
  const replay = useSession((s) => s.replay)
  const { setReplayIndex, setReplayPlaying, setReplaySpeed, stopReplay } = useSession.getState()
  const last = candles.length - 1

  // Advance one bar per tick; pause automatically at the right edge.
  useEffect(() => {
    if (!replay.playing) return
    const timer = window.setInterval(() => {
      const { replay: current } = useSession.getState()
      if (current.index >= last) {
        setReplayPlaying(false)
        return
      }
      setReplayIndex(current.index + 1)
    }, 1000 / replay.speed)
    return () => window.clearInterval(timer)
  }, [replay.playing, replay.speed, last, setReplayIndex, setReplayPlaying])

  // Space toggles playback, arrows step -- the shortcuts a chart app should have.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.code === 'Space') {
        event.preventDefault()
        setReplayPlaying(!useSession.getState().replay.playing)
      } else if (event.key === 'ArrowRight') {
        setReplayIndex(Math.min(useSession.getState().replay.index + 1, last))
      } else if (event.key === 'ArrowLeft') {
        setReplayIndex(Math.max(useSession.getState().replay.index - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last, setReplayIndex, setReplayPlaying])

  const current = candles[Math.min(replay.index, last)]

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-edge bg-panel-soft px-3 py-2">
      <div className="flex items-center gap-1">
        <Button size="icon" onClick={() => setReplayIndex(0)} title="回到起点">
          <SkipBack className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          onClick={() => setReplayIndex(Math.max(replay.index - 1, 0))}
          title="上一根 (←)"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="primary"
          size="icon"
          onClick={() => setReplayPlaying(!replay.playing)}
          title="播放 / 暂停 (空格)"
        >
          {replay.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="icon"
          onClick={() => setReplayIndex(Math.min(replay.index + 1, last))}
          title="下一根 (→)"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(last, 0)}
        value={Math.min(replay.index, last)}
        onChange={(event) => setReplayIndex(Number(event.target.value))}
        className="h-1 min-w-[8rem] flex-1 cursor-pointer accent-[rgb(var(--accent))]"
        aria-label="回放进度"
      />

      <div className="shrink-0 font-mono text-2xs text-ink-muted">
        {current ? formatTimestamp(current.t, timezone, interval) : '--'}
        <span className="ml-2 text-ink">
          {Math.min(replay.index + 1, candles.length)}/{candles.length}
        </span>
      </div>

      <select
        className="field w-16"
        value={replay.speed}
        onChange={(event) => setReplaySpeed(Number(event.target.value))}
        aria-label="回放速度"
      >
        {SPEEDS.map((speed) => (
          <option key={speed} value={speed}>
            {speed}x
          </option>
        ))}
      </select>

      <Button variant="solid" size="sm" onClick={stopReplay}>
        <X className="h-3 w-3" />
        退出复盘
      </Button>
    </div>
  )
}
