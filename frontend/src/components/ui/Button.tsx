import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'ghost' | 'solid' | 'primary' | 'danger'
type Size = 'sm' | 'md' | 'icon'

const VARIANTS: Record<Variant, string> = {
  ghost: 'text-ink-muted hover:bg-panel-soft hover:text-ink',
  solid: 'border border-edge bg-panel-soft text-ink hover:border-ink-muted',
  primary: 'bg-accent text-white hover:brightness-110',
  danger: 'text-bear hover:bg-bear/10',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2 text-2xs',
  md: 'h-8 px-3 text-xs',
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
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded font-medium',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent',
        VARIANTS[variant],
        SIZES[size],
        active && 'bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent',
        className,
      )}
      {...rest}
    />
  )
}
