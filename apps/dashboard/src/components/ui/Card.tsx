'use client'

import React from 'react'
import { cx } from '../../lib/cx'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
}

export function Card({ hover, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-(--border) bg-(--bg-card)',
        hover && 'transition-colors hover:border-(--border-strong)',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
}

export function CardHeader({ title, subtitle, icon, actions, className, ...rest }: CardHeaderProps) {
  return (
    <div
      className={cx(
        'flex items-start justify-between gap-4 border-b border-(--border) px-6 py-5',
        className
      )}
      {...rest}
    >
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 text-(--text-secondary)">{icon}</div>}
        <div>
          <h3 className="text-[15px] font-extrabold text-(--text-primary)">{title}</h3>
          {subtitle && (
            <p className="mt-1 text-xs text-(--text-secondary)">{subtitle}</p>
          )}
        </div>
      </div>
      {actions}
    </div>
  )
}

export function CardBody({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('px-6 py-5', className)} {...rest}>
      {children}
    </div>
  )
}
