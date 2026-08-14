'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { API_BASE } from '@/lib/api'
import {
  ShieldCheck, ArrowLeft, Bell, User, Clock, TrendingUp,
  Activity, ChevronRight, MessageCircle, Settings2, BarChart3,
  CheckCircle, AlertTriangle, Info, Heart, Zap, Lock, ScanLine, Network
} from 'lucide-react'

const API = `${API_BASE}/guardian`

// ── Types ───────────────────────────────────────────────────

interface GuardianAlert {
  id: string
  severity: string
  category: string
  title: string
  summary: string
  contributing_observations: string[]
  interpretation: string | null
  suggested_approach: string | null
  conversation_starter: string | null
  confidence: number
  is_acknowledged: boolean
  detected_at: string
}

interface DashboardData {
  connection_id: string
  device_name: string
  current_status: string
  status_summary: string
  stability_score: number
  recent_changes: string
  positive_changes: string[]
  unread_alerts: number
}

interface Connection {
  id: string
  device_id: string
  device_name: string
  status: string
}

// ── Config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  stable: { label: 'Stable', color: '#10B981', bg: 'rgba(16, 185, 129, 0.1)', icon: <CheckCircle size={18} /> },
  improving: { label: 'Improving', color: '#34D399', bg: 'rgba(52, 211, 153, 0.1)', icon: <TrendingUp size={18} /> },
  mild_change: { label: 'Mild Change Detected', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)', icon: <AlertTriangle size={18} /> },
  needs_attention: { label: 'Needs Attention', color: '#F97316', bg: 'rgba(249, 115, 22, 0.1)', icon: <AlertTriangle size={18} /> },
  high_concern: { label: 'High Concern', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)', icon: <Info size={18} /> },
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  info: { label: 'Info', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.1)' },
  observation: { label: 'Observation', color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.1)' },
  attention: { label: 'Needs Attention', color: '#FB923C', bg: 'rgba(251, 146, 60, 0.1)' },
  urgent: { label: 'Urgent', color: '#F87171', bg: 'rgba(248, 113, 113, 0.1)' },
  critical: { label: 'Critical', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)' },
  positive: { label: 'Positive', color: '#34D399', bg: 'rgba(52, 211, 153, 0.1)' },
}

const CATEGORY_ICONS: Record<string, string> = {
  behavior: '📊', wellbeing: '💚', safety: '🛡️', isolation: '🤝',
  sleep: '🌙', routine: '🔄', mood: '💭', risk_escalation: '⚠️', positive: '🌟',
}

// ── Background Component ─────────────────────────────────────
function GuardianBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      <motion.div
        animate={{ opacity: [0.1, 0.2, 0.1], scale: [1, 1.05, 1], rotate: [0, 90] }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute top-[10%] left-[20%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px]"
      />
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────

export default function GuardianDashboardPage() {
  const router = useRouter()
  const [token, setToken] = useState<string>('')
  const [connections, setConnections] = useState<Connection[]>([])
  const [activeConn, setActiveConn] = useState<Connection | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [alerts, setAlerts] = useState<GuardianAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null)
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null)
  const [connectInput, setConnectInput] = useState('')
  const [policyAccepted, setPolicyAccepted] = useState(false)

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  useEffect(() => {
    const t = localStorage.getItem('prism_token')
    if (!t) { router.push('/'); return }
    setToken(t)
  }, [router])

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch(`${API}/connections`, { headers })
      if (res.ok) {
        const data = await res.json()
        setConnections(data)
        if (data.length > 0) setActiveConn(data[0])
        else setLoading(false)
      } else {
        setLoading(false)
      }
    } catch { setLoading(false) }
  }, [headers])

  const fetchDashboard = useCallback(async (connId: string) => {
    try {
      const res = await fetch(`${API}/dashboard/${connId}`, { headers })
      if (res.ok) setDashboard(await res.json())
    } catch {} finally { setLoading(false) }
  }, [headers])

  const fetchAlerts = useCallback(async (connId: string, severity: string | null = null) => {
    try {
      const params = severity ? `?severity=${encodeURIComponent(severity)}` : ''
      const res = await fetch(`${API}/alerts/${connId}${params}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.alerts || [])
      }
    } catch {}
  }, [headers])

  useEffect(() => {
    if (!token) return
    fetchConnections()
  }, [token, fetchConnections])

  useEffect(() => {
    if (activeConn) {
      fetchDashboard(activeConn.id)
      fetchAlerts(activeConn.id, selectedSeverity)
    }
  }, [activeConn, selectedSeverity, fetchDashboard, fetchAlerts])

  const acknowledge = async (alertId: string) => {
    if (!activeConn) return
    try {
      await fetch(`${API}/alerts/${alertId}/acknowledge`, {
        method: 'POST', headers,
        body: JSON.stringify({ connection_id: activeConn.id }),
      })
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_acknowledged: true } : a))
    } catch {}
  }

  const connectDevice = async (deviceId: string) => {
    if(!deviceId.trim()) return
    try {
      const res = await fetch(`${API}/connections`, {
        method: 'POST', headers,
        body: JSON.stringify({ device_id: deviceId }),
      })
      if (res.ok) {
        const data = await res.json()
        setConnections(prev => [...prev, { id: data.connection_id, device_id: deviceId, device_name: 'Device', status: 'active' }])
        setActiveConn({ id: data.connection_id, device_id: deviceId, device_name: 'Device', status: 'active' })
      }
    } catch {}
  }

  const statusCfg = dashboard ? STATUS_CONFIG[dashboard.current_status] || STATUS_CONFIG.stable : STATUS_CONFIG.stable

  if (loading) {
    return (
      <div className="h-full bg-[#050505] flex items-center justify-center relative z-0">
        <GuardianBackground />
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
          <p className="text-xs uppercase tracking-widest text-emerald-500/50 font-bold">Establishing Secure Uplink</p>
        </div>
      </div>
    )
  }

  if (!activeConn) {
    return (
      <div className="min-h-full bg-[#050505] text-white font-sans overflow-x-hidden relative z-0 selection:bg-emerald-500/30">
        <GuardianBackground />
        
        <header className="h-20 border-b border-white/5 bg-black/40 backdrop-blur-2xl flex items-center px-8 relative z-50">
          <button onClick={() => router.push('/overview')} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            <ArrowLeft size={16} /> System Overview
          </button>
        </header>

        <div className="max-w-6xl mx-auto px-8 py-20 relative z-10 flex flex-col md:flex-row gap-16 items-center">
          
          <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} className="flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 mb-8">
              <ShieldCheck size={12} className="text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">PRISM Policy Protocol</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 leading-[1.1]">
              Secure the<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">Connection.</span>
            </h1>
            
            <p className="text-lg text-white/50 leading-relaxed font-medium mb-10 max-w-xl">
              Link with a PRISM edge device to access encrypted behavioral telemetry. Your dashboard will receive AI-synthesized trend analysis without ever compromising raw payload data.
            </p>

            <div className="bg-white/5 border border-white/10 p-2 rounded-2xl flex items-center gap-2 backdrop-blur-xl max-w-md shadow-2xl">
              <div className="pl-4 pr-2 text-emerald-400/50">
                <ScanLine size={20} />
              </div>
              <input 
                type="text" 
                placeholder="Enter PRISM Device ID..." 
                value={connectInput}
                onChange={e => setConnectInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && connectInput.trim() && policyAccepted && connectDevice(connectInput)}
                className="flex-1 bg-transparent border-none text-white placeholder-white/30 text-sm outline-none py-3"
              />
              <button 
                onClick={() => connectDevice(connectInput)}
                disabled={!connectInput.trim() || !policyAccepted}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl disabled:opacity-50 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
              >
                Sync
              </button>
            </div>
            
            <div className="mt-4 flex items-center gap-3 px-1 text-white/60 text-sm">
              <input 
                type="checkbox" 
                id="policy" 
                checked={policyAccepted}
                onChange={e => setPolicyAccepted(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-black accent-emerald-500"
              />
              <label htmlFor="policy" className="cursor-pointer hover:text-white transition-colors">I accept the PRISM Policy Protocol and agree to metadata-only monitoring.</label>
            </div>
          </motion.div>

          <div className="flex-1 w-full grid gap-4">
            {[
              { icon: <Lock />, title: "Zero-Knowledge Architecture", desc: "We never transmit or store raw messages, photos, or voice. Only behavioral metadata is logged." },
              { icon: <Activity />, title: "Algorithmic Synthesis", desc: "Sensory inputs are immediately condensed into mathematical risk models before reaching the cloud." },
              { icon: <Network />, title: "Consent-First Bridging", desc: "Connections must be authorized. The edge device retains absolute sovereignty over the data stream." }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + (i * 0.1) }}
                className="p-6 rounded-[24px] bg-white/5 border border-white/5 backdrop-blur-xl flex items-start gap-5 group hover:bg-white/10 transition-colors"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="text-white font-bold mb-2">{feature.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </div>
    )
  }

  // ACTIVE DASHBOARD STATE
  return (
    <div className="min-h-full bg-[#050505] text-white font-sans overflow-x-hidden relative z-0 selection:bg-emerald-500/30">
      <GuardianBackground />
      
      {/* Header */}
      <header className="h-[72px] border-b border-white/5 bg-black/40 backdrop-blur-2xl flex items-center justify-between px-8 relative z-50">
        <div className="flex items-center gap-6">
          <button onClick={() => router.push('/overview')} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            <ArrowLeft size={16} /> System Overview
          </button>
          <div className="h-6 w-px bg-white/10" />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <ShieldCheck size={16} className="text-emerald-400" />
            </div>
            <span className="font-bold tracking-tight text-white/90">Guardian Protocol</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12 flex flex-col gap-8 relative z-10">

        {/* Status Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-[32px] bg-white/5 border border-white/10 backdrop-blur-xl p-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative z-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10 flex items-center gap-2" style={{ backgroundColor: statusCfg.bg, color: statusCfg.color, borderColor: `${statusCfg.color}40` }}>
                  {statusCfg.icon} {statusCfg.label}
                </div>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">{dashboard?.device_name || 'PRISM Node'}</h1>
              <p className="text-sm text-white/50 max-w-xl leading-relaxed">
                {dashboard?.status_summary}
              </p>
            </div>

            {/* Stability */}
            <div className="flex flex-col items-center shrink-0">
              <div className="w-24 h-24 rounded-full border-4 border-white/5 flex items-center justify-center border-t-emerald-500 relative">
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-r-emerald-500/40 rotate-45" />
                <span className="font-mono text-3xl font-extrabold text-white">
                  {dashboard?.stability_score ?? '—'}
                </span>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mt-4">Stability Index</p>
            </div>
          </div>
        </motion.div>

        {/* Recent Changes */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <Activity size={18} className="text-white/40" />
            <span className="text-xs font-bold tracking-[0.1em] text-white/40 uppercase">Recent Behavioral Shift</span>
          </div>
          <p className="text-lg font-medium text-white/80 leading-relaxed">
            {dashboard?.recent_changes || 'No significant deviations detected in the telemetry stream.'}
          </p>
        </motion.div>

        {/* Positive Changes */}
        {dashboard?.positive_changes && dashboard.positive_changes.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-3xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp size={18} className="text-emerald-400" />
              <span className="text-xs font-bold tracking-[0.1em] text-emerald-400 uppercase">Positive Trajectories</span>
            </div>
            <div className="space-y-4">
              {dashboard.positive_changes.map((change, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-sm font-medium text-emerald-100/80 leading-relaxed">{change}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Alerts Matrix */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Bell size={18} className="text-white/40" />
              <span className="text-xs font-bold tracking-[0.1em] text-white/40 uppercase">
                Telemetry Alerts {dashboard?.unread_alerts ? `(${dashboard.unread_alerts} Active)` : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => (
                <button 
                  key={key} 
                  onClick={() => setSelectedSeverity(selectedSeverity === key ? null : key)}
                  className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all"
                  style={{
                    borderColor: selectedSeverity === key ? cfg.color : 'rgba(255,255,255,0.1)',
                    background: selectedSeverity === key ? cfg.bg : 'transparent',
                    color: selectedSeverity === key ? cfg.color : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="rounded-3xl border border-white/5 bg-white/5 backdrop-blur-xl p-12 flex flex-col items-center justify-center text-center">
              <ShieldCheck size={32} className="text-emerald-500/50 mb-4" />
              <p className="text-sm text-white/40 font-medium">No alerts triggered in the current matrix.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {alerts.map(alert => {
                  const sevCfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info
                  const isExpanded = expandedAlert === alert.id
                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      key={alert.id} 
                      onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}
                      className="rounded-3xl border backdrop-blur-xl cursor-pointer overflow-hidden transition-all group"
                      style={{
                        background: alert.is_acknowledged ? 'rgba(255,255,255,0.03)' : sevCfg.bg,
                        borderColor: alert.is_acknowledged ? 'rgba(255,255,255,0.05)' : `${sevCfg.color}40`,
                      }}
                    >
                      <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform">
                          {CATEGORY_ICONS[alert.category] || '📊'}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: sevCfg.bg, color: sevCfg.color, border: `1px solid ${sevCfg.color}40` }}>
                              {sevCfg.label}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                              {alert.confidence}% Match
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-white mb-2">{alert.title}</h3>
                          <p className="text-sm text-white/50 leading-relaxed m-0">{alert.summary}</p>
                        </div>

                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-4 shrink-0">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                            {new Date(alert.detected_at).toLocaleDateString()}
                          </span>
                          {!alert.is_acknowledged && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); acknowledge(alert.id) }}
                              className="px-4 py-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-all shadow-xl"
                            >
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Data */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="border-t border-white/5 bg-black/20"
                          >
                            <div className="p-6 md:p-8 grid md:grid-cols-2 gap-6">
                              {alert.contributing_observations.length > 0 && (
                                <div className="space-y-4">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Raw Observations</p>
                                  <ul className="space-y-2">
                                    {alert.contributing_observations.map((obs, i) => (
                                      <li key={i} className="flex gap-3 text-sm text-white/70 leading-relaxed">
                                        <div className="w-1.5 h-1.5 rounded-full bg-white/20 mt-2 shrink-0" />
                                        {obs}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              <div className="space-y-6">
                                {alert.interpretation && (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-3">Model Interpretation</p>
                                    <p className="text-sm text-white/70 leading-relaxed">{alert.interpretation}</p>
                                  </div>
                                )}
                                {alert.suggested_approach && (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-3">Suggested Approach</p>
                                    <p className="text-sm text-white/70 leading-relaxed">{alert.suggested_approach}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {alert.conversation_starter && (
                              <div className="p-6 md:p-8 border-t border-white/5 bg-indigo-500/5">
                                <div className="flex items-center gap-2 mb-3">
                                  <MessageCircle size={14} className="text-indigo-400" />
                                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400">Generative Opener</span>
                                </div>
                                <p className="text-sm text-indigo-200/80 leading-relaxed italic">
                                  &quot;{alert.conversation_starter}&quot;
                                </p>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* Footer Privacy Note */}
        <div className="mt-8 rounded-3xl border border-white/5 bg-black/40 backdrop-blur-xl p-6 flex gap-4 items-start">
          <ShieldCheck size={20} className="text-white/20 shrink-0 mt-0.5" />
          <p className="text-xs text-white/30 leading-relaxed font-medium">
            PRISM Guardian shares behavioral trend summaries exclusively. Raw payload (messages, audio, images, keystrokes) is destroyed immediately upon synthesis. All algorithmic inferences shown here are fully encrypted end-to-end.
          </p>
        </div>

      </div>
    </div>
  )
}
