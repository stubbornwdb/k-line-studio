import clsx from 'clsx'
import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useSymbols } from '@/api/queries'
import type { SymbolInfo } from '@/api/types'

const MAX_RENDERED = 300

interface Props {
  exchange: string
  symbol: string
  onSelect: (symbol: string) => void
}

/** Searchable instrument picker -- exchanges list hundreds of perpetuals. */
export function SymbolPicker({ exchange, symbol, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data, isLoading, isError, error } = useSymbols(exchange)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const matches = useMemo(() => {
    const all = data?.symbols ?? []
    const needle = query.trim().toUpperCase().replace('/', '')
    if (!needle) return all.slice(0, MAX_RENDERED)
    return all
      .filter(
        (item) =>
          item.symbol.includes(needle) || item.display.replace('/', '').includes(needle),
      )
      .slice(0, MAX_RENDERED)
  }, [data, query])

  const pick = (item: SymbolInfo) => {
    onSelect(item.symbol)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 min-w-[9rem] items-center justify-between gap-2 rounded border
          border-edge bg-panel-soft px-2.5 text-xs font-semibold transition-colors
          hover:border-ink-muted"
      >
        <span className="truncate">{symbol}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-9 z-40 w-72 overflow-hidden rounded-lg border
            border-edge bg-panel shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-edge px-2.5 py-2">
            <Search className="h-3.5 w-3.5 text-ink-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索交易对，如 BTC / ETHUSDT"
              className="w-full bg-transparent text-xs outline-none placeholder:text-ink-muted"
            />
          </div>

          <div className="max-h-80 overflow-y-auto py-1">
            {isLoading && <Hint>加载合约列表…</Hint>}
            {isError && <Hint tone="error">{(error as Error)?.message ?? '加载失败'}</Hint>}
            {!isLoading && !isError && matches.length === 0 && <Hint>没有匹配的交易对</Hint>}

            {matches.map((item) => (
              <button
                key={item.symbol}
                type="button"
                onClick={() => pick(item)}
                className={clsx(
                  'flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs',
                  'transition-colors hover:bg-panel-soft',
                  item.symbol === symbol && 'bg-accent/10 text-accent',
                )}
              >
                <span className="font-medium">{item.display}</span>
                <span className="font-mono text-2xs text-ink-muted">{item.symbol}</span>
              </button>
            ))}
          </div>

          {data && (
            <div className="border-t border-edge px-2.5 py-1.5 text-2xs text-ink-muted">
              共 {data.count} 个永续合约
              {matches.length === MAX_RENDERED && ` · 显示前 ${MAX_RENDERED} 条`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Hint({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <p className={clsx('px-2.5 py-3 text-2xs', tone === 'error' ? 'text-bear' : 'text-ink-muted')}>
      {children}
    </p>
  )
}
