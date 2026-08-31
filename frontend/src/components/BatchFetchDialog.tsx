import clsx from 'clsx'
import { Download, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { pollBatchJob, startBatchFetch } from '@/api/queries'
import type { BatchJob, Ticker } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

type BatchInterval = '4h' | '1d'

const INTERVALS: { value: BatchInterval; label: string }[] = [
  { value: '4h', label: '4小时' },
  { value: '1d', label: '日线' },
]

interface Props {
  open: boolean
  exchange: string
  tickers: Ticker[]
  onClose: () => void
}

export function BatchFetchDialog({ open, exchange, tickers, onClose }: Props) {
  const [selected, setSelected] = useState<BatchInterval[]>(['4h', '1d'])
  const [rangeDays, setRangeDays] = useState(365)
  const [job, setJob] = useState<BatchJob | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const running = job !== null && (job.status === 'queued' || job.status === 'running')
  const done = job !== null && !running

  const toggle = (iv: BatchInterval) => {
    setSelected((prev) =>
      prev.includes(iv) ? prev.filter((v) => v !== iv) : [...prev, iv],
    )
  }

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  useEffect(() => cleanup, [cleanup])

  const handleStart = async () => {
    if (selected.length === 0 || tickers.length === 0) return
    cleanup()
    const result = await startBatchFetch({
      exchange,
      symbols: tickers.map((t) => t.symbol),
      intervals: selected,
      range_days: rangeDays,
    })
    setJob(result)
    poll(result.id)
  }

  const poll = (jobId: string) => {
    timerRef.current = setTimeout(async () => {
      try {
        const updated = await pollBatchJob(jobId)
        setJob(updated)
        if (updated.status === 'queued' || updated.status === 'running') {
          poll(jobId)
        }
      } catch {
        poll(jobId)
      }
    }, 800)
  }

  const handleClose = () => {
    if (!running) {
      setJob(null)
      onClose()
    }
  }

  const totalTasks = tickers.length * selected.length
  const progress = job ? (job.completed + job.failed) / Math.max(job.total, 1) : 0

  return (
    <Modal open={open} title="批量拉取次新币 K 线" onClose={handleClose}>
      {!job && (
        <>
          <div className="space-y-2">
            <p className="text-2xs text-ink-muted">
              将为当前筛选的 <strong>{tickers.length}</strong> 个次新合约批量拉取 K 线数据，
              拉取后可快速切换浏览。
            </p>

            <div>
              <p className="mb-1 text-2xs font-medium">K 线级别</p>
              <div className="flex gap-1.5">
                {INTERVALS.map((iv) => (
                  <button
                    key={iv.value}
                    type="button"
                    onClick={() => toggle(iv.value)}
                    className={clsx(
                      'rounded border px-3 py-1.5 text-xs transition-colors',
                      selected.includes(iv.value)
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-edge text-ink-muted hover:text-ink',
                    )}
                  >
                    {iv.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-2xs font-medium">拉取范围</p>
              <div className="flex gap-1.5">
                {[
                  { days: 90, label: '90天' },
                  { days: 180, label: '半年' },
                  { days: 365, label: '1年' },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setRangeDays(opt.days)}
                    className={clsx(
                      'rounded border px-3 py-1.5 text-xs transition-colors',
                      rangeDays === opt.days
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-edge text-ink-muted hover:text-ink',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-2xs text-ink-muted">
              共 {totalTasks} 个任务（{tickers.length} 币 × {selected.length} 级别）
            </p>
          </div>
          <div className="flex justify-end pt-1">
            <Button
              variant="primary"
              size="sm"
              disabled={selected.length === 0 || tickers.length === 0}
              onClick={handleStart}
            >
              <Download className="h-3.5 w-3.5" />
              开始拉取
            </Button>
          </div>
        </>
      )}

      {job && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {running && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
            <span className="text-xs font-medium">
              {running
                ? `正在拉取… ${job.completed + job.failed} / ${job.total}`
                : `拉取完成 — ${job.completed} 成功${job.failed > 0 ? `，${job.failed} 失败` : ''}`}
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-panel-soft">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-300',
                done ? (job.failed > 0 ? 'bg-amber-500' : 'bg-green-500') : 'bg-accent',
              )}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>

          <div className="max-h-48 space-y-1 overflow-y-auto">
            {job.items.map((item) => (
              <div
                key={`${item.symbol}-${item.interval}`}
                className="flex items-center justify-between rounded px-2 py-1 text-2xs"
              >
                <span className="truncate font-medium">
                  {item.symbol}
                  <span className="ml-1 text-ink-muted">{item.interval}</span>
                </span>
                <span
                  className={clsx(
                    item.status === 'completed' && 'text-green-500',
                    item.status === 'failed' && 'text-bear',
                    item.status === 'running' && 'text-accent',
                    item.status === 'queued' && 'text-ink-muted',
                  )}
                >
                  {item.status === 'completed'
                    ? `${item.fetched} 根`
                    : item.status === 'failed'
                      ? '失败'
                      : item.status === 'running'
                        ? '拉取中…'
                        : '等待中'}
                </span>
              </div>
            ))}
          </div>

          {done && (
            <div className="flex justify-end">
              <Button size="sm" onClick={handleClose}>
                关闭
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
