'use client'

import React from 'react'
import { cx } from '../../lib/cx'

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

/** Standardized page header: eyebrow → title → subtitle, with right-actions slot. */
export function PageHeader({ eyebrow, title, subtitle, actions, className, ...rest }: PageHeaderProps) {
  return (
    <div
      className={cx(
        'mb-7 flex flex-wrap items-start justify-between gap-4',
        className
      )}
      {...rest}
    >
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-(--text-muted)">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-(--text-primary)">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-[760px] text-[15px] leading-relaxed text-(--text-secondary)">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  )
}
