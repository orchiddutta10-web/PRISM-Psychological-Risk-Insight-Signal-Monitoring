'use client'

import React from 'react'
import Image from 'next/image'
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
export function Logo({ size = 28, className, wordmark = false }: LogoProps) {
  return (
    <div className={cx('inline-flex items-center gap-2.5', className)}>
      <div style={{ width: size, height: size }} className="relative shrink-0 overflow-hidden rounded-full">
        <Image
          src="/prism-logo.jpeg"
          alt="PRISM"
          fill
          sizes={`${size}px`}
          className="object-contain"
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
