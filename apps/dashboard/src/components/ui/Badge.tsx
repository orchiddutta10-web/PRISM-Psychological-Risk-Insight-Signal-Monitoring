'use client'

import React from 'react'
import { cx } from '../../lib/cx'

type Tone = 'ok' | 'warn' | 'alert' | 'info' | 'neutral'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const tones: Record<Tone, string> = {
  ok: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
  warn: 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400',
  alert: 'bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400',
  info: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30 dark:text-indigo-400',
  neutral: 'bg-(--gray-200) text-(--gray-700) border-(--border-strong)',
}

/** Status pill — always pairs color with a label/icon (never color alone). */
export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide',
        tones[tone],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
