import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'ghost' | 'solid' | 'primary' | 'danger'
type Size = 'sm' | 'md' | 'icon'

const VARIANTS: Record<Variant, string> = {
  ghost: 'text-ink-muted hover:bg-panel-soft hover:text-ink',
  solid: 'border border-edge bg-panel-soft text-ink hover:border-ink-muted hover:bg-panel',
  primary: 'bg-ink text-panel hover:opacity-85',
  danger: 'text-bear hover:bg-bear/10',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-2xs',
  md: 'h-9 px-3 text-xs',
  icon: 'h-8 w-8',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  active?: boolean
  children?: ReactNode
}

export function Button({
  variant = 'ghost',
  size = 'md',
  active = false,
  className,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm font-medium',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent',
        VARIANTS[variant],
        SIZES[size],
        active && 'bg-accent/10 text-accent hover:bg-accent/15 hover:text-accent',
        className,
      )}
      {...rest}
    />
  )
}
