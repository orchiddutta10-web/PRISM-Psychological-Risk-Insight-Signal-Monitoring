'use client'

import React from 'react'
import { Inbox, ShieldAlert, Cpu } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Reveal } from '@/lib/motion'

export default function AlertsPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Alerts"
        title="Guardian alert center"
        subtitle="Behavioral and physiological alerts with human-readable contributing factors. No black-box scores, ever."
      />

      <Reveal>
        <Card className="p-6 sm:p-8">
          {/* Empty state */}
          <div className="flex items-center gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Inbox size={26} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-(--text-muted)">Alert inbox</p>
              <h2 className="mt-1 text-[24px] font-extrabold text-(--text-primary)">Alert Inbox Empty</h2>
            </div>
          </div>

          <p className="mt-5 max-w-[760px] text-[15px] leading-relaxed text-(--text-secondary)">
            Your teen&apos;s behavioral baseline is currently stable. No alerts or deviations have been flagged.
          </p>

          {/* Info rows */}
          <div className="mt-8 space-y-4">
            <div className="flex items-start gap-4 rounded-2xl border border-(--border) bg-(--bg-main) p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Cpu size={18} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-(--text-muted)">Phase 1 Integration Active</p>
                <p className="mt-2 text-[14px] leading-relaxed text-(--text-secondary)">
                  This interface represents the empty-state template for behavioral alerts. Telemetry signals are being ingested and stored securely, but the ML scoring engine is not active yet.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-2xl border border-(--border) bg-(--bg-main) p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <ShieldAlert size={18} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-(--text-muted)">Privacy & Security Disclosures</p>
                <p className="mt-2 text-[14px] leading-relaxed text-(--text-secondary)">
                  All alerts will follow the strict PRISM privacy guidelines. When the ML Engine detects significant deviations in physical movement, app category shifts, or typing cadence, an alert will be displayed with human-readable contributing factors. No black-box diagnostic scores or raw communication content will ever be displayed.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </Reveal>
    </PageContainer>
  )
}
