'use client'

import React from 'react'

interface RiskGaugeProps {
  score: number // 0-100
  size?: number
  label?: string
}

function gaugeColor(score: number): string {
  if (score >= 70) return 'var(--status-alert)'
  if (score >= 40) return 'var(--status-warn)'
  return 'var(--status-ok)'
}

/** Circular risk gauge — tokenized for theme support. */
export function RiskGauge({ score, size = 88, label }: RiskGaugeProps) {
  const r = size * 0.41
  const circ = 2 * Math.PI * r
  const arc = (score / 100) * circ
  const color = gaugeColor(score)
  const c = size / 2

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={size * 0.08}
        />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.08}
          strokeDasharray={`${arc} ${circ - arc}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)' }}
        />
        <text
          x={c}
          y={c + size * 0.05}
          textAnchor="middle"
          fontSize={size * 0.2}
          fontWeight={800}
          fill="var(--text-primary)"
          fontFamily="'Space Grotesk', monospace"
        >
          {score}
        </text>
      </svg>
      {label && (
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontWeight: 600 }}>
          {label}
        </p>
      )}
    </div>
  )
}
