import clsx from 'clsx'

interface Option<T extends string> {
  value: T
  label: string
  title?: string
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/** Compact button strip -- the timeframe / range selector pattern. */
export function Segmented<T extends string>({ options, value, onChange, className }: Props<T>) {
  return (
    <div className={clsx('flex items-center gap-0.5 rounded bg-panel-soft p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          onClick={() => onChange(option.value)}
          className={clsx(
            'h-7 min-w-[2rem] rounded px-2 text-2xs font-medium transition-colors',
            option.value === value
              ? 'bg-accent text-white'
              : 'text-ink-muted hover:bg-panel hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
