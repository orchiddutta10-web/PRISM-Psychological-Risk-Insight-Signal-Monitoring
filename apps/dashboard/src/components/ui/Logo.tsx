'use client'

import React from 'react'
import { cx } from '../../lib/cx'

interface LogoProps {
  size?: number
  className?: string
  /** Show wordmark next to the mark. */
  wordmark?: boolean
  /** Accent color for the mark (defaults to currentColor). */
  color?: string
}

/** PRISM brand mark — concentric circles (extracted from login/overview inline SVGs). */
export function Logo({ size = 28, className, wordmark = false, color }: LogoProps) {
  return (
    <div className={cx('inline-flex items-center gap-2.5', className)}>
      <div style={{ width: size, height: size }} className="relative shrink-0">
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `2px solid ${color ?? 'currentColor'}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '22%',
            left: '22%',
            width: '44%',
            height: '44%',
            borderRadius: '50%',
            border: `1.5px solid ${color ?? 'currentColor'}`,
            opacity: 0.4,
          }}
        />
      </div>
      {wordmark && (
        <span className="font-mono text-base font-extrabold tracking-[0.16em] text-(--text-primary)">
          PRISM
        </span>
      )}
    </div>
  )
}
