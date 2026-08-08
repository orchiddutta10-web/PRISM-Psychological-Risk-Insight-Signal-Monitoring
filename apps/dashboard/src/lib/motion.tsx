'use client'

import React, { useEffect, useRef, useState } from 'react'
import { cx } from './cx'

/** Respect prefers-reduced-motion — disables reveal transforms. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

interface RevealProps {
  children: React.ReactNode
  /** Stagger delay in seconds, applied via animation-delay. */
  delay?: number
  /** Animation class — default 'anim-fade-up'. */
  variant?: 'fade-up' | 'fade-in'
  className?: string
  as?: React.ElementType
}

/**
 * Reveal — IntersectionObserver-driven entrance animation.
 * Falls back to immediately visible if reduced-motion is preferred.
 */
export function Reveal({
  children,
  delay = 0,
  variant = 'fade-up',
  className,
  as = 'div',
}: RevealProps) {
  const Tag = as as any
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [reduced])

  return (
    <Tag
      ref={ref}
      className={cx(
        visible && !reduced && (variant === 'fade-in' ? 'anim-fade-in' : 'anim-fade-up'),
        className
      )}
      style={visible && !reduced ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </Tag>
  )
}
