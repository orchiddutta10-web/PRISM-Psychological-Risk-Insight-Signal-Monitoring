'use client'

import React from 'react'
import { BarChart3, Bell, ShieldCheck, Activity } from 'lucide-react'
import { motion } from 'framer-motion'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'

const SIGNALS = [
  { label: 'Screen Time', value: '210 min/day', status: 'Normal', icon: BarChart3 },
  { label: 'Bedtime', value: '22.5 hr', status: 'Normal', icon: ShieldCheck },
  { label: 'Daily Steps', value: '5,900 steps', status: 'Needs review', icon: Activity },
  { label: 'Typing Pace', value: '97 WPM', status: 'Normal', icon: BarChart3 },
]

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
}
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
}

export default function SignalsPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Signals"
        title="Telemetry Signal Overview"
        subtitle="Live behavioral signals across your child's device. Deviations are compared against their rolling baseline."
      />

      <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6 mt-8">
        <motion.section variants={itemVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SIGNALS.map((signal) => {
            const Icon = signal.icon
            const ok = signal.status === 'Normal'
            return (
              <motion.div 
                whileHover={{ y: -5 }}
                key={signal.label} 
                className="flex min-h-[200px] flex-col justify-between rounded-3xl border border-white/5 bg-zinc-900/40 p-6 backdrop-blur-md shadow-2xl relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-white/[0.02] to-transparent pointer-events-none" />
                
                <div className="relative z-10">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-zinc-400 group-hover:text-white group-hover:bg-white/10 transition-colors shadow-inner">
                    <Icon size={20} />
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{signal.label}</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-white tabular-nums drop-shadow-sm">{signal.value}</p>
                </div>
                <div className="mt-6 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 shadow-inner relative z-10">
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Status</span>
                  <Badge tone={ok ? 'ok' : 'warn'} className="shadow-sm">
                    {ok ? '✓ Normal' : '⚠ Needs review'}
                  </Badge>
                </div>
              </motion.div>
            )
          })}
        </motion.section>

        <motion.div variants={itemVariants} className="rounded-3xl border border-white/5 bg-zinc-900/40 p-8 backdrop-blur-md shadow-2xl flex items-start gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            <Bell size={26} className="drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">What happens next</p>
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-400 font-medium max-w-4xl">
              As soon as PRISM detects signal deviations, alerts will populate in the Alerts tab. These alerts are generated strictly from changes in app usage durations, sleep window intervals, movement entropy, or typing cadence metadata — never message or audio content.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </PageContainer>
  )
}
