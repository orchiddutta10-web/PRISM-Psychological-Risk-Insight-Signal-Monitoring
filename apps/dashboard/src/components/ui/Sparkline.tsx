'use client'

import React from 'react'

export interface SparkPoint {
  label?: string
  value: number
  baseline?: number
}

interface SparklineProps {
  data: SparkPoint[]
  width?: number
  height?: number
  showBaseline?: boolean
}

/**
 * Tokenized SVG sparkline. Uses CSS variables for stroke colors so it adapts
 * to light/dark/high-contrast themes automatically.
 */
export function Sparkline({ data, width = 680, height = 90, showBaseline = true }: SparklineProps) {
  if (!data.length) return null

  const pad = { t: 8, b: 8, l: 4, r: 4 }
  const allVals = data.flatMap((d) =>
    showBaseline && typeof d.baseline === 'number' ? [d.value, d.baseline] : [d.value]
  )
  const min = Math.min(...allVals) - 15
  const max = Math.max(...allVals) + 15
  const sx = (i: number) => pad.l + (i / (data.length - 1)) * (width - pad.l - pad.r)
  const sy = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b)

  const aPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d.value).toFixed(1)}`)
    .join(' ')
  const aFill = [
    ...data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d.value).toFixed(1)}`),
    `L ${sx(data.length - 1).toFixed(1)} ${height} L ${sx(0).toFixed(1)} ${height} Z`,
  ].join(' ')
  const bPath = showBaseline
    ? data
        .map(
          (d, i) =>
            `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy((d.baseline ?? d.value)).toFixed(1)}`
        )
        .join(' ')
    : ''

  const gridColor = 'var(--border)'
  const accent = 'var(--accent)'
  const accentSoft = 'var(--accent-text)'
  const baselineColor = 'var(--border-strong)'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible', display: 'block', width: '100%' }}
    >
      <defs>
        <linearGradient id="sparkAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.08" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1={pad.l}
          y1={pad.t + p * (height - pad.t - pad.b)}
          x2={width - pad.r}
          y2={pad.t + p * (height - pad.t - pad.b)}
          stroke={gridColor}
          strokeWidth={1}
        />
      ))}
      <path d={aFill} fill="url(#sparkAreaGrad)" />
      {showBaseline && (
        <path
          d={bPath}
          fill="none"
          stroke={baselineColor}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      )}
      <path
        d={aPath}
        fill="none"
        stroke={accent}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <circle
          key={i}
          cx={sx(i)}
          cy={sy(d.value)}
          r={i === data.length - 1 ? 4 : 2.5}
          fill={i === data.length - 1 ? accent : accentSoft}
          stroke={accent}
          strokeWidth={i === data.length - 1 ? 0 : 1.5}
        />
      ))}
    </svg>
  )
}
