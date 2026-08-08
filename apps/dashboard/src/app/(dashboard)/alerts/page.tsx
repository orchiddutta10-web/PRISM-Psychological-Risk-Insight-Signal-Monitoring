'use client'

import React from 'react'
import { Inbox, ShieldAlert, Cpu } from 'lucide-react'
import { motion } from 'framer-motion'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'

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

export default function AlertsPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Alerts"
        title="Guardian Alert Center"
        subtitle="Behavioral and physiological alerts with human-readable contributing factors. No black-box scores, ever."
      />

      <motion.div variants={containerVariants} initial="hidden" animate="show" className="mt-8">
        <motion.div variants={itemVariants} className="rounded-3xl border border-white/5 bg-zinc-900/40 p-8 sm:p-12 backdrop-blur-md shadow-2xl relative overflow-hidden">
          
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-indigo-500/10 to-transparent pointer-events-none opacity-50" />
          
          <div className="relative z-10">
            {/* Empty state */}
            <div className="flex items-center gap-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner">
                <Inbox size={30} strokeWidth={2} className="drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">Alert inbox</p>
                <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-white">Alert Inbox Empty</h2>
              </div>
            </div>

            <p className="mt-6 max-w-[760px] text-base leading-relaxed text-zinc-400 font-medium">
              Your teen&apos;s behavioral baseline is currently stable. No alerts or deviations have been flagged.
            </p>

            {/* Info rows */}
            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-inner hover:bg-white/[0.04] transition-colors">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Cpu size={20} className="drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-500">Phase 1 Integration Active</p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400 font-medium">
                    This interface represents the empty-state template for behavioral alerts. Telemetry signals are being ingested and stored securely, but the ML scoring engine is waiting for baseline formation.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-inner hover:bg-white/[0.04] transition-colors">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <ShieldAlert size={20} className="drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-400">Privacy & Security Disclosures</p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400 font-medium">
                    All alerts follow strict PRISM privacy guidelines. When the ML Engine detects significant deviations in physical movement, app category shifts, or typing cadence, an alert will display human-readable contributing factors. No black-box scores or raw communication content will ever be displayed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </PageContainer>
  )
}
