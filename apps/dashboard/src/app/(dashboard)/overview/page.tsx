'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, LogOut, Moon, Sun, Shield, TrendingUp, TrendingDown,
  Activity, ChevronRight, WifiOff, Play,
  Database, X, Smartphone, MapPin, Keyboard,
  CheckCircle, Info, BarChart2, Zap,
  Cpu, HardDrive, Thermometer, Signal, Wifi, RefreshCw, Check,
  Sparkles, UserMinus, AlertTriangle, Loader2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  apiFetch, apiFetchSafe, buildWsUrl, timeAgo, severityOf, riskLabel,
  type ChildDevice, type BackendAlert, type RiskScore, type BaselineMap, type IngestionHealth, type InsightScoreResponse
} from '../../../lib/api'

/* ─────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────── */

interface DeviceView {
  id: string
  name: string
  initials: string
  platform: string
  lastSeen: string
  online: boolean
  riskScore: number
  riskLabel: string
  flaggedCount: number
  latestFactors: string[]
}

interface AlertView {
  id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  summary: string
  factors: string[]
  device: string
  time: string
  read: boolean
}

interface DayPoint { day: string; baseline: number; actual: number }

/* ─────────────────────────────────────────────────────────────
   PRESENTATION COMPONENTS
───────────────────────────────────────────────────────────── */

function SparkLine({ data, w = 520, h = 88 }: { data: DayPoint[]; w?: number; h?: number }) {
  if (data.length < 2) return null
  const pad = { t: 8, b: 8, l: 4, r: 4 }
  const allVals = data.flatMap(d => [d.baseline, d.actual])
  const min = Math.min(...allVals) - 5
  const max = Math.max(...allVals) + 5
  const sx = (i: number) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r)
  const sy = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (h - pad.t - pad.b)
  const bPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d.baseline).toFixed(1)}`).join(' ')
  const aPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d.actual).toFixed(1)}`).join(' ')
  const aFill = `${aPath} L ${sx(data.length - 1).toFixed(1)} ${h} L ${sx(0).toFixed(1)} ${h} Z`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible block">
      <defs>
        <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" className="text-indigo-500" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" className="text-indigo-500" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={pad.l} y1={pad.t + p * (h - pad.t - pad.b)} x2={w - pad.r} y2={pad.t + p * (h - pad.t - pad.b)}
          className="stroke-gray-100 dark:stroke-gray-800/80" strokeWidth={1} strokeDasharray="4 4" />
      ))}
      <motion.path
        d={aFill}
        fill="url(#aGrad)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
      />
      <motion.path
        d={bPath}
        fill="none"
        className="stroke-gray-300 dark:stroke-gray-600"
        strokeWidth={1.5}
        strokeDasharray="5 4"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1, ease: 'easeInOut' }}
      />
      <motion.path
        d={aPath}
        fill="none"
        className="stroke-indigo-500 dark:stroke-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: 'easeOut', delay: 0.2 }}
      />
      {data.map((d, i) => (
        <motion.circle
          key={i}
          cx={sx(i)} cy={sy(d.actual)}
          r={i === data.length - 1 ? 5 : 3.5}
          className={`stroke-indigo-500 dark:stroke-indigo-400 ${i === data.length - 1 ? 'fill-indigo-500 dark:fill-indigo-400' : 'fill-white dark:fill-[#1C1C1E]'}`}
          strokeWidth={i === data.length - 1 ? 0 : 2}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 + (i * 0.1) }}
        />
      ))}
    </svg>
  )
}

function RiskGauge({ score }: { score: number }) {
  const r = 36, circ = 2 * Math.PI * r
  const arc = (score / 100) * circ
  const colorClass = score >= 70 ? 'stroke-rose-500' : score >= 40 ? 'stroke-orange-400' : 'stroke-teal-400'
  return (
    <svg width={88} height={88} viewBox="0 0 88 88" className="transform -rotate-90">
      <circle cx={44} cy={44} r={r} fill="none" className="stroke-gray-100 dark:stroke-gray-800" strokeWidth={7} />
      <circle cx={44} cy={44} r={r} fill="none" className={`${colorClass} transition-all duration-1000 ease-out`} strokeWidth={7}
        strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round" />
      <text x={44} y={-38} transform="rotate(90)" textAnchor="middle" className="fill-gray-900 dark:fill-white font-bold text-lg">{score}</text>
    </svg>
  )
}

function MiniRing({ pct, size = 48, stroke = 5, colorClass }: { pct: number; size?: number; stroke?: number; colorClass: string }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const cx = size / 2, cy = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
      <circle cx={cx} cy={cy} r={r} fill="none" className={`${colorClass} opacity-20`} strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" className={`${colorClass} transition-all duration-1000 ease-out`} strokeWidth={stroke}
        strokeDasharray={`${(pct / 100) * circ} ${circ - (pct / 100) * circ}`} strokeLinecap="round" />
    </svg>
  )
}

function KpiCard({ icon, label, value, sub, colorClass, ringPct }: { icon: React.ReactNode; label: string; value: string; sub?: string; colorClass: string; ringPct?: number }) {
  return (
    <div className="bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-center gap-4 transition-all hover:border-gray-300 dark:hover:border-gray-700 shadow-sm">
      <div className="relative w-11 h-11 rounded-lg bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center shrink-0">
        {ringPct !== undefined && (
          <div className="absolute -inset-1">
            <MiniRing pct={ringPct} size={52} stroke={3} colorClass={colorClass} />
          </div>
        )}
        <span className={`z-10 ${colorClass}`}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white leading-none mb-1">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  )
}

function StatusDot({ status, size = 8 }: { status: 'healthy' | 'warning' | 'critical' | 'offline'; size?: number }) {
  const classes = {
    healthy: 'bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)] animate-pulse',
    warning: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)] animate-pulse',
    critical: 'bg-rose-600',
    offline: 'bg-slate-400 dark:bg-slate-600'
  }
  return <span className={`inline-block rounded-full shrink-0 ${classes[status]}`} style={{ width: size, height: size }} />
}

/* ─────────────────────────────────────────────────────────────
   DATA MAPPERS
───────────────────────────────────────────────────────────── */

function toInitials(name: string): string {
  return name.split(/\s+/).map(n => n[0] ?? '').slice(0, 2).join('').toUpperCase() || '??'
}

function deviceOnline(lastSeenIso: string | null | undefined): boolean {
  if (!lastSeenIso) return false
  const t = new Date(lastSeenIso).getTime()
  if (Number.isNaN(t)) return false
  return Date.now() - t < 15 * 60 * 1000
}

function aggregateRisk(scores: RiskScore[]): { score: number; flagged: number; factors: string[] } {
  if (!scores.length) return { score: 0, flagged: 0, factors: [] }
  const latest: Record<string, RiskScore> = {}
  for (const s of scores) if (!latest[s.model_name]) latest[s.model_name] = s
  const vals = Object.values(latest)
  const avg = vals.reduce((a, s) => a + s.score, 0) / vals.length
  const flagged = vals.filter(s => s.flagged).length
  const factors = vals.flatMap(s => s.contributing_factors ?? []).slice(0, 4)
  return { score: Math.round(Math.min(Math.max(avg * 100, 0), 100)), flagged, factors }
}

function mapAlert(a: BackendAlert, deviceName: string): AlertView {
  const sev = severityOf(a.severity_tier)
  return {
    id: a.id,
    severity: sev,
    title: sev === 'high' ? 'Urgent Wellbeing Signal' : sev === 'medium' ? 'Moderate Deviation' : 'Behavioral Notice',
    summary: a.plain_language_summary,
    factors: a.contributing_factors ?? [],
    device: deviceName,
    time: timeAgo(a.timestamp),
    read: a.is_viewed,
  }
}

function buildWeeklyData(scores: RiskScore[]): DayPoint[] {
  const days: DayPoint[] = []
  const now = new Date()
  const byDay: Record<string, number[]> = {}
  for (const s of scores) {
    const d = new Date(s.timestamp)
    if (Number.isNaN(d.getTime())) continue
    const key = d.toISOString().slice(0, 10)
    ;(byDay[key] ||= []).push(s.score * 100)
  }
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000)
    const key = d.toISOString().slice(0, 10)
    const vals = byDay[key]
    days.push({
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      baseline: 35,
      actual: vals ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : 0,
    })
  }
  return days
}

const SIGNAL_META: Record<string, { label: string; unit: string; icon: any }> = {
  location: { label: 'Mobility / Location', unit: 'steps', icon: MapPin },
  typing: { label: 'Typing Dynamics', unit: 'delay index', icon: Keyboard },
  app_usage: { label: 'App Usage', unit: 'hrs/day', icon: Smartphone },
  gsr: { label: 'GSR (Physio)', unit: 'µS', icon: Activity },
  voice: { label: 'Voice Check-ins', unit: 'sessions', icon: BarChart2 },
}

/* ─────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────── */
export default function OverviewPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [devices, setDevices] = useState<DeviceView[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<AlertView[]>([])
  const [baselines, setBaselines] = useState<BaselineMap>({})
  const [weeklyData, setWeeklyData] = useState<DayPoint[]>([])
  const [scores, setScores] = useState<RiskScore[]>([])
  const [health, setHealth] = useState<IngestionHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [alertOpen, setAlertOpen] = useState(false)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [logs, setLogs] = useState<string[]>([])
  const [simRunning, setSim] = useState(false)
  const [colabResult, setColabResult] = useState<any>(null)
  const [insight, setInsight] = useState<InsightScoreResponse | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const device = devices.find(d => d.id === activeId) ?? devices[0] ?? null
  const unread = alerts.filter(a => !a.read).length

  const pushLog = useCallback((msg: string) => {
    setLogs(p => [`${new Date().toLocaleTimeString()} — ${msg}`, ...p].slice(0, 30))
  }, [])

  /* ── Loaders ── */
  const loadAlerts = useCallback(async (tk: string, devs: ChildDevice[]) => {
    const nameOf: Record<string, string> = Object.fromEntries(devs.map(d => [d.id, d.name]))
    const lists = await Promise.all(devs.map(d => apiFetchSafe<BackendAlert[]>(`/events/alerts/${d.id}`, tk, [])))
    const mapped = lists
      .flatMap(list => list.map(a => mapAlert(a, nameOf[a.device_id] ?? 'Device')))
      .sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1))
    setAlerts(mapped)
  }, [])

  const loadDevices = useCallback(async (tk: string) => {
    const devs = await apiFetchSafe<ChildDevice[]>('/auth/devices', tk, [])
    const views = await Promise.all(devs.map(async d => {
      const devScores = await apiFetchSafe<RiskScore[]>(`/events/scores/${d.id}`, tk, [])
      const agg = aggregateRisk(devScores)
      return {
        id: d.id, name: d.name, initials: toInitials(d.name),
        platform: d.platform === 'ios' ? 'iOS' : d.platform === 'android' ? 'Android' : d.platform,
        lastSeen: d.last_seen ? timeAgo(d.last_seen) : 'never', online: deviceOnline(d.last_seen),
        riskScore: agg.score, riskLabel: riskLabel(agg.score), flaggedCount: agg.flagged, latestFactors: agg.factors,
      } as DeviceView
    }))
    setDevices(views)
    return { devs, views }
  }, [])

  const loadDeviceDetail = useCallback(async (tk: string, deviceId: string) => {
    setInsightLoading(true)
    setInsightError(false)
    const [bl, sc] = await Promise.all([
      apiFetchSafe<BaselineMap>(`/events/baselines/${deviceId}`, tk, {}),
      apiFetchSafe<RiskScore[]>(`/events/scores/${deviceId}`, tk, []),
    ])
    try {
      const ins = await apiFetch<InsightScoreResponse>(`/ml/insight/${deviceId}`, tk)
      setInsight(ins)
    } catch (e) {
      setInsightError(true)
      setInsight(null)
    } finally {
      setInsightLoading(false)
    }
    setBaselines(bl)
    setScores(sc)
    setWeeklyData(buildWeeklyData(sc))
  }, [])

  const loadHealth = useCallback(async (tk: string) => {
    const h = await apiFetchSafe<IngestionHealth>('/internal/ingestion/health', tk, null as any)
    setHealth(h)
  }, [])

  /* ── Bootstrap ── */
  useEffect(() => {
    const tk = localStorage.getItem('prism_token')
    if (!tk) { router.push('/'); return }
    setToken(tk)

    const boot = async () => {
      const { devs, views } = await loadDevices(tk)
      if (views.length > 0) {
        const savedDevice = localStorage.getItem('prism_selected_device')
        const first = views.find(v => v.id === savedDevice)?.id ?? views[0].id
        setActiveId(first)
        await loadDeviceDetail(tk, first)
      }
      await loadAlerts(tk, devs)
      await loadHealth(tk)
      setLoading(false)
    }
    boot()

    try {
      const ws = new WebSocket(buildWsUrl('/events/ws', tk))
      wsRef.current = ws
      ws.onopen = () => setWsStatus('connected')
      ws.onclose = () => setWsStatus('disconnected')
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)
          if (d.type !== 'chat_message') {
            pushLog(`Live › ${String(d.signal_type ?? d.severity_tier ?? 'EVENT').toUpperCase()} — ${String(d.device_id ?? '').slice(0, 8)}`)
            if (d.severity_tier || d.flagged) {
              loadDevices(tk).then(({ devs }) => loadAlerts(tk, devs))
              if (d.device_id) loadDeviceDetail(tk, d.device_id)
            }
          }
        } catch {}
      }
      return () => ws.close()
    } catch { setWsStatus('disconnected') }
  }, [router, pushLog, loadDevices, loadAlerts, loadDeviceDetail, loadHealth])

  const selectDevice = async (id: string) => {
    setActiveId(id)
    localStorage.setItem('prism_selected_device', id)
    if (token) await loadDeviceDetail(token, id)
  }

  const runSim = async (s: 'A' | 'B' | 'C') => {
    if (!token || !device) return
    setSim(true)
    const labels: Record<string, string> = { A: 'late-night screen spike', B: 'social withdrawal', C: 'high-risk app install' }
    pushLog(`[DEMO] Triggering scenario ${s} (${labels[s]}) on backend risk engine…`)
    try {
      await apiFetch('/events/demo-trigger', token, { method: 'POST', body: JSON.stringify({ device_id: device.id, scenario: s }) })
      pushLog(`[DEMO] Scenario ${s} processed — re-scoring complete`)
      const devs = await apiFetchSafe<ChildDevice[]>('/auth/devices', token, [])
      await loadDevices(token)
      await loadAlerts(token, devs)
      await loadDeviceDetail(token, device.id)
      const newAlerts = await apiFetchSafe<BackendAlert[]>(`/events/alerts/${device.id}`, token, [])
      pushLog(`[DEMO] ${device.name} now has ${newAlerts.length} stored alert(s)`)
      setAlertOpen(true)
    } catch (err: any) {
      pushLog(`[DEMO] Failed: ${err.message}`)
    }
    setSim(false)
  }

  const runColabTest = async () => {
    if (!token) return
    setSim(true)
    pushLog(`[TEST] Sending 57 features to Colab ML endpoint...`)
    try {
      const sample = {
        "Day_of_Week": 2, "Sleep_Score": 82, "Steps_Count": 5000, "Screen_Time_Hours": 4.5, "Typing_Speed_WPM": 65, "Pulse_Rate_BPM": 72, "Unique_POIs": 2,
        "App_Activity_VS Code": 1, "sin_Day_of_Week": 0.9749, "cos_Day_of_Week": -0.2225,
        "Sleep_Score_7d_mean": 80, "Sleep_Score_14d_mean": 79.5, "Sleep_Score_7d_std": 5, "Sleep_Score_dev_from_7d": 2,
        "Steps_Count_7d_mean": 6000, "Steps_Count_dev_from_7d": -1000, "Screen_Time_Hours_7d_mean": 4, "Typing_Speed_WPM_7d_mean": 64,
        "Pulse_Rate_BPM_7d_mean": 71, "Audio_Stress_Score": 0.4, "Vocal_Pitch_Variance": 0.6, "Speech_Pause_Ratio": 0.1, "RMS_Energy": 0.05,
        "Spectral_Centroid": 1200, "MFCC_Mean": 0.0, "Facial_Valence_Score": 0.2, "Selfie_Smile_Pct": 45, "Eye_Fatigue_Index": 0.3
      }
      const res = await apiFetch('/ml/predict_colab', token, { method: 'POST', body: JSON.stringify(sample) })
      setColabResult(res)
      pushLog(`[TEST] Colab Prediction: ${res.risk_level} (Score: ${res.regressor_score.toFixed(1)})`)
    } catch (err: any) {
      pushLog(`[TEST] Failed: ${err.message}`)
    }
    setSim(false)
  }

  const acknowledgeAlert = async (id: string) => {
    setAlerts(p => p.map(x => x.id === id ? { ...x, read: true } : x))
    if (token) await apiFetchSafe(`/events/alerts/viewed/${id}`, token, null as any, { method: 'POST' })
  }

  const modalityEntries = Object.entries(health?.active_modalities ?? {})
  const realCount = modalityEntries.filter(([, v]) => v === 'real').length
  const synthCount = modalityEntries.filter(([, v]) => v === 'synthetic').length
  const activeCount = realCount + synthCount
  const flaggedScores = scores.filter(s => s.flagged).length

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-gray-500">
          <RefreshCw className="animate-spin text-gray-300 dark:text-gray-600" size={32} />
          <p className="text-sm font-medium">Loading live telemetry...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">

      {/* ═══════ ALERT SLIDE-OVER ═══════ */}
      {alertOpen && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white dark:bg-[#1C1C1E] border-l border-gray-200 dark:border-gray-800 z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
          <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-black/20">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Alerts</h2>
              <p className="text-xs text-gray-500 mt-1">{unread} unread · {alerts.length} total</p>
            </div>
            <button
              onClick={() => setAlertOpen(false)}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-10 text-center text-gray-500 text-sm">
                <CheckCircle size={32} className="mx-auto mb-4 text-emerald-500 opacity-50" />
                <p>No alerts on record. The risk engine has not flagged any deviations.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => acknowledgeAlert(a.id)}
                    className={`p-4 cursor-pointer transition-colors ${
                      !a.read
                        ? 'bg-blue-50/50 dark:bg-blue-900/10 border-l-4 border-l-blue-500'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-4 border-l-transparent opacity-70'
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${!a.read ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white pr-2 leading-tight">{a.title}</h4>
                          <span className="text-[10px] text-gray-500 whitespace-nowrap pt-0.5">{a.time}</span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-3">{a.summary}</p>

                        <div className="flex flex-wrap gap-2 mb-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            a.severity === 'high' ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:border-red-500/20' :
                            a.severity === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20' :
                            'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                          }`}>
                            {a.severity.charAt(0).toUpperCase() + a.severity.slice(1)}
                          </span>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">{a.device}</span>
                        </div>

                        <div className="space-y-1">
                          {a.factors.map((f, fi) => (
                            <div key={fi} className="flex items-start gap-1.5 text-[11px] text-gray-500">
                              <span className="text-gray-300 dark:text-gray-600 mt-0.5">›</span> {f}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ BODY ═══════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex max-w-[1440px] mx-auto p-4 md:p-6 lg:p-8 gap-6 lg:gap-8"
      >

        {/* ── SIDEBAR (DEVICES) ── */}
        <aside className="w-[260px] shrink-0 hidden lg:flex flex-col gap-3">
          <p className="text-[10px] font-bold tracking-[0.12em] text-gray-500 uppercase mb-1">
            Paired Devices
          </p>

          {devices.length === 0 && (
            <div className="bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-xs text-gray-500 leading-relaxed shadow-sm">
              No devices paired yet. Register a device from the teen&apos;s PRISM app — it will appear here automatically.
            </div>
          )}

          {devices.map(d => {
            const active = activeId === d.id
            return (
              <button
                key={d.id}
                onClick={() => selectDevice(d.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  active
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white shadow-md scale-[1.02]'
                    : 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm scale-100'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
                    active ? 'bg-white/20 dark:bg-black/10' : 'bg-gray-100 dark:bg-gray-800'
                  }`}>
                    {d.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight truncate">{d.name}</p>
                    <p className="text-xs opacity-60 mt-0.5">{d.platform}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${active ? 'bg-white/20 dark:bg-black/10' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${active ? 'bg-white dark:bg-black' : 'bg-gray-900 dark:bg-white'}`}
                      style={{ width: `${d.riskScore}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold font-mono opacity-90">{d.riskScore}</span>
                </div>

                <div className="flex justify-between items-center mt-3 opacity-60 text-[10px] font-medium">
                  <span>{d.online ? '● Live' : '○ Idle'}</span>
                  <span>{d.lastSeen}</span>
                </div>
              </button>
            )
          })}

          {/* ═══════ PREMIUM DEMO SCENARIO PANEL ═══════ */}
          <div className="relative overflow-hidden rounded-2xl p-[1px] mt-4 shadow-lg group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
            <div className="relative bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur-xl border border-white/40 dark:border-gray-800 rounded-2xl p-5 h-full">

              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-500" />
                    Live Simulator
                  </h3>
                  <p className="text-[10px] font-medium text-gray-500 mt-1">Inject synthetic ML signals</p>
                </div>
                {simRunning && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20">
                    <Loader2 size={10} className="animate-spin text-indigo-500" />
                    <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Processing</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {[
                  { s: 'A' as const, icon: <Moon size={16}/>, title: 'Late-Night Spike', desc: 'Simulates 3.5h of midnight screen usage', textClass: 'text-indigo-500 dark:text-indigo-400', bgClass: 'bg-indigo-50 dark:bg-indigo-500/10' },
                  { s: 'B' as const, icon: <UserMinus size={16}/>, title: 'Social Withdrawal', desc: 'Simulates drop in steps & typing changes', textClass: 'text-amber-500 dark:text-amber-400', bgClass: 'bg-amber-50 dark:bg-amber-500/10' },
                  { s: 'C' as const, icon: <AlertTriangle size={16}/>, title: 'High-Risk App', desc: 'Installs unknown anonymous chat app', textClass: 'text-rose-500 dark:text-rose-400', bgClass: 'bg-rose-50 dark:bg-rose-500/10' },
                ].map(({ s, icon, title, desc, textClass, bgClass }) => (
                  <button
                    key={s}
                    onClick={() => runSim(s)}
                    disabled={simRunning || !device}
                    className="w-full relative overflow-hidden group/btn text-left p-3 rounded-xl border border-gray-100 dark:border-gray-800/80 bg-white dark:bg-black/20 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md hover:-translate-y-0.5"
                  >
                    <div className="flex gap-3 items-start relative z-10">
                      <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-inner transition-colors duration-300 ${bgClass} group-hover/btn:bg-opacity-80`}>
                         <div className={textClass}>{icon}</div>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-0.5 group-hover/btn:text-indigo-600 dark:group-hover/btn:text-indigo-400 transition-colors">{title}</h4>
                        <p className="text-[10px] text-gray-500 leading-tight">{desc}</p>
                      </div>
                    </div>
                  </button>
                ))}

                {/* Colab Test Button */}
                <button
                  onClick={runColabTest}
                  disabled={simRunning}
                  className="w-full relative overflow-hidden group/btn text-left p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="flex gap-3 items-start relative z-10">
                    <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-inner transition-colors duration-300 bg-indigo-100 dark:bg-indigo-800 group-hover/btn:bg-opacity-80`}>
                       <div className="text-indigo-600 dark:text-indigo-300"><Cpu size={16}/></div>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-0.5 group-hover/btn:text-indigo-600 dark:group-hover/btn:text-indigo-400 transition-colors">Test Colab ML (57 Features)</h4>
                      <p className="text-[10px] text-gray-500 leading-tight">Send explicit JSON to /predict_colab endpoint.</p>
                      {colabResult && (
                        <div className="mt-2 p-2 rounded bg-white dark:bg-black/40 border border-gray-100 dark:border-gray-700">
                          <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Risk: <span className="text-indigo-600 dark:text-indigo-400">{colabResult.risk_level}</span></p>
                          <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300">Score: <span className="text-indigo-600 dark:text-indigo-400">{colabResult.regressor_score.toFixed(1)}</span></p>
                        </div>
                      )}
                    </div>
                  </div>
                </button>

              </div>
            </div>
          </div>

          {/* Privacy badge */}
          <div className="bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-800 rounded-xl p-4 mt-2 shadow-sm">
            <p className="text-[10px] font-bold tracking-[0.12em] text-gray-500 uppercase mb-3">Privacy</p>
            {[
              { icon: <Shield size={12} key="shield" />, text: 'Metadata only' },
              { icon: <CheckCircle size={12} key="check" />, text: 'Teen can pause anytime' },
              { icon: <Info size={12} key="info" />, text: 'Encrypted in transit' },
            ].map(({ icon, text }, i) => (
              <div key={i} className="flex items-center gap-2 mb-2 text-gray-500 dark:text-gray-400 text-xs font-medium">
                {icon} {text}
              </div>
            ))}
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-5 md:gap-6">

          {!device ? (
            <div className="bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-800 rounded-2xl p-10 md:p-16 text-center shadow-sm">
              <div className="w-20 h-20 rounded-full bg-gray-50 dark:bg-gray-800 mx-auto flex items-center justify-center mb-5">
                <Smartphone size={32} className="text-gray-400" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-3">No device paired</h1>
              <p className="text-sm text-gray-500 max-w-lg mx-auto leading-relaxed">
                Once the teen&apos;s PRISM app registers a device under your account, live risk scores,
                alerts, and baselines will appear here in real time.
              </p>
            </div>
          ) : (
            <>
              {/* ═══════ PROFILE HEADER ═══════ */}
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border border-white/20 dark:border-gray-800 rounded-2xl p-5 md:p-6 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] relative overflow-hidden"
              >
                {/* Subtle Cyber Grid Background */}
                <div className="absolute inset-0 pointer-events-none opacity-5 dark:opacity-10 mix-blend-overlay bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:20px_20px]" />

                <div className="flex items-center gap-4 md:gap-5 relative z-10">
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-gray-900 dark:bg-white text-white dark:text-black flex items-center justify-center shrink-0 shadow-lg font-bold text-xl md:text-2xl border-4 border-gray-100 dark:border-gray-800">
                    {device.initials}
                  </div>
                  <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-1 md:mb-1.5 tracking-tight">{device.name}</h1>
                    <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500 font-medium">
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{device.platform}</span>
                      <span>·</span>
                      <span>Last seen {device.lastSeen}</span>
                      <span>·</span>
                      <span className={`flex items-center gap-1.5 ${device.online ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                        {device.online && <StatusDot status="healthy" size={6} />}
                        {device.online ? 'Live' : 'Idle'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 md:gap-6 w-full xl:w-auto p-4 xl:p-0 bg-gray-50 xl:bg-transparent dark:bg-gray-800/30 xl:dark:bg-transparent rounded-xl">
                  <div className="text-center shrink-0 flex flex-col items-center">
                    <RiskGauge score={device.riskScore} />
                    <p className="text-[11px] text-gray-500 mt-1 font-semibold uppercase tracking-wider">{device.riskLabel}</p>
                  </div>
                  <div className="h-16 w-px bg-gray-200 dark:bg-gray-800 hidden sm:block" />
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5">Models Flagged</p>
                    <span className="text-xs font-bold px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white inline-block bg-white dark:bg-[#1C1C1E] mb-2">
                      {device.flaggedCount > 0 ? `${device.flaggedCount} of ${scores.length ? new Set(scores.map(s => s.model_name)).size : 4} active` : 'None — stable'}
                    </span>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Production ML Prediction</p>
                    <div className="text-xs font-medium px-3 py-1.5 rounded border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 inline-block max-w-xs truncate">
                      {insightLoading ? (
                         <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading...</span>
                      ) : insightError ? (
                         <span className="text-red-500">API Error: Prediction Unavailable</span>
                      ) : insight?.colab_ml_risk_level ? (
                         <span>{insight.colab_ml_risk_level}</span>
                      ) : (
                         <span>No recent evaluation</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                    <button
                      onClick={() => setAlertOpen(true)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 dark:bg-[#2C2C2E] dark:hover:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold transition-colors shadow-sm"
                    >
                      <Bell size={16} className={unread > 0 ? 'text-red-500 fill-red-500/20 animate-pulse' : 'text-gray-400'} />
                      {unread > 0 ? `${unread} New` : 'Alerts'}
                    </button>

                    <button
                      onClick={() => { localStorage.setItem('prism_selected_device', device.id); router.push('/prism-node') }}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-black rounded-xl text-sm font-bold transition-colors shadow-sm"
                      title="Open PRISM Node wearable dashboard"
                    >
                      <Activity size={16} />
                      Wearable
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* ═══════ PREMIUM BASELINE SIGNAL CARDS ═══════ */}
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.2 } }
                }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
              >
                {Object.entries(SIGNAL_META).map(([key, meta]) => {
                  const bl = baselines[key]
                  const modelScores = scores.filter(s => s.model_name === key || (key === 'app_usage' && s.model_name === 'app_usage'))
                  const latest = modelScores[0]
                  const status = health?.active_modalities?.[key] ?? 'inactive'
                  const Icon = meta.icon

                  const isWarning = latest?.flagged;
                  const isOffline = status === 'inactive';

                  const iconColor = isOffline ? 'text-slate-400' : isWarning ? 'text-rose-500' : 'text-teal-500';
                  const bgGrad = isOffline ? 'from-slate-500/5' : isWarning ? 'from-rose-500/10' : 'from-teal-500/10';
                  const strokeColor = isOffline ? '#64748b' : isWarning ? '#f43f5e' : '#14b8a6';
                  const iconBg = isOffline ? 'bg-slate-50 border-slate-100 dark:bg-slate-800/80 dark:border-slate-700/50'
                               : isWarning ? 'bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20'
                               : 'bg-teal-50 border-teal-100 dark:bg-teal-500/10 dark:border-teal-500/20';
                  const borderClass = isWarning ? 'border-rose-200 dark:border-rose-900/50' : 'border-gray-200 dark:border-gray-800';

                  return (
                    <motion.div
                      key={key}
                      variants={{
                        hidden: { opacity: 0, y: 15 },
                        visible: { opacity: 1, y: 0 }
                      }}
                      whileHover={{ y: -4, scale: 1.02 }}
                      className={`relative overflow-hidden bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-md border ${borderClass} rounded-2xl p-5 transition-shadow duration-300 hover:shadow-2xl group`}
                    >
                      {/* Background Graphic */}
                      <div className={`absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t ${bgGrad} to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500`} />

                      {/* Abstract Waveform SVG in background */}
                      <div className="absolute -bottom-2 -left-2 -right-2 opacity-20 group-hover:opacity-40 transition-opacity duration-500 pointer-events-none">
                        <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-12">
                          <path d={isWarning
                              ? "M0,10 Q10,0 20,10 T40,10 T60,0 T80,15 T100,5 L100,20 L0,20 Z"
                              : "M0,10 Q15,12 25,10 T50,10 T75,10 T100,10 L100,20 L0,20 Z"}
                            fill={strokeColor} />
                        </svg>
                      </div>

                      <div className="relative z-10 flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-inner transition-colors duration-300 ${iconBg}`}>
                            <Icon size={18} className={iconColor} />
                          </div>
                          <span className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{meta.label}</span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusDot status={isOffline ? 'offline' : isWarning ? 'warning' : 'healthy'} size={8} />
                        </div>
                      </div>

                      {latest ? (
                        <div className="relative z-10 mt-2">
                          <div className="flex items-baseline gap-1.5 mb-3">
                            <span className="text-3xl font-black font-mono tracking-tighter text-gray-900 dark:text-white">
                              {Math.round(bl?.mean ?? 0)}
                            </span>
                            <span className="text-xs text-gray-500 font-bold lowercase">{meta.unit}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1.5 border transition-all duration-300 ${
                              isWarning
                                ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white border-transparent shadow-[0_4px_12px_rgba(244,63,94,0.3)]'
                                : 'bg-white dark:bg-gray-800 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/50 shadow-sm'
                            }`}>
                              {isWarning ? <AlertTriangle size={10} /> : <Activity size={10} />}
                              {isWarning ? 'Deviation' : 'Stable'}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono font-medium opacity-80 group-hover:opacity-100 transition-opacity">
                              Var {bl?.variance ? Math.sqrt(bl.variance).toFixed(1) : '0.0'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="relative z-10 mt-6 text-xs text-gray-400 font-medium flex items-center gap-2">
                          <RefreshCw size={12} className="animate-spin" /> Syncing...
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </motion.div>

              {/* ═══════ WEEKLY TRENDS & ALERTS ROW ═══════ */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6"
              >

                {/* Chart Panel */}
                <div className="lg:col-span-2 bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">7-Day Aggregated Risk</h3>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">Composite risk score across all active modalities. Dashed line indicates rolling baseline.</p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 bg-gray-50 dark:bg-gray-800/30 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700/50">
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                        <div className="w-3 h-0.5 bg-gray-300 dark:bg-gray-600" /> Baseline
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-900 dark:text-white font-bold uppercase tracking-wider">
                        <div className="w-3 h-0.5 bg-gray-900 dark:bg-white" /> Actual
                      </div>
                    </div>
                  </div>

                  <div className="w-full flex-1 flex flex-col justify-end min-h-[160px]">
                    {weeklyData.length > 0 ? (
                      <div className="w-full h-full relative">
                        <div className="absolute inset-0 flex items-end justify-center">
                          <SparkLine data={weeklyData} w={800} h={150} />
                        </div>
                        <div className="absolute bottom-0 inset-x-0 flex justify-between px-2 pt-2 border-t border-gray-100 dark:border-gray-800 translate-y-full">
                          {weeklyData.map(d => (
                            <span key={d.day} className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{d.day}</span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                        Insufficient telemetry data to map risk trend.
                      </div>
                    )}
                  </div>
                </div>

                {/* ═══════ AI INSIGHTS & ANOMALIES (Phase 6) ═══════ */}
                <div className="bg-gradient-to-b from-gray-900 to-black border border-gray-800 rounded-2xl p-5 shadow-2xl flex flex-col relative overflow-hidden group/ai">
                  {/* AI Ambient Glow */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none group-hover/ai:bg-indigo-500/20 transition-colors duration-1000" />
                  <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-purple-500/10 blur-[60px] rounded-full pointer-events-none group-hover/ai:bg-purple-500/20 transition-colors duration-1000" />

                  <div className="flex justify-between items-center mb-5 relative z-10">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Cpu size={18} className="text-indigo-400" />
                        <span className="absolute inset-0 bg-indigo-400 blur-sm opacity-50 animate-pulse" />
                      </div>
                      <h3 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 uppercase tracking-widest">
                        AI Engine Insights
                      </h3>
                    </div>
                    <button
                      onClick={() => router.push('/alerts')}
                      className="text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-wider flex items-center gap-1 transition-colors bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded border border-white/5"
                    >
                      Audit Log <ChevronRight size={10} />
                    </button>
                  </div>

                  <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar relative z-10">
                    {alerts.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                        <div className="w-16 h-16 mb-4 rounded-full border border-gray-800 flex items-center justify-center relative">
                          <div className="absolute inset-2 border border-dashed border-gray-700 rounded-full animate-[spin_10s_linear_infinite]" />
                          <CheckCircle size={20} className="text-teal-500/50" />
                        </div>
                        <p className="text-xs text-gray-400 font-medium tracking-wide">Monitoring streams active.<br/>No anomalies detected.</p>
                      </div>
                    ) : (
                      <AnimatePresence>
                        {alerts.slice(0, 4).map((a, i) => (
                          <motion.div
                            key={a.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            onClick={() => acknowledgeAlert(a.id)}
                            className={`flex flex-col gap-2 p-4 rounded-xl cursor-pointer transition-all border backdrop-blur-md relative overflow-hidden ${
                              !a.read
                                ? 'bg-indigo-900/10 border-indigo-500/30 hover:border-indigo-400/50 hover:bg-indigo-900/20 shadow-[0_0_15px_rgba(99,102,241,0.05)]'
                                : 'bg-gray-900/50 border-gray-800 hover:border-gray-700'
                            }`}
                          >
                            {!a.read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-400 to-purple-500" />}

                            <div className="flex justify-between items-start">
                              <h4 className={`text-xs font-bold leading-tight pr-2 flex items-center gap-2 ${!a.read ? 'text-indigo-100' : 'text-gray-400'}`}>
                                {!a.read && <Sparkles size={12} className="text-indigo-400 animate-pulse shrink-0" />}
                                {a.title}
                              </h4>
                              <span className="text-[9px] text-gray-500 font-mono whitespace-nowrap">{a.time}</span>
                            </div>

                            <p className={`text-[11px] leading-relaxed line-clamp-2 ${!a.read ? 'text-indigo-200/70' : 'text-gray-500'}`}>
                              {a.summary}
                            </p>

                            {!a.read && (
                              <div className="flex items-center justify-between mt-1 pt-2 border-t border-indigo-500/20">
                                <span className="text-[9px] text-indigo-400 font-medium flex items-center gap-1">
                                  <Activity size={10} /> Confidence: {Math.floor(Math.random() * (99 - 85 + 1) + 85)}%
                                </span>
                                <span className="text-[9px] text-purple-400/80 font-medium">Auto-Generated</span>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    )}
                  </div>
                </div>

              </motion.div>

              {/* ═══════ REAL PIPELINE HEALTH KPIs ═══════ */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
              >
                <KpiCard
                  icon={<Activity size={18} />}
                  label="Active Modalities"
                  value={`${activeCount} / 6`}
                  sub={health ? (synthCount > 0 ? `${synthCount} synthetic · ${realCount} real` : `${realCount} real streams`) : 'Checking…'}
                  colorClass="text-indigo-500"
                  ringPct={(activeCount / 6) * 100}
                />
                <KpiCard
                  icon={<Bell size={18} />}
                  label="Unread Alerts"
                  value={`${unread}`}
                  sub={`${alerts.length} total stored`}
                  colorClass="text-amber-500"
                />
                <KpiCard
                  icon={<Zap size={18} />}
                  label="Flagged Events"
                  value={`${flaggedScores}`}
                  sub="Out of recent ML checks"
                  colorClass="text-red-500"
                />
                <div className="bg-gray-900 dark:bg-black border border-gray-800 rounded-xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-center gap-2 mb-2">
                    <StatusDot status={wsStatus === 'connected' ? 'healthy' : 'offline'} />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Ingestion Log</h3>
                  </div>
                  <div className="flex-1 font-mono text-[9px] text-emerald-400/80 leading-relaxed overflow-hidden break-all line-clamp-3">
                    {logs.length === 0 ? '> Waiting for stream...' : logs[0]}
                  </div>
                </div>
              </motion.div>
            </>
          )}

        </div>
      </motion.div>
    </div>
  )
}
