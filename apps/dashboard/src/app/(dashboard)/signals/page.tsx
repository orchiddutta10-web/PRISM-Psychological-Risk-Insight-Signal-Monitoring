'use client'

import React from 'react'
import { BarChart3, Bell, ShieldCheck, Activity } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Reveal } from '@/lib/motion'

const SIGNALS = [
  { label: 'Screen Time', value: '210 min/day', status: 'Normal', icon: BarChart3 },
  { label: 'Bedtime', value: '22.5 hr', status: 'Normal', icon: ShieldCheck },
  { label: 'Daily Steps', value: '5,900 steps', status: 'Needs review', icon: Activity },
  { label: 'Typing Pace', value: '97 WPM', status: 'Normal', icon: BarChart3 },
]

export default function SignalsPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Signals"
        title="Telemetry signal overview"
        subtitle="Live behavioral signals across your child's device. Deviations are compared against their rolling baseline."
      />

      <Reveal>
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SIGNALS.map((signal) => {
            const Icon = signal.icon
            const ok = signal.status === 'Normal'
            return (
              <Card key={signal.label} className="flex min-h-[180px] flex-col justify-between p-6">
                <div>
                  <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-(--bg-main) text-(--text-secondary)">
                    <Icon size={16} />
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--text-muted)">{signal.label}</p>
                  <p className="mt-2 text-[26px] font-bold leading-tight text-(--text-primary) tabular-nums">{signal.value}</p>
                </div>
                <div className="mt-6 flex items-center justify-between rounded-2xl border border-(--border) bg-(--bg-main) px-4 py-3">
                  <span className="text-[13px] text-(--text-secondary)">Status</span>
                  <Badge tone={ok ? 'ok' : 'warn'}>{ok ? '✓ Normal' : '⚠ Needs review'}</Badge>
                </div>
              </Card>
            )
          })}
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <Card className="mt-6 flex items-start gap-5 p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Bell size={22} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-(--text-muted)">What happens next</p>
            <p className="mt-3 text-[15px] leading-relaxed text-(--text-secondary)">
              As soon as PRISM detects signal deviations, alerts will populate in the Alerts tab. These alerts are generated from changes in app usage, sleep window, movement, or typing metadata — never message or audio content.
            </p>
          </div>
        </Card>
      </Reveal>
    </PageContainer>
  )
}
