'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, Shield, ChevronRight, Zap, CheckCircle, Info, Activity
} from 'lucide-react'
import { MetricCard, type Status } from '@/components/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { Sparkline } from '@/components/ui/Sparkline'
import { useShell } from '@/components/layout/shell-context'
import { setSelectedDevice } from '@/lib/api'
import { DEVICES, INITIAL_ALERTS, GUIDANCE_MODES, AlertItem } from '@/lib/mockData'

function signalStatus(delta: number): Status {
  const dev = Math.abs(delta)
  if (dev > 40) return 'critical'
  if (dev > 20) return 'warning'
  return 'good'
}

// Framer Motion Variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 }
  }
}
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
}

export default function OverviewPage() {
  const router = useRouter()
  const { openAlerts } = useShell()
  const [activeId, setActiveId] = useState(DEVICES[0].id)
  const [alerts, setAlerts] = useState<AlertItem[]>(INITIAL_ALERTS)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [logs, setLogs] = useState<string[]>([])
  const [simRunning, setSim] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const device = DEVICES.find((d) => d.id === activeId) ?? DEVICES[0]
  const unread = alerts.filter((a) => !a.read).length

  const pushLog = useCallback((msg: string) => {
    setLogs((p) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...p].slice(0, 30))
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    const gs = localStorage.getItem('prism_guardian')
    if (!token || !gs) { router.push('/'); return }

    try {
      const ws = new WebSocket(`ws://localhost:8000/api/v1/events/ws?token=${token}`)
      wsRef.current = ws
      ws.onopen = () => setWsStatus('connected')
      ws.onclose = () => setWsStatus('disconnected')
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)
          if (d.type !== 'chat_message') pushLog(`Live › ${d.signal_type?.toUpperCase() ?? 'EVENT'} — ${String(d.device_id ?? '').slice(0, 8)}`)
        } catch {}
      }
      return () => ws.close()
    } catch {
      setWsStatus('disconnected')
    }
  }, [router, pushLog])

  const runSim = async (s: 'A' | 'B' | 'C') => {
    setSim(true)
    const steps: Record<string, string[]> = {
      A: ['[SIM-A] Screen-time spike injected (3.5h at 11 PM)', '[SIM-A] Baseline delta +250% computed', '[SIM-A] Risk engine re-scoring…', '[SIM-A] Alert generated — severity: medium'],
      B: ['[SIM-B] Step count dropped → 1,800 (−74%)', '[SIM-B] Typing delay index +40%', '[SIM-B] Social-withdrawal model fired', '[SIM-B] Alert generated — severity: low'],
      C: ['[SIM-C] New app detected: com.anon.chat', '[SIM-C] App usage 3.0h overnight', '[SIM-C] Category scored high-risk', '[SIM-C] Alert generated — severity: high'],
    }
    for (const m of steps[s]) { await new Promise((r) => setTimeout(r, 650)); pushLog(m) }
    const newAlert: AlertItem = {
      id: `sim-${Date.now()}`,
      severity: (s === 'C' ? 'high' : s === 'A' ? 'medium' : 'low') as AlertItem['severity'],
      title: s === 'C' ? 'New High-Risk App Detected' : s === 'A' ? 'Late-Night Screen Spike' : 'Social Withdrawal Signal',
      summary: s === 'C' ? 'An unrecognised anonymous chat app appeared in overnight app-usage metadata.' : s === 'A' ? 'Screen usage spiked to 3.5h between 11 PM–2:30 AM, well beyond baseline.' : 'Step count and movement entropy dropped simultaneously — correlated withdrawal signal.',
      factors: steps[s].slice(0, 2),
      device: "Priya's Android", time: 'Just now', read: false,
    }
    setAlerts((p) => [newAlert, ...p])
    openAlerts()
    setSim(false)
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* ── DEVICE SELECTOR ── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEVICES.map((d) => {
          const active = activeId === d.id
          return (
            <motion.button
              key={d.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setActiveId(d.id); setSelectedDevice(d.id); }}
              className={`relative flex items-center gap-4 rounded-2xl border p-4 text-left overflow-hidden ${
                active
                  ? 'border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                  : 'border-white/5 bg-zinc-900/50 hover:bg-zinc-800/80'
              } backdrop-blur-md transition-colors`}
            >
              {active && (
                <motion.div layoutId="device-active-glow" className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent pointer-events-none" />
              )}
              <div className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold shadow-inner ${
                active ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-zinc-800 text-zinc-400 border border-white/5'
              }`}>
                {d.initials}
              </div>
              <div className="min-w-0 flex-1 relative z-10">
                <p className={`truncate text-base font-bold tracking-tight ${active ? 'text-white' : 'text-zinc-300'}`}>
                  {d.name}
                </p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mt-1">
                  {d.platform} · Age {d.childAge}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0 relative z-10">
                <span className={`font-mono text-xs font-extrabold tabular-nums ${active ? 'text-indigo-400' : 'text-zinc-500'}`}>
                  {d.riskScore}
                </span>
                <div className="h-1.5 w-12 overflow-hidden rounded-full bg-black/40 border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${d.riskScore}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={`h-full rounded-full ${active ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]' : 'bg-zinc-600'}`} 
                  />
                </div>
              </div>
            </motion.button>
          )
        })}
      </motion.div>

      {/* ── PROFILE HERO CARD ── */}
      <motion.div variants={itemVariants} className="relative rounded-3xl border border-white/10 bg-zinc-900/40 p-8 sm:p-10 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Decorative inner glow */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-rose-500 text-3xl font-extrabold text-white shadow-[0_0_30px_rgba(99,102,241,0.4)] border border-white/20">
                {device.initials}
              </div>
              <div className="absolute -bottom-1.5 -right-1.5 h-5 w-5 rounded-full border-[3px] border-zinc-950 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-1.5">{device.name}</h1>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                {device.platform} <span className="mx-2 opacity-30">•</span> Last seen <span className="text-indigo-300">{device.lastSeen}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-8 lg:ml-auto">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Primary concern</p>
              <Badge tone="neutral" className="bg-white/5 border-white/10 text-zinc-300 px-3 py-1 text-xs">{device.concern}</Badge>
            </div>

            <div className="hidden h-14 w-px bg-white/10 sm:block" />

            <div className="flex items-center gap-4 w-full lg:w-auto">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={openAlerts} 
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-5 py-3 text-sm font-bold text-white transition-colors"
              >
                <Bell size={16} className="text-zinc-400" />
                {unread > 0 ? `${unread} Alerts` : 'Alerts'}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setSelectedDevice(device.id); router.push('/prism-node'); }}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 rounded-xl border border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/20 px-5 py-3 text-sm font-bold text-indigo-300 transition-colors shadow-[0_0_15px_rgba(99,102,241,0.2)]"
              >
                <div className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,1)]" />
                </div>
                PRISM Node
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── KPI GRID (METRIC CARDS) ── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {device.signals.map((sig) => (
          <MetricCard
            key={sig.label}
            title={sig.label}
            value={sig.actual.toLocaleString()}
            unit={sig.unit}
            icon={React.createElement(sig.icon, { size: 16 })}
            status={signalStatus(sig.delta)}
            progress={Math.min((sig.actual / sig.baseline) * 100, 100)}
            lastUpdated="Just now"
          />
        ))}
      </motion.div>

      {/* ── CHART & TIMELINE ── */}
      <motion.div variants={itemVariants} className="rounded-3xl border border-white/5 bg-zinc-900/40 p-8 backdrop-blur-md">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <Activity size={20} className="text-indigo-400" />
              <h3 className="text-xl font-extrabold tracking-tight text-white">7-Day Telemetry Trend</h3>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Daily actual vs 30-day baseline moving average
            </p>
          </div>
          <div className="flex items-center gap-5 text-xs font-bold uppercase tracking-widest">
            <span className="flex items-center gap-2 text-zinc-500">
              <span className="inline-block h-0 w-4 border-t-2 border-dashed border-zinc-600" /> Baseline
            </span>
            <span className="flex items-center gap-2 text-indigo-300">
              <span className="inline-block h-2 w-4 rounded bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" /> Actual
            </span>
          </div>
        </div>

        <div className="px-2">
          <Sparkline
            data={device.weeklyData.map((d) => ({ label: d.day, value: d.actual, baseline: d.baseline }))}
            width={680}
            height={140}
          />
        </div>

        <div className="mt-6 grid border-t border-white/5 pt-5" style={{ gridTemplateColumns: `repeat(${device.weeklyData.length}, 1fr)` }}>
          {device.weeklyData.map((d) => (
            <span key={d.day} className="text-center text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {d.day}
            </span>
          ))}
        </div>
      </motion.div>

      {/* ── ALERTS & LIVE LOG ── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        
        {/* Alerts Strip */}
        <div className="flex flex-col h-full rounded-3xl border border-white/5 bg-zinc-900/40 backdrop-blur-md overflow-hidden">
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/[0.02]">
            <h3 className="text-lg font-bold text-white tracking-tight">Recent Alerts</h3>
            <button onClick={openAlerts} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors">
              View all <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex-1 space-y-3 p-6">
            <AnimatePresence mode="popLayout">
              {alerts.slice(0, 3).map((a) => (
                <motion.button
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={a.id}
                  onClick={() => {
                    setAlerts((p) => p.map((x) => (x.id === a.id ? { ...x, read: true } : x)))
                    openAlerts()
                  }}
                  className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all duration-300 hover:bg-white/5 hover:border-white/20 ${
                    !a.read ? 'border-white/10 bg-white/[0.03]' : 'border-transparent'
                  }`}
                >
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ${a.read ? 'bg-zinc-700' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2 mb-1.5">
                      <span className={`text-sm font-bold tracking-wide ${!a.read ? 'text-white' : 'text-zinc-400'}`}>
                        {a.title}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{a.time}</span>
                    </span>
                    <span className="block text-xs leading-relaxed text-zinc-500 line-clamp-2">
                      {a.summary}
                    </span>
                  </span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Live Ingestion Log */}
        <div className="flex flex-col h-full rounded-3xl border border-white/10 bg-black backdrop-blur-xl shadow-2xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-50" />
          <div className="flex items-center gap-3 px-8 py-6 border-b border-white/5 bg-white/[0.01]">
            <span className={`relative flex h-2.5 w-2.5 ${wsStatus !== 'connected' && 'opacity-40'}`}>
              {wsStatus === 'connected' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            </span>
            <h3 className="text-lg font-bold text-white tracking-tight">Live Ingestion</h3>
            <Badge tone={wsStatus === 'connected' ? 'ok' : 'neutral'} className="ml-auto bg-white/10 text-zinc-300 border-white/5 px-3 py-1 shadow-inner">
              {wsStatus === 'connected' ? 'Connected' : 'Reconnecting'}
            </Badge>
          </div>
          <div className="mx-6 mb-6 mt-6 max-h-[240px] flex-1 overflow-y-auto rounded-2xl bg-zinc-950 border border-white/5 p-5 font-mono text-[11px] leading-loose text-zinc-400 shadow-[inset_0_4px_20px_rgba(0,0,0,0.5)] custom-scrollbar">
            {logs.length === 0
              ? <span className="text-zinc-600 font-bold uppercase tracking-widest">› Waiting for telemetry...</span>
              : <AnimatePresence>
                  {logs.map((l, i) => (
                    <motion.div 
                      key={l + i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="mb-1.5 text-zinc-300"
                    >
                      <span className="text-indigo-500 mr-3">›</span>{l}
                    </motion.div>
                  ))}
                </AnimatePresence>
            }
          </div>
        </div>
        
      </motion.div>

      {/* ── FOOTER ACTIONS ── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-6 lg:grid-cols-3 pb-12">
        <div className="rounded-3xl border border-white/5 bg-zinc-900/40 p-8 backdrop-blur-md">
          <p className="mb-6 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            <Zap size={16} className="text-amber-500 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]" /> Demo Simulations
          </p>
          <div className="space-y-3">
            {[
              { s: 'A' as const, emoji: '🌙', label: 'Late-Night Spike' },
              { s: 'B' as const, emoji: '🚶', label: 'Social Withdrawal' },
              { s: 'C' as const, emoji: '📱', label: 'Unknown App Risk' },
            ].map(({ s, emoji, label }) => (
              <motion.button
                whileHover={!simRunning ? { scale: 1.02 } : {}}
                whileTap={!simRunning ? { scale: 0.98 } : {}}
                key={s}
                onClick={() => runSim(s)}
                disabled={simRunning}
                className={`flex w-full items-center gap-4 rounded-xl border border-white/5 bg-white/5 px-5 py-4 text-left text-sm font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white shadow-inner ${
                  simRunning ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <span className="text-xl drop-shadow-md">{emoji}</span> {label}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/5 bg-zinc-900/40 p-8 backdrop-blur-md lg:col-span-2 flex flex-col justify-between">
          <div>
            <p className="mb-6 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
              <Info size={16} /> AI Safety Bounds
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {GUIDANCE_MODES.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 shadow-inner">
                  <p className="text-sm font-bold tracking-wide text-white mb-2">{item.title}</p>
                  <p className="text-xs leading-relaxed text-zinc-400 font-medium">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

    </motion.div>
  )
}
