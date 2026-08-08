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
        'rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 shadow-sm relative overflow-hidden',
        hover && 'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-lg hover:-translate-y-1 hover:border-zinc-300 dark:hover:border-zinc-700',
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
        'flex items-start justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800/60 px-6 py-5 bg-zinc-50/50 dark:bg-zinc-900/20',
        className
      )}
      {...rest}
    >
      <div className="flex items-center gap-3">
        {icon && <div className="text-zinc-500 dark:text-zinc-400 p-2 bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 shrink-0">{icon}</div>}
        <div>
          <h3 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
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
