'use client'

import React from 'react'
import { cx } from '../../lib/cx'

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'default' | 'wide'
}

/** Consistent max-width + horizontal padding wrapper for page content. */
export function PageContainer({ size = 'default', className, children, ...rest }: PageContainerProps) {
  return (
    <div
      className={cx(
        'mx-auto w-full px-4 sm:px-6 lg:px-8',
        size === 'wide' ? 'max-w-[1400px]' : 'max-w-[1200px]',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
