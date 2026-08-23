import clsx from 'clsx'
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import type { ReactNode } from 'react'

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between text-2xs font-medium text-ink-muted">
        {children}
        {hint && <span className="font-normal opacity-70">{hint}</span>}
      </span>
    </label>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx('field w-full', className)} {...rest} />
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx('field h-auto w-full resize-y py-1.5 leading-relaxed', className)}
      {...rest}
    />
  )
}

/** Width is left to the caller -- toolbar selects are narrow, form selects fill. */
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx('field cursor-pointer pr-6', className)} {...rest} />
}
