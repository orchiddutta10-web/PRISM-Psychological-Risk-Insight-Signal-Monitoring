'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'
import { cx } from '../../lib/cx'

type Variant = 'primary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: React.ReactNode
}

const variants: Record<Variant, string> = {
  primary:
    'bg-(--accent) text-(--accent-text) border border-(--accent) hover:opacity-90',
  ghost:
    'bg-transparent text-(--text-primary) border border-(--border) hover:border-(--text-primary) hover:bg-(--bg-main)',
  danger:
    'bg-[#DC2626] text-white border border-[#DC2626] hover:opacity-90',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-2.5 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}
