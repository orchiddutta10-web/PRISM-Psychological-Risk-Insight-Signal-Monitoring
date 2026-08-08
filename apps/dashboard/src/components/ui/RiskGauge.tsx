'use client'

import React from 'react'

interface RiskGaugeProps {
  score: number // 0-100
  size?: number
  label?: string
}

function gaugeColor(score: number): { stroke: string, track: string } {
  if (score >= 70) return { stroke: '#EF4444', track: 'rgba(239, 68, 68, 0.15)' } // Red-500
  if (score >= 40) return { stroke: '#F59E0B', track: 'rgba(245, 158, 11, 0.15)' } // Amber-500
  return { stroke: '#10B981', track: 'rgba(16, 185, 129, 0.15)' } // Emerald-500
}

/** Circular risk gauge — redesigned for premium look. */
export function RiskGauge({ score, size = 88, label }: RiskGaugeProps) {
  const r = size * 0.41
  const circ = 2 * Math.PI * r
  const arc = (score / 100) * circ
  const { stroke, track } = gaugeColor(score)
  const c = size / 2

  return (
    <div className="flex flex-col items-center justify-center relative">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background Track */}
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={track}
            strokeWidth={size * 0.08}
          />
          {/* Progress Arc */}
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={size * 0.08}
            strokeDasharray={`${arc} ${circ - arc}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${c} ${c})`}
            className="transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
          />
          {/* Score Text */}
          <text
            x={c}
            y={c + size * 0.07}
            textAnchor="middle"
            fontSize={size * 0.22}
            fontWeight={800}
            className="fill-zinc-900 dark:fill-white font-sans tracking-tight"
          >
            {score}
          </text>
        </svg>
        {/* Subtle glow effect behind the text for premium feel */}
        <div 
          className="absolute inset-0 rounded-full blur-xl mix-blend-screen opacity-10 pointer-events-none" 
          style={{ backgroundColor: stroke }} 
        />
      </div>
      
      {label && (
        <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mt-1 uppercase tracking-wider">
          {label}
        </p>
      )}
    </div>
  )
}
