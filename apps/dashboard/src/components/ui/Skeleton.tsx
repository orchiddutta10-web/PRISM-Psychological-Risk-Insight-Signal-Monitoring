'use client'

import React from 'react'
import { cx } from '../../lib/cx'

/** Skeleton loading placeholder (uses the .skeleton animation from globals.css). */
export function Skeleton({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('skeleton', className)} {...rest} />
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-(--border) bg-(--bg-card) p-6">
      <Skeleton className="mb-4 h-4 w-1/3" />
      <Skeleton className="mb-2 h-8 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}
