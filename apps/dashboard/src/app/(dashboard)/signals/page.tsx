'use client'

<<<<<<< HEAD
import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3, Bell, ShieldCheck, MapPin, Keyboard, Smartphone, Activity, Radio, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  apiFetchSafe,
  type ChildDevice, type RiskScore, type BaselineMap, type IngestionHealth,
} from '../../../lib/api'

const MODALITIES = [
  { key: 'location', label: 'Mobility / Location', unit: 'steps', icon: MapPin },
  { key: 'typing', label: 'Typing Dynamics', unit: 'delay index', icon: Keyboard },
  { key: 'app_usage', label: 'App Usage', unit: 'hrs/day', icon: Smartphone },
  { key: 'gsr', label: 'GSR (Physio)', unit: 'µS', icon: Activity },
  { key: 'voice', label: 'Voice Check-ins', unit: 'sessions', icon: Radio },
]

interface SignalRow {
  key: string
  label: string
  unit: string
  icon: any
  baselineMean: number | null
  variance: number | null
  latestScore: number | null
  flagged: boolean
  factor: string | null
  stream: 'real' | 'synthetic' | 'inactive'
}

export default function SignalsPage() {
  const router = useRouter()
  const [guardian, setGuardian] = useState('Guardian')
  const [deviceName, setDeviceName] = useState('')
  const [rows, setRows] = useState<SignalRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (token: string) => {
    const devices = await apiFetchSafe<ChildDevice[]>('/auth/devices', token, [])
    console.log("DEVICES_FETCHED:", JSON.stringify(devices))
    if (!devices.length) { setRows([]); setLoading(false); return }
    const selected = localStorage.getItem('prism_selected_device')
    const device = devices.find(d => d.id === selected) ?? devices[0]
    console.log("SELECTED_DEVICE:", JSON.stringify(device))
    setDeviceName(device.name)

    const [baselines, scores, health] = await Promise.all([
      apiFetchSafe<BaselineMap>(`/events/baselines/${device.id}`, token, {}),
      apiFetchSafe<RiskScore[]>(`/events/scores/${device.id}`, token, []),
      apiFetchSafe<IngestionHealth>('/internal/ingestion/health', token, null as any),
    ])
    console.log("BASELINES_FETCHED:", JSON.stringify(baselines))
    console.log("SCORES_FETCHED:", JSON.stringify(scores))

    setRows(MODALITIES.map(m => {
      const bl = baselines[m.key]
      const modelScores = scores.filter(s => s.model_name === m.key)
      const latest = modelScores[0] ?? null
      const stream = (health?.active_modalities?.[m.key] ?? 'inactive') as SignalRow['stream']
      return {
        key: m.key,
        label: m.label,
        unit: m.unit,
        icon: m.icon,
        baselineMean: bl ? bl.mean : null,
        variance: bl ? bl.variance : null,
        latestScore: latest ? latest.score : null,
        flagged: latest?.flagged ?? false,
        factor: latest?.contributing_factors?.[0] ?? null,
        stream: stream === 'real' || stream === 'synthetic' ? stream : 'inactive',
      }
    }))
    setLoading(false)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    if (!token) { router.push('/'); return }
    const stored = localStorage.getItem('prism_guardian')
    if (stored) {
      try { setGuardian(JSON.parse(stored).full_name || 'Guardian') } catch {}
    }
    load(token)
    const iv = setInterval(() => load(token), 30000)
    return () => clearInterval(iv)
  }, [router, load])

  const fmtMean = (v: number) => (v < 10 ? v.toFixed(2) : Math.round(v).toLocaleString())

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-[1440px] mx-auto p-4 md:p-6 lg:p-8"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 relative">
        <div className="absolute top-0 right-10 w-96 h-96 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="relative z-10">
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <Radio size={12} className="animate-pulse" /> Raw Telemetry Feeds
          </p>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Signal Analysis</h1>
          {deviceName && (
            <p className="text-xs text-gray-500 mt-2 font-medium flex items-center gap-2">
              <Smartphone size={14} /> Active Node: <span className="text-indigo-400 font-bold">{deviceName}</span>
            </p>
          )}
        </div>
        
        <div className="relative z-10 text-right bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-800 rounded-xl p-3 px-5 shadow-sm">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Guardian Session</p>
          <p className="text-sm font-bold text-gray-900 dark:text-white">{guardian}</p>
        </div>
      </header>

      <button onClick={() => router.push('/overview')} className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-indigo-500 transition-colors mb-8 group bg-transparent border-0">
        <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Back to Mission Control
      </button>


      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
          <RefreshCw className="animate-spin text-indigo-500" size={32} />
          <p className="text-sm font-medium tracking-wide">Syncing baseline matrices...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white/50 dark:bg-[#1C1C1E]/50 backdrop-blur-xl border border-gray-200 dark:border-gray-800 rounded-3xl p-12 text-center shadow-lg relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5" />
          <BarChart3 size={40} className="mx-auto mb-6 text-gray-400" />
          <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-3 relative z-10">No Device Telemetry</h2>
          <p className="text-sm text-gray-500 max-w-lg mx-auto leading-relaxed relative z-10">
            Signal cards populate from real baseline profiles and model scores once a device is registered and telemetry begins flowing.
          </p>
        </div>
      ) : (
        <motion.div 
          initial="hidden" animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5"
        >
          {rows.map(row => {
            const Icon = row.icon
            const hasBaseline = row.baselineMean !== null
            const isWarning = row.flagged
            const isOffline = row.stream === 'inactive'

            const iconColor = isOffline ? 'text-slate-400' : isWarning ? 'text-rose-500' : 'text-teal-500';
            const bgGrad = isOffline ? 'from-slate-500/5' : isWarning ? 'from-rose-500/10' : 'from-teal-500/10';
            const strokeColor = isOffline ? '#64748b' : isWarning ? '#f43f5e' : '#14b8a6';
            const borderClass = isWarning ? 'border-rose-200 dark:border-rose-900/50 shadow-[0_0_20px_rgba(244,63,94,0.1)]' : 'border-gray-200 dark:border-gray-800';

            return (
              <motion.div 
                key={row.key} 
                variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
                whileHover={{ y: -5, scale: 1.02 }}
                className={`relative overflow-hidden bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border ${borderClass} rounded-2xl p-5 transition-all duration-300 group`}
              >
                {/* Background Gradient */}
                <div className={`absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t ${bgGrad} to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500`} />
                
                {/* Waveform graphic */}
                <div className="absolute -bottom-2 -left-2 -right-2 opacity-20 group-hover:opacity-40 transition-opacity duration-500 pointer-events-none">
                  <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-16">
                    <path d={isWarning 
                        ? "M0,10 Q10,0 20,10 T40,10 T60,0 T80,15 T100,5 L100,20 L0,20 Z" 
                        : "M0,10 Q15,12 25,10 T50,10 T75,10 T100,10 L100,20 L0,20 Z"} 
                      fill={strokeColor} />
                  </svg>
                </div>

                <div className="relative z-10 h-full flex flex-col justify-between min-h-[160px]">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-500 w-3/4">{row.label}</p>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-white/5 bg-black/20 backdrop-blur-sm shadow-inner`}>
                        <Icon size={14} className={iconColor} />
                      </div>
                    </div>

                    {hasBaseline ? (
                      <div className="mb-2">
                        <p className="text-3xl font-black font-mono text-gray-900 dark:text-white tracking-tighter">
                          {fmtMean(row.baselineMean!)}
                          <span className="text-xs font-bold text-gray-500 ml-1.5 font-sans lowercase">{row.unit}</span>
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-gray-500 leading-relaxed mb-4">
                        Aggregation pending
                      </p>
                    )}

                    <div className="flex flex-col gap-1 text-[10px] font-mono text-gray-400">
                      <span>{row.variance !== null && `σ² ${(row.variance < 1 ? row.variance.toFixed(3) : row.variance.toFixed(1))} `}</span>
                      <span>Score: {row.latestScore !== null ? `${(row.latestScore * 100).toFixed(0)}/100` : '--'} | {row.stream}</span>
                    </div>

                    {row.factor && (
                      <div className="mt-3 px-2 py-1.5 rounded border border-rose-500/20 bg-rose-500/10 text-rose-400 text-[10px] font-bold line-clamp-2 leading-tight">
                        ⚑ {row.factor}
                      </div>
                    )}
                  </div>

                  <div className={`mt-4 flex items-center justify-between px-3 py-2 rounded-lg border backdrop-blur-md ${isWarning ? 'bg-rose-500/10 border-rose-500/30' : hasBaseline ? 'bg-teal-500/10 border-teal-500/20' : 'bg-gray-500/10 border-gray-500/20'}`}>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Status</span>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${isWarning ? 'text-rose-500' : hasBaseline ? 'text-teal-500' : 'text-gray-500'}`}>
                      {isWarning ? 'Deviation' : hasBaseline ? 'Stable' : 'Awaiting'}
                    </span>
                  </div>
=======
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
>>>>>>> feature/dashboard-ui
                </div>
              </motion.div>
            )
          })}
<<<<<<< HEAD
        </motion.div>
      )}

      <motion.section 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-12 bg-gray-900 dark:bg-black border border-gray-800 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start relative overflow-hidden shadow-2xl"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[80px] rounded-full pointer-events-none" />
        <div className="w-14 h-14 shrink-0 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center relative z-10 shadow-inner">
          <Activity size={24} className="text-blue-400" />
        </div>
        <div className="relative z-10">
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] mb-2">Architecture Integrity</p>
          <p className="text-sm leading-relaxed text-gray-400 max-w-3xl">
            Every card above reads live pipelines from the risk engine. Baselines are actively synced via 
            <code className="mx-1.5 px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono text-[11px]">GET /events/baselines</code>,
            while ML model scores stream from 
            <code className="mx-1.5 px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono text-[11px]">GET /events/scores</code>.
            This view serves as the raw telemetry diagnostic view behind the Mission Control interface.
          </p>
        </div>
      </motion.section>
    </motion.div>
=======
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
>>>>>>> feature/dashboard-ui
  )
}
