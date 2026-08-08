'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck, Inbox, ShieldAlert, Bell,
  AlertTriangle, CheckCircle, Info, RefreshCw, Check, Cpu
} from 'lucide-react'
import { motion } from 'framer-motion'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  apiFetchSafe, timeAgo, severityOf,
  type ChildDevice, type BackendAlert,
} from '../../../lib/api'

interface AlertRow {
  id: string
  device: string
  severity: 'high' | 'medium' | 'low'
  tier: string
  summary: string
  factors: string[]
  time: string
  read: boolean
}

const SEV_STYLE = {
  high: { label: 'Urgent', text: 'text-red-700 dark:text-red-400', border: 'border-red-500', bg: 'bg-red-50 dark:bg-red-500/10', icon: <AlertTriangle size={16} className="text-red-600 dark:text-red-400" /> },
  medium: { label: 'Moderate', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', icon: <Info size={16} className="text-amber-600 dark:text-amber-400" /> },
  low: { label: 'Notice', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', icon: <CheckCircle size={16} className="text-gray-600 dark:text-gray-400" /> },
}

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
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = useCallback(async (tk: string) => {
    const devices = await apiFetchSafe<ChildDevice[]>('/auth/devices', tk, [])
    const nameOf: Record<string, string> = Object.fromEntries(devices.map(d => [d.id, d.name]))
    const lists = await Promise.all(
      devices.map(d => apiFetchSafe<BackendAlert[]>(`/events/alerts/${d.id}`, tk, []))
    )
    const rows: AlertRow[] = lists
      .flatMap(list => list.map(a => ({
        id: a.id,
        device: nameOf[a.device_id] ?? 'Device',
        severity: severityOf(a.severity_tier),
        tier: a.severity_tier,
        summary: a.plain_language_summary,
        factors: a.contributing_factors ?? [],
        time: timeAgo(a.timestamp),
        read: a.is_viewed,
      })))
      .sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1))
    setAlerts(rows)
    setLastRefresh(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    const tk = localStorage.getItem('prism_token')
    if (!tk) { router.push('/'); return }
    setToken(tk)
    load(tk)
    const iv = setInterval(() => load(tk), 30000)
    return () => clearInterval(iv)
  }, [router, load])

  const acknowledge = async (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a))
    if (token) await apiFetchSafe(`/events/alerts/viewed/${id}`, token, null as any, { method: 'POST' })
  }

  const unread = alerts.filter(a => !a.read).length
  const visible = filter === 'unread' ? alerts.filter(a => !a.read) : alerts

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
          
          <div className="relative z-10 space-y-6">
            {/* Header / Toolbar */}
            <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Bell size={18} className="text-gray-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">{unread} unread</span>
                  <span className="text-sm text-gray-500">· {alerts.length} total</span>
                </div>
                <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
                <div className="flex bg-gray-100 dark:bg-[#2C2C2E] p-1 rounded-lg">
                  {(['all', 'unread'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                        filter === f
                          ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                      }`}
                    >
                      {f === 'all' ? 'All' : 'Unread'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-500">
                {lastRefresh && <span>Updated {lastRefresh.toLocaleTimeString()}</span>}
                <button 
                  onClick={() => token && load(token)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-[#2C2C2E] hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md transition-colors font-medium border border-gray-200 dark:border-gray-700"
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-500 space-y-4">
                <RefreshCw className="animate-spin w-8 h-8 text-gray-300 dark:text-gray-600" />
                <p>Loading alerts...</p>
              </div>
            ) : visible.length === 0 ? (
              <>
                <div className="flex items-center gap-6">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner">
                    <Inbox size={30} strokeWidth={2} className="drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">Alert inbox</p>
                    <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-white">{filter === 'unread' ? 'No unread alerts' : 'Alert Inbox Empty'}</h2>
                  </div>
                </div>

                <p className="mt-6 max-w-[760px] text-base leading-relaxed text-zinc-400 font-medium">
                  Your teen&apos;s behavioral baseline is currently stable. No alerts or deviations have been flagged.
                </p>

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
              </>
            ) : (
              <div className="space-y-3">
                {visible.map(a => {
                  const sev = SEV_STYLE[a.severity]
                  return (
                    <div 
                      key={a.id} 
                      className={`flex flex-col sm:flex-row gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-xl backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-white/20 ${
                        a.read ? 'opacity-60' : 'opacity-100'
                      } border-l-4 ${sev.border}`}
                    >
                      <div className={`w-10 h-10 rounded-lg shrink-0 flex items-center justify-center ${sev.bg}`}>
                        {sev.icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${sev.bg} ${sev.text}`}>
                            {sev.label}
                          </span>
                          <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-md">
                            {a.device}
                          </span>
                          <span className="text-xs text-gray-500">{a.time}</span>
                          {a.read && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium ml-2">
                              <Check size={12} /> Acknowledged
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 leading-relaxed">
                          {a.summary}
                        </p>
                        
                        {a.factors.length > 0 && (
                          <div className="space-y-1.5">
                            {a.factors.map((f, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 mt-2 shrink-0" />
                                <span>{f}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {!a.read && (
                        <div className="sm:pl-4 sm:border-l border-gray-100 dark:border-gray-800 flex items-center shrink-0">
                          <button 
                            onClick={() => acknowledge(a.id)}
                            className="w-full sm:w-auto px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-black text-sm font-semibold rounded-lg transition-colors"
                          >
                            Acknowledge
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            
          </div>
        </motion.div>
      </motion.div>
    </PageContainer>
  )
}
