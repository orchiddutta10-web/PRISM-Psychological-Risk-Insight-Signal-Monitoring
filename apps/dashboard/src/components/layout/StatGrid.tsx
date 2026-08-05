'use client'

import React from 'react'
import { cx } from '../../lib/cx'

interface StatGridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: 2 | 3 | 4
}

const colClasses: Record<NonNullable<StatGridProps['cols']>, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
}

/** Responsive stat/metric grid. Default 1-col on mobile. */
export function StatGrid({ cols = 4, className, children, ...rest }: StatGridProps) {
  return (
    <div className={cx('grid grid-cols-1 gap-4', colClasses[cols], className)} {...rest}>
      {children}
    </div>
  )
}
