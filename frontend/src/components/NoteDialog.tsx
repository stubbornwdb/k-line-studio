import { useEffect, useState } from 'react'

import type { Interval, NoteDraft, NoteKind } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Label, Select, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { formatTimestamp, type Timezone } from '@/lib/format'
import { ALL_INTERVALS } from '@/lib/timeframes'

const KINDS: { value: NoteKind; label: string }[] = [
  { value: 'long', label: '做多 / 看涨' },
  { value: 'short', label: '做空 / 看跌' },
  { value: 'observation', label: '观察 / 记录' },
]

const TEMPLATES: {
  label: string
  kind: NoteKind
  title: string
  body: string
  tags: string[]
}[] = [
  {
    label: '突破确认',
    kind: 'long',
    title: '突破确认',
    body: '结构：\n触发：\n确认信号：\n失效条件：',
    tags: ['突破', '确认'],
  },
  {
    label: '趋势延续',
    kind: 'observation',
    title: '趋势延续观察',
    body: '当前趋势：\n回踩位置：\n需要等待：\n风险点：',
    tags: ['趋势', '回踩'],
  },
  {
    label: '交易复盘',
    kind: 'short',
    title: '交易复盘',
    body: '入场理由：\n执行情况：\n结果：\n下次改进：',
    tags: ['复盘'],
  },
]

export interface NoteFormValue {
  id?: number
  time_ms: number
  price: number | null
  title: string
  body: string
  kind: NoteKind
  tags: string[]
  interval: Interval | null
}

interface Props {
  open: boolean
  value: NoteFormValue | null
  exchange: string
  symbol: string
  interval: Interval
  timezone: Timezone
  onClose: () => void
  onSubmit: (draft: NoteDraft & { id?: number }) => void
  onDelete?: (id: number) => void
}

export function NoteDialog({
  open,
  value,
  exchange,
  symbol,
  interval,
  timezone,
  onClose,
  onSubmit,
  onDelete,
}: Props) {
  const [form, setForm] = useState<NoteFormValue | null>(value)

  useEffect(() => setForm(value), [value])

  if (!form) return null

  const patch = (changes: Partial<NoteFormValue>) =>
    setForm((current) => (current ? { ...current, ...changes } : current))

  const submit = () => {
    if (!form.title.trim()) return
    onSubmit({
      id: form.id,
      exchange,
      symbol,
      interval: form.interval,
      time_ms: form.time_ms,
      price: form.price,
      title: form.title.trim(),
      body: form.body,
      kind: form.kind,
      tags: form.tags,
    })
  }

  return (
    <Modal
      open={open}
      title={form.id ? '编辑复盘笔记' : '新增复盘笔记'}
      onClose={onClose}
      footer={
        <>
          {form.id && onDelete && (
            <Button variant="danger" onClick={() => onDelete(form.id!)}>
              删除
            </Button>
          )}
          <Button variant="solid" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} disabled={!form.title.trim()}>
            保存
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>类型</Label>
          <Select
            className="w-full"
            value={form.kind}
            onChange={(e) => patch({ kind: e.target.value as NoteKind })}
          >
            {KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>适用周期</Label>
          <Select
            className="w-full"
            value={form.interval ?? ''}
            onChange={(e) => patch({ interval: (e.target.value || null) as Interval | null })}
          >
            <option value="">全部周期</option>
            {ALL_INTERVALS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label hint={formatTimestamp(form.time_ms, timezone, interval)}>锚定时间</Label>
          <TextInput value={new Date(form.time_ms).toISOString()} readOnly className="opacity-70" />
        </div>
        <div>
          <Label>价格（可选）</Label>
          <TextInput
            type="number"
            step="any"
            value={form.price ?? ''}
            onChange={(e) => patch({ price: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <Label>快速模板</Label>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((template) => (
            <Button
              key={template.label}
              size="sm"
              variant="solid"
              onClick={() =>
                patch({
                  kind: template.kind,
                  title: template.title,
                  body: template.body,
                  tags: template.tags,
                })
              }
            >
              {template.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label>标题</Label>
        <TextInput
          value={form.title}
          autoFocus
          placeholder="例如：日线级别突破前高，放量确认"
          onChange={(e) => patch({ title: e.target.value })}
        />
      </div>

      <div>
        <Label>内容</Label>
        <TextArea
          rows={5}
          value={form.body}
          placeholder="当时的逻辑、入场理由、风险点、事后复盘结论…"
          onChange={(e) => patch({ body: e.target.value })}
        />
      </div>

      <div>
        <Label hint="逗号分隔">标签</Label>
        <TextInput
          value={form.tags.join(', ')}
          placeholder="突破, 假信号, 情绪"
          onChange={(e) =>
            patch({
              tags: e.target.value
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
    </Modal>
  )
}
