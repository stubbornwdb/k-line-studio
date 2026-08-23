import clsx from 'clsx'
import { Pencil, Plus, Tag } from 'lucide-react'
import { useMemo } from 'react'

import type { Interval, Note } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { formatPrice, formatTimestamp, type Timezone } from '@/lib/format'

const KIND_STYLE: Record<Note['kind'], { label: string; className: string }> = {
  long: { label: '多', className: 'bg-bull/15 text-bull' },
  short: { label: '空', className: 'bg-bear/15 text-bear' },
  observation: { label: '观', className: 'bg-accent/15 text-accent' },
}

interface Props {
  notes: Note[]
  loading: boolean
  interval: Interval
  timezone: Timezone
  decimals: number
  selectedId: number | null
  onSelect: (id: number) => void
  onEdit: (note: Note) => void
  onCreate: () => void
}

export function NotesPanel({
  notes,
  loading,
  interval,
  timezone,
  decimals,
  selectedId,
  onSelect,
  onEdit,
  onCreate,
}: Props) {
  const sorted = useMemo(() => [...notes].sort((a, b) => b.time_ms - a.time_ms), [notes])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
          复盘笔记 · {notes.length}
        </span>
        <Button size="sm" variant="primary" onClick={onCreate}>
          <Plus className="h-3 w-3" />
          新增
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <p className="px-3 py-4 text-2xs text-ink-muted">加载中…</p>}
        {!loading && sorted.length === 0 && (
          <p className="px-3 py-4 text-2xs leading-relaxed text-ink-muted">
            还没有笔记。点击工具栏的「标注」后在 K 线上任意位置点击，即可在该时间点记录当时的想法。
          </p>
        )}

        {sorted.map((note) => {
          const style = KIND_STYLE[note.kind]
          return (
            <article
              key={note.id}
              onClick={() => onSelect(note.id)}
              className={clsx(
                'group cursor-pointer border-b border-edge px-3 py-2.5 transition-colors',
                note.id === selectedId ? 'bg-accent/10' : 'hover:bg-panel-soft',
              )}
            >
              <div className="flex items-start gap-2">
                <span className={clsx('chip mt-0.5 shrink-0', style.className)}>{style.label}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xs font-medium">{note.title}</h3>
                  <p className="mt-0.5 font-mono text-2xs text-ink-muted">
                    {formatTimestamp(note.time_ms, timezone, note.interval ?? interval)}
                    {note.price !== null && ` · ${formatPrice(note.price, decimals)}`}
                    {note.interval && ` · ${note.interval}`}
                  </p>
                  {note.body && (
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-2xs leading-relaxed text-ink-muted">
                      {note.body}
                    </p>
                  )}
                  {note.tags.length > 0 && (
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-2xs text-ink-muted">
                      <Tag className="h-2.5 w-2.5" />
                      {note.tags.map((tag) => (
                        <span key={tag} className="chip bg-panel-soft">
                          {tag}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <Button
                  size="icon"
                  className="opacity-0 transition group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    onEdit(note)
                  }}
                  title="编辑"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
