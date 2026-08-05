'use client'

import React from 'react'
import { CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { Card, CardBody } from './ui/Card'
import { Badge } from './ui/Badge'

export type Status = 'good' | 'warning' | 'critical'

interface MetricCardProps {
  title: string
  value: number | string
  unit?: string
  icon: React.ReactElement<{ size?: number }>
  status: Status
  progress?: number // 0-100
  lastUpdated: string // formatted string
}

const statusMeta: Record<Status, { badge: 'ok' | 'warn' | 'alert'; bar: string; label: string }> = {
  good: { badge: 'ok', bar: 'var(--accent-sage)', label: 'On track' },
  warning: { badge: 'warn', bar: 'var(--accent-amber)', label: 'Needs review' },
  critical: { badge: 'alert', bar: 'var(--accent-red)', label: 'Attention' },
}

export function MetricCard({
  title,
  value,
  unit = '',
  icon,
  status,
  progress = 0,
  lastUpdated,
}: MetricCardProps) {
  const meta = statusMeta[status]

  return (
    <Card className="h-full">
      <CardBody className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-(--text-secondary)">
            {React.cloneElement(icon, { size: 16 })}
            <span className="text-[13px] font-bold text-(--text-primary)">{title}</span>
          </div>
          <Badge tone={meta.badge} title={meta.label}>
            {status === 'good' && <CheckCircle size={10} />}
            {status === 'warning' && <AlertTriangle size={10} />}
            {status === 'critical' && <Info size={10} />}
            <span className="sr-only">{meta.label}</span>
          </Badge>
        </div>

        <div className="font-mono text-[28px] font-bold leading-none text-(--text-primary) tabular-nums">
          {value}
          {unit && <span className="ml-1 text-sm font-semibold text-(--text-secondary)">{unit}</span>}
        </div>

        <div className="mt-auto space-y-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-(--gray-200)">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: meta.bar }}
            />
          </div>
          <p className="text-[11px] text-(--text-muted)">Last updated: {lastUpdated}</p>
        </div>
      </CardBody>
    </Card>
  )
}

export default MetricCard
