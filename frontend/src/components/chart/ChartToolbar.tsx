import {
  Clock,
  Download,
  Eraser,
  HelpCircle,
  History,
  Minus,
  Moon,
  PenLine,
  Ruler,
  Minimize2,
  Maximize2,
  Sun,
  TrendingUp,
} from 'lucide-react'

import { RefreshControl } from '@/components/RefreshControl'
import { Button } from '@/components/ui/Button'
import { timezoneLabel } from '@/lib/format'
import type { ChartTool } from '@/lib/drawings'
import { DEFAULT_OVERLAYS } from '@/lib/indicators'
import type { RefreshInterval } from '@/store/useSession'
import { useSession } from '@/store/useSession'

interface Props {
  canReplay: boolean
  drawingCount: number
  onStartReplay: () => void
  onRefresh: () => void
  onClearDrawings: () => void
  refreshing: boolean
  refreshIntervalMs: RefreshInterval | null
  live: boolean
  lastUpdatedAt: number
  isFullscreen: boolean
  onIntervalChange: (value: RefreshInterval | null) => void
  onOpenShortcuts: () => void
  onToggleFullscreen: () => void
  exportHref: string
}

const TOOLS: { tool: ChartTool; label: string; title: string; icon: typeof Minus }[] = [
  { tool: 'trendline', label: '趋势线', title: '趋势线：点起点再点终点', icon: TrendingUp },
  { tool: 'horizontal', label: '水平线', title: '水平线：点击一个价格', icon: Minus },
  { tool: 'measure', label: '测量', title: '测量涨跌幅：点起点再点终点', icon: Ruler },
]

export function ChartToolbar({
  canReplay,
  drawingCount,
  onStartReplay,
  onRefresh,
  onClearDrawings,
  refreshing,
  refreshIntervalMs,
  live,
  lastUpdatedAt,
  isFullscreen,
  onIntervalChange,
  onOpenShortcuts,
  onToggleFullscreen,
  exportHref,
}: Props) {
  const {
    theme,
    timezone,
    showVolume,
    logScale,
    overlayIds,
    activeTool,
    toggleTheme,
    toggleTimezone,
    toggleVolume,
    toggleLogScale,
    toggleOverlay,
    setTool,
  } = useSession()

  const arm = (tool: ChartTool) => setTool(activeTool === tool ? 'none' : tool)

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-3 overflow-x-auto">
      <div className="flex min-w-max items-center gap-1">
        <span className="mr-1 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          指标
        </span>
        {DEFAULT_OVERLAYS.map((overlay) => (
          <Button
            key={overlay.id}
            size="sm"
            active={overlayIds.includes(overlay.id)}
            onClick={() => toggleOverlay(overlay.id)}
            title={`${overlay.type.toUpperCase()}${overlay.period}`}
            style={overlayIds.includes(overlay.id) ? { color: overlay.color } : undefined}
          >
            MA{overlay.period}
          </Button>
        ))}

        <Divider />

        <span className="mx-1 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          显示
        </span>
        <Button size="sm" active={showVolume} onClick={toggleVolume} title="成交量">
          VOL
        </Button>
        <Button size="sm" active={logScale} onClick={toggleLogScale} title="对数坐标">
          LOG
        </Button>

        <Divider />

        <span className="mx-1 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          绘图
        </span>
        {TOOLS.map(({ tool, label, title, icon: Icon }) => (
          <Button
            key={tool}
            size="sm"
            active={activeTool === tool}
            onClick={() => arm(tool)}
            title={title}
          >
            <Icon className="h-3 w-3" />
            {label}
          </Button>
        ))}
        <Button
          size="icon"
          variant="danger"
          disabled={drawingCount === 0}
          onClick={onClearDrawings}
          title={`清空本交易对的 ${drawingCount} 个图形`}
        >
          <Eraser className="h-3.5 w-3.5" />
        </Button>

        <Divider />

        <Button
          size="sm"
          active={activeTool === 'note'}
          onClick={() => arm('note')}
          title="在图上点击添加笔记"
        >
          <PenLine className="h-3 w-3" />
          标注
        </Button>
        <Button size="sm" disabled={!canReplay} onClick={onStartReplay} title="逐根复盘">
          <History className="h-3 w-3" />
          复盘
        </Button>
      </div>

      <div className="ml-auto flex min-w-max shrink-0 items-center gap-1">
        <span className="mx-1 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          系统
        </span>
        <RefreshControl
          intervalMs={refreshIntervalMs}
          lastUpdatedAt={lastUpdatedAt}
          live={live}
          loading={refreshing}
          onIntervalChange={onIntervalChange}
          onRefresh={onRefresh}
        />
        <Button size="sm" onClick={toggleTimezone} title="切换时区">
          <Clock className="h-3 w-3" />
          {timezoneLabel(timezone)}
        </Button>
        <Button
          size="icon"
          onClick={onToggleFullscreen}
          title={isFullscreen ? '退出全屏' : '全屏显示图表'}
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </Button>
        <a
          href={exportHref}
          download
          title="导出 CSV"
          className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded text-ink-muted transition-colors hover:bg-panel-soft hover:text-ink"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
        <Button size="icon" onClick={onOpenShortcuts} title="快捷键帮助">
          <HelpCircle className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" onClick={toggleTheme} title="切换主题">
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-edge" />
}
