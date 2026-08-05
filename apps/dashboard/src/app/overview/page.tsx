'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, LogOut, Moon, Sun, Shield, TrendingUp, TrendingDown,
  Activity, ChevronRight, WifiOff, Play,
  Database, X, Smartphone, MapPin, Keyboard,
  CheckCircle, Info, BarChart2, Zap,
  Cpu, HardDrive, Thermometer, Signal, Wifi, RefreshCw,
} from 'lucide-react'
import {
  apiFetch, apiFetchSafe, buildWsUrl, timeAgo, severityOf, riskLabel,
  type ChildDevice, type BackendAlert, type RiskScore, type BaselineMap, type IngestionHealth,
} from '../../lib/api'

/* ─────────────────────────────────────────────────────────────
   TYPES — real backend data mapped for display
───────────────────────────────────────────────────────────── */

interface DeviceView {
  id: string
  name: string
  initials: string
  platform: string
  lastSeen: string
  online: boolean
  riskScore: number        // 0–100 aggregate of latest model scores
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
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0A0A0A" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#0A0A0A" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={pad.l} y1={pad.t + p * (h - pad.t - pad.b)} x2={w - pad.r} y2={pad.t + p * (h - pad.t - pad.b)}
          stroke="#E8E8E8" strokeWidth={1} />
      ))}
      <path d={aFill} fill="url(#aGrad)" />
      <path d={bPath} fill="none" stroke="#D1D1D6" strokeWidth={1.5} strokeDasharray="5 4" />
      <path d={aPath} fill="none" stroke="#0A0A0A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={sx(i)} cy={sy(d.actual)} r={i === data.length - 1 ? 4 : 2.5}
          fill={i === data.length - 1 ? '#0A0A0A' : '#fff'} stroke="#0A0A0A"
          strokeWidth={i === data.length - 1 ? 0 : 1.5} />
      ))}
    </svg>
  )
}

function RiskGauge({ score }: { score: number }) {
  const r = 36, circ = 2 * Math.PI * r
  const arc = (score / 100) * circ
  const color = score >= 70 ? '#2C2C2E' : score >= 40 ? '#636366' : '#AEAEB2'
  return (
    <svg width={88} height={88} viewBox="0 0 88 88">
      <circle cx={44} cy={44} r={r} fill="none" stroke="#F0F0F0" strokeWidth={7} />
      <circle cx={44} cy={44} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round"
        transform="rotate(-90 44 44)" style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)' }} />
      <text x={44} y={48} textAnchor="middle" fontSize={18} fontWeight={800}
        fill="#0A0A0A" fontFamily="'Space Grotesk', monospace">{score}</text>
    </svg>
  )
}

function MiniRing({ pct, size = 48, stroke = 5, color }: { pct: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const cx = size / 2, cy = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke} opacity={0.12} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${(pct / 100) * circ} ${circ - (pct / 100) * circ}`}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
    </svg>
  )
}

function KpiCard({ icon, label, value, sub, color, ringPct }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string; ringPct?: number }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
      transition: 'all 0.2s ease',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = color; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 24px ${color}10` }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 12,
        background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, position: 'relative',
      }}>
        {ringPct !== undefined && (
          <div style={{ position: 'absolute', inset: -3 }}>
            <MiniRing pct={ringPct} size={48} stroke={4} color={color} />
          </div>
        )}
        <span style={{ color, zIndex: 1 }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</p>
        <p style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</p>
        {sub && <p style={{ fontSize: 10, color: 'var(--sub)', marginTop: 2 }}>{sub}</p>}
      </div>
    </div>
  )
}

function StatusDot({ status, size = 8 }: { status: 'healthy' | 'warning' | 'critical' | 'offline'; size?: number }) {
  const colors = { healthy: '#10B981', warning: '#F59E0B', critical: '#EF4444', offline: '#AEAEB2' }
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: colors[status],
      animation: status === 'healthy' ? 'pulse 2s ease-in-out infinite' : 'none',
      boxShadow: status === 'healthy' ? `0 0 8px ${colors[status]}60` : 'none',
      flexShrink: 0,
    }} />
  )
}

/* ─────────────────────────────────────────────────────────────
   DATA MAPPERS — backend → view models
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
  // Latest score per model
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

/** Group daily average risk scores over the last 7 days for the chart. */
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
  const [guardian, setGuardian] = useState({ name: 'Guardian', role: 'guardian' })
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
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const wsRef = useRef<WebSocket | null>(null)

  const device = devices.find(d => d.id === activeId) ?? devices[0] ?? null
  const unread = alerts.filter(a => !a.read).length

  const pushLog = useCallback((msg: string) => {
    setLogs(p => [`${new Date().toLocaleTimeString()} — ${msg}`, ...p].slice(0, 30))
  }, [])

  /* ── Real data loaders ── */

  const loadAlerts = useCallback(async (tk: string, devs: ChildDevice[]) => {
    const nameOf: Record<string, string> = Object.fromEntries(devs.map(d => [d.id, d.name]))
    const lists = await Promise.all(
      devs.map(d => apiFetchSafe<BackendAlert[]>(`/events/alerts/${d.id}`, tk, []))
    )
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
        id: d.id,
        name: d.name,
        initials: toInitials(d.name),
        platform: d.platform === 'ios' ? 'iOS' : d.platform === 'android' ? 'Android' : d.platform,
        lastSeen: d.last_seen ? timeAgo(d.last_seen) : 'never',
        online: deviceOnline(d.last_seen),
        riskScore: agg.score,
        riskLabel: riskLabel(agg.score),
        flaggedCount: agg.flagged,
        latestFactors: agg.factors,
      } as DeviceView
    }))
    setDevices(views)
    return { devs, views }
  }, [])

  const loadDeviceDetail = useCallback(async (tk: string, deviceId: string) => {
    const [bl, sc] = await Promise.all([
      apiFetchSafe<BaselineMap>(`/events/baselines/${deviceId}`, tk, {}),
      apiFetchSafe<RiskScore[]>(`/events/scores/${deviceId}`, tk, []),
    ])
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
    const gs = localStorage.getItem('prism_guardian')
    if (!tk || !gs) { router.push('/'); return }
    try { const g = JSON.parse(gs); setGuardian({ name: g.full_name || 'Guardian', role: g.role || 'guardian' }) } catch {}
    setToken(tk)
    const saved = localStorage.getItem('prism_theme') as any
    if (saved) { setTheme(saved); document.documentElement.setAttribute('data-theme', saved) }

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
            // Live alert arrived — refresh the alert list and device risk
            if (d.severity_tier || d.flagged) {
              loadDevices(tk).then(({ devs }) => loadAlerts(tk, devs))
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

  const applyTheme = (t: 'light' | 'dark') => {
    setTheme(t); localStorage.setItem('prism_theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }

  /** Trigger a REAL demo scenario on the backend risk engine, then reload real alerts. */
  const runSim = async (s: 'A' | 'B' | 'C') => {
    if (!token || !device) return
    setSim(true)
    const labels: Record<string, string> = {
      A: 'late-night screen spike', B: 'social withdrawal', C: 'high-risk app install',
    }
    pushLog(`[DEMO] Triggering scenario ${s} (${labels[s]}) on backend risk engine…`)
    try {
      await apiFetch('/events/demo-trigger', token, {
        method: 'POST',
        body: JSON.stringify({ device_id: device.id, scenario: s }),
      })
      pushLog(`[DEMO] Scenario ${s} processed — re-scoring complete`)
      const devs = await apiFetchSafe<ChildDevice[]>('/auth/devices', token, [])
      await loadDevices(token)
      await loadAlerts(token, devs)
      const newAlerts = await apiFetchSafe<BackendAlert[]>(`/events/alerts/${device.id}`, token, [])
      pushLog(`[DEMO] ${device.name} now has ${newAlerts.length} stored alert(s)`)
      setAlertOpen(true)
    } catch (err: any) {
      pushLog(`[DEMO] Failed: ${err.message}`)
    }
    setSim(false)
  }

  const acknowledgeAlert = async (id: string) => {
    setAlerts(p => p.map(x => x.id === id ? { ...x, read: true } : x))
    if (token) await apiFetchSafe(`/events/alerts/viewed/${id}`, token, null as any, { method: 'POST' })
  }

  const sevBorder = (s: string) => s === 'high' ? '#2C2C2E' : s === 'medium' ? '#636366' : '#AEAEB2'
  const sevColors: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#AEAEB2' }

  const dk = theme === 'dark'
  const C = {
    bg: dk ? '#0A0A0A' : '#F4F4F2',
    card: dk ? '#1C1C1E' : '#FFFFFF',
    nav: dk ? '#111111' : '#FFFFFF',
    border: dk ? '#2C2C2E' : '#EBEBEB',
    text: dk ? '#FFFFFF' : '#0A0A0A',
    sub: dk ? '#8E8E93' : '#6B6B6B',
    muted: dk ? '#48484A' : '#AEAEB2',
    hover: dk ? '#2C2C2E' : '#F4F4F2',
    accent: dk ? '#FFFFFF' : '#0A0A0A',
    accentTxt: dk ? '#0A0A0A' : '#FFFFFF',
    logBg: dk ? '#0A0A0A' : '#F9F9F8',
  }

  /* ── Real ingestion health aggregates ── */
  const modalityEntries = Object.entries(health?.active_modalities ?? {})
  const realCount = modalityEntries.filter(([, v]) => v === 'real').length
  const synthCount = modalityEntries.filter(([, v]) => v === 'synthetic').length
  const activeCount = realCount + synthCount
  const flaggedScores = scores.filter(s => s.flagged).length

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${C.text}`, borderRightColor: 'transparent', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14, color: C.sub }}>Loading live telemetry…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", transition: 'background 0.2s, color 0.2s' }}>

      {/* ═══════ NAV ═══════ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        height: 58, background: C.nav, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', padding: '0 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 40 }}>
          <div style={{ position: 'relative', width: 28, height: 28 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${C.text}` }} />
            <div style={{ position: 'absolute', top: 6, left: 6, width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${C.text}`, opacity: 0.35 }} />
          </div>
          <span style={{ fontFamily: "'Space Grotesk', monospace", fontWeight: 800, fontSize: 16, letterSpacing: '0.16em', color: C.text }}>PRISM</span>
        </div>

        {[
          { label: 'Overview', active: true, href: '/overview' },
          { label: 'Signals', active: false, href: '/signals' },
          { label: 'Guardian', active: false, href: '/guardian' },
          { label: 'Alerts', active: false, href: '/alerts' },
          { label: 'Companion', active: false, href: '/companion' },
          { label: 'Chatbot', active: false, href: '/chatbot' },
        ].map(tab => (
          <button type="button" key={tab.label} onClick={() => router.push(tab.href)} style={{
            padding: '6px 14px', marginRight: 4, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
            fontWeight: tab.active ? 700 : 500, background: tab.active ? C.hover : 'transparent',
            color: tab.active ? C.text : C.sub, transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: C.hover, marginRight: 4 }}>
            {wsStatus === 'connected'
              ? <><StatusDot status="healthy" /><span style={{ fontSize: 12, color: C.sub }}>Live</span></>
              : <><WifiOff size={12} color={C.muted} /><span style={{ fontSize: 12, color: C.muted }}>Offline</span></>
            }
          </div>

          <button onClick={() => applyTheme(theme === 'light' ? 'dark' : 'light')} style={{
            width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub,
          }}>
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          <button onClick={() => setAlertOpen(o => !o)} style={{
            position: 'relative', width: 36, height: 36, borderRadius: 8,
            border: `1px solid ${alertOpen ? C.text : C.border}`, background: alertOpen ? C.accent : C.card,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: alertOpen ? C.accentTxt : C.sub, transition: 'all 0.2s',
          }}>
            <Bell size={15} />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -5, background: '#EF4444', color: '#fff',
                fontSize: 9, fontWeight: 800, borderRadius: 10, padding: '1px 5px', minWidth: 16, textAlign: 'center',
                animation: 'pulse 2s ease-in-out infinite',
              }}>{unread}</span>
            )}
          </button>

          <div style={{ width: 1, height: 24, background: C.border, margin: '0 8px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.accentTxt }}>
                {guardian.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{guardian.name.split(' ')[0]}</span>
          </div>

          <button onClick={() => { wsRef.current?.close(); localStorage.clear(); router.push('/') }} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.sub,
          }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </nav>

      {/* ═══════ ALERT SLIDE-OVER ═══════ */}
      {alertOpen && (
        <div style={{
          position: 'fixed', top: 58, right: 0, width: 420, height: 'calc(100vh - 58px)',
          background: C.card, borderLeft: `1px solid ${C.border}`, zIndex: 200,
          display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.07)',
          animation: 'slideIn 0.25s ease forwards',
        }}>
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Alerts</p>
              <p style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{unread} unread · {alerts.length} total</p>
            </div>
            <button onClick={() => setAlertOpen(false)} style={{ background: C.hover, border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub }}>
              <X size={15} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {alerts.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>
                <CheckCircle size={22} color={C.muted} style={{ marginBottom: 10 }} />
                <p>No alerts on record. The risk engine has not flagged any deviations.</p>
              </div>
            )}
            {alerts.map((a, i) => (
              <div key={a.id} onClick={() => acknowledgeAlert(a.id)}
                style={{
                  padding: '16px 24px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                  background: !a.read ? (dk ? '#1A1A1A' : '#FAFAF9') : 'transparent',
                  transition: 'background 0.15s', animation: `fadeUp 0.3s ${i * 0.05}s both`,
                  borderLeft: !a.read ? `3px solid ${sevColors[a.severity] ?? C.text}` : '3px solid transparent',
                }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ marginTop: 3, flexShrink: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.read ? C.muted : sevColors[a.severity] ?? C.text, border: `2px solid ${a.read ? C.border : C.text}` }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{a.title}</span>
                      <span style={{ fontSize: 11, color: C.muted, flexShrink: 0, marginLeft: 12 }}>{a.time}</span>
                    </div>
                    <p style={{ fontSize: 12, color: C.sub, lineHeight: 1.65, marginBottom: 10 }}>{a.summary}</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${sevBorder(a.severity)}`, color: sevBorder(a.severity), fontWeight: 700 }}>
                        {a.severity === 'high' ? '● High' : a.severity === 'medium' ? '● Moderate' : '● Low'}
                      </span>
                      <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, border: `1px solid ${C.border}`, color: C.sub }}>
                        {a.device}
                      </span>
                    </div>
                    {a.factors.map((f, fi) => (
                      <div key={fi} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                        <div style={{ width: 3, height: 3, borderRadius: '50%', background: C.muted, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: C.muted }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ BODY ═══════ */}
      <div style={{ display: 'flex', maxWidth: 1440, margin: '0 auto', padding: '28px 28px 48px', gap: 24 }}>

        {/* ── SIDEBAR ── */}
        <aside style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
            Paired Devices
          </p>

          {devices.length === 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
              No devices paired yet. Register a device from the teen&apos;s PRISM app — it will appear here automatically.
            </div>
          )}

          {devices.map(d => {
            const active = activeId === d.id
            return (
              <button key={d.id} onClick={() => selectDevice(d.id)} style={{
                background: active ? C.text : C.card,
                color: active ? C.accentTxt : C.text,
                border: `1.5px solid ${active ? C.text : C.border}`,
                borderRadius: 14, padding: '14px 16px', textAlign: 'left',
                cursor: 'pointer', transition: 'all 0.2s', width: '100%',
                transform: active ? 'scale(1.02)' : 'scale(1)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: active ? 'rgba(255,255,255,0.18)' : C.hover,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                  }}>
                    {d.initials}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</p>
                    <p style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{d.platform}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: active ? 'rgba(255,255,255,0.2)' : C.hover }}>
                    <div style={{
                      width: `${d.riskScore}%`, height: '100%', borderRadius: 2,
                      background: active ? '#fff' : C.text,
                      transition: 'width 1s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", opacity: 0.85 }}>{d.riskScore}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 10, opacity: 0.5 }}>
                    {d.online ? '● Live' : '○ Idle'}
                  </span>
                  <span style={{ fontSize: 10, opacity: 0.5 }}>{d.lastSeen}</span>
                </div>
              </button>
            )
          })}

          {/* Demo scenario panel — drives the real backend risk engine */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginTop: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={10} /> Demo Scenarios
            </p>
            {[
              { s: 'A' as const, emoji: '🌙', label: 'Late-Night Spike' },
              { s: 'B' as const, emoji: '🚶', label: 'Social Withdrawal' },
              { s: 'C' as const, emoji: '📱', label: 'Unknown App Risk' },
            ].map(({ s, emoji, label }) => (
              <button key={s} onClick={() => runSim(s)} disabled={simRunning || !device} style={{
                width: '100%', marginBottom: 7, padding: '9px 12px', borderRadius: 10,
                border: `1.5px solid ${C.border}`, background: C.hover,
                cursor: simRunning || !device ? 'not-allowed' : 'pointer', textAlign: 'left',
                fontSize: 12, fontWeight: 600, color: C.text, opacity: simRunning || !device ? 0.45 : 1,
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8,
              }}
                onMouseEnter={e => { if (!simRunning && device) (e.currentTarget as HTMLElement).style.borderColor = C.text }}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = C.border}
              >
                <span>{emoji}</span> {label}
              </button>
            ))}
            {simRunning && <p style={{ fontSize: 11, color: C.sub, textAlign: 'center', marginTop: 6, opacity: 0.7 }}>Running on backend risk engine…</p>}
            <p style={{ fontSize: 9, color: C.muted, lineHeight: 1.5, marginTop: 8 }}>
              Triggers POST /events/demo-trigger — alerts shown are real rows generated by the ML risk engine.
            </p>
          </div>

          {/* Privacy badge */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginTop: 4 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>Privacy</p>
            {[
              { icon: <Shield size={10} key="shield" />, text: 'Metadata only' },
              { icon: <CheckCircle size={10} key="check" />, text: 'Teen can pause anytime' },
              { icon: <Info size={10} key="info" />, text: 'Encrypted in transit' },
            ].map(({ icon, text }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: C.sub, fontSize: 11 }}>
                {icon} {text}
              </div>
            ))}
          </div>
        </aside>

        {/* ── MAIN ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {!device ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '60px 28px', textAlign: 'center' }}>
              <Smartphone size={36} color={C.muted} style={{ marginBottom: 16 }} />
              <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 8 }}>No device paired</h1>
              <p style={{ fontSize: 14, color: C.sub, maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
                Once the teen&apos;s PRISM app registers a device under your account, live risk scores,
                alerts, and baselines will appear here — everything below is real backend data, not a mockup.
              </p>
            </div>
          ) : (
            <>
              {/* ═══════ PROFILE HEADER ═══════ */}
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 18,
                padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                animation: 'fadeUp 0.4s both',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%', background: C.text,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    boxShadow: `0 4px 16px ${dk ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                  }}>
                    <span style={{ color: C.accentTxt, fontWeight: 800, fontSize: 17 }}>{device.initials}</span>
                  </div>
                  <div>
                    <h1 style={{ fontSize: 19, fontWeight: 800, color: C.text, letterSpacing: '-0.01em', marginBottom: 3 }}>{device.name}</h1>
                    <p style={{ fontSize: 13, color: C.sub }}>{device.platform} · Last seen {device.lastSeen} · {device.online ? 'Live' : 'Idle'}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ textAlign: 'center' }}>
                    <RiskGauge score={device.riskScore} />
                    <p style={{ fontSize: 11, color: C.sub, marginTop: 4, fontWeight: 600 }}>{device.riskLabel}</p>
                  </div>
                  <div style={{ height: 56, width: 1, background: C.border }} />
                  <div>
                    <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Flagged models</p>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${C.border}`, color: C.text }}>
                      {device.flaggedCount > 0 ? `${device.flaggedCount} of ${scores.length ? new Set(scores.map(s => s.model_name)).size : 4} models` : 'None — all normal'}
                    </span>
                  </div>
                  <button onClick={() => setAlertOpen(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px',
                    background: C.text, color: C.accentTxt, border: 'none', borderRadius: 12,
                    fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.88'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                  >
                    <Bell size={14} /> {unread > 0 ? `${unread} Alert${unread > 1 ? 's' : ''}` : 'Alerts'}
                  </button>

                  <button onClick={() => { localStorage.setItem('prism_selected_device', device.id); router.push('/prism-node') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
                      background: `linear-gradient(135deg, rgba(99,102,241,0.16), rgba(139,92,246,0.16))`,
                      color: '#a5b4fc', border: '1.5px solid rgba(99,102,241,0.35)', borderRadius: 12,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.01em',
                      transition: 'all 0.3s ease', backdropFilter: 'blur(8px)',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.borderColor = 'rgba(99,102,241,0.7)'
                      el.style.boxShadow = '0 0 20px rgba(99,102,241,0.25)'
                      el.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.borderColor = 'rgba(99,102,241,0.35)'
                      el.style.boxShadow = 'none'
                      el.style.transform = 'translateY(0)'
                    }}
                    title="Open PRISM Node wearable dashboard"
                  >
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%', background: '#818cf8',
                      display: 'inline-block', animation: 'nodePulse 2s ease-in-out infinite',
                    }} />
                    PRISM Node
                  </button>
                </div>
              </div>

              {/* ═══════ BASELINE SIGNAL CARDS ═══════ */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, animation: 'fadeUp 0.4s 0.06s both' }}>
                {Object.entries(SIGNAL_META).map(([key, meta]) => {
                  const bl = baselines[key]
                  const modelScores = scores.filter(s => s.model_name === key || (key === 'app_usage' && s.model_name === 'app_usage'))
                  const latest = modelScores[0]
                  const status = health?.active_modalities?.[key] ?? 'inactive'
                  const Icon = meta.icon
                  return (
                    <div key={key} style={{
                      background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
                      padding: '18px 20px', transition: 'all 0.2s ease',
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.text }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 10, background: C.hover, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={15} color={C.sub} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{meta.label}</span>
                        </div>
                        <span style={{
                          fontSize: 10, padding: '3px 10px', borderRadius: 20, fontWeight: 700,
                          background: status === 'real' ? 'rgba(16,185,129,0.12)' : status === 'synthetic' ? 'rgba(245,158,11,0.12)' : C.hover,
                          color: status === 'real' ? '#047857' : status === 'synthetic' ? '#92400E' : C.muted,
                        }}>
                          {status === 'real' ? '● Real data' : status === 'synthetic' ? '● Synthetic' : '○ Inactive'}
                        </span>
                      </div>
                      {bl ? (
                        <div style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text }}>
                            {bl.mean < 10 ? bl.mean.toFixed(2) : Math.round(bl.mean).toLocaleString()}
                          </span>
                          <span style={{ fontSize: 12, color: C.sub, marginLeft: 6 }}>{meta.unit} (rolling mean)</span>
                          <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                            variance {bl.variance < 1 ? bl.variance.toFixed(3) : bl.variance.toFixed(1)}
                            {latest && <> · latest score {(latest.score * 100).toFixed(0)}/100{latest.flagged ? ' ⚑ flagged' : ''}</>}
                          </p>
                        </div>
                      ) : (
                        <p style={{ fontSize: 13, color: C.muted, marginBottom: 10, lineHeight: 1.6 }}>
                          Awaiting baseline — the worker aggregates rolling means once enough {meta.label.toLowerCase()} telemetry arrives.
                        </p>
                      )}
                      {latest?.contributing_factors?.slice(0, 1).map((f, i) => (
                        <p key={i} style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>⚑ {f}</p>
                      ))}
                    </div>
                  )
                })}
              </div>

              {/* ═══════ RISK HISTORY CHART ═══════ */}
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 18,
                padding: '22px 26px', animation: 'fadeUp 0.4s 0.15s both',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 3 }}>7-Day Risk Score History</p>
                    <p style={{ fontSize: 12, color: C.sub }}>Daily average model risk score (0–100) from stored engine outputs</p>
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.sub }}>
                      <div style={{ width: 18, height: 2, borderTop: '2px dashed #D1D1D6' }} /> Reference
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text, fontWeight: 600 }}>
                      <div style={{ width: 18, height: 2.5, background: C.text, borderRadius: 2 }} /> Actual
                    </div>
                  </div>
                </div>
                {scores.length > 0 && weeklyData.length > 1 ? (
                  <>
                    <SparkLine data={weeklyData} w={680} h={90} />
                    <div style={{
                      display: 'grid', gridTemplateColumns: `repeat(${weeklyData.length}, 1fr)`,
                      marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10,
                    }}>
                      {weeklyData.map(d => (
                        <span key={d.day} style={{ textAlign: 'center', fontSize: 11, color: C.muted, fontWeight: 600 }}>{d.day}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: C.muted, padding: '24px 0', textAlign: 'center' }}>
                    No risk scores stored yet for this device. Trigger a demo scenario or wait for the risk engine to process telemetry.
                  </p>
                )}
              </div>

              {/* ═══════ ALERTS + LIVE LOG ═══════ */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, animation: 'fadeUp 0.4s 0.2s both' }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Bell size={14} color={C.sub} />
                      <p style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Recent Alerts</p>
                    </div>
                    <button onClick={() => setAlertOpen(true)} style={{ background: 'none', border: 'none', fontSize: 12, color: C.sub, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      View all <ChevronRight size={12} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {alerts.length === 0 && (
                      <p style={{ fontSize: 12, color: C.muted, padding: '12px 0' }}>No alerts stored yet — baseline is stable or telemetry has not arrived.</p>
                    )}
                    {alerts.slice(0, 3).map(a => (
                      <div key={a.id} onClick={() => { acknowledgeAlert(a.id); setAlertOpen(true) }}
                        style={{
                          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px',
                          borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s',
                          background: !a.read ? (dk ? '#222' : '#FAFAF9') : 'transparent',
                          border: `1px solid ${!a.read ? C.border : 'transparent'}`,
                          borderLeft: !a.read ? `3px solid ${sevColors[a.severity] ?? C.text}` : '3px solid transparent',
                        }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.read ? C.muted : sevColors[a.severity] ?? C.text, marginTop: 4, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                            <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, marginLeft: 8 }}>{a.time}</span>
                          </div>
                          <p style={{ fontSize: 11, color: C.sub, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.summary}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <StatusDot status={wsStatus === 'connected' ? 'healthy' : 'offline'} />
                    <p style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Ingestion Log</p>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, border: `1px solid ${C.border}`, color: C.sub, marginLeft: 'auto' }}>
                      {wsStatus === 'connected' ? 'Connected' : 'Reconnecting'}
                    </span>
                  </div>
                  <div style={{
                    flex: 1, overflowY: 'auto', fontFamily: "'Space Grotesk', monospace", fontSize: 11,
                    color: C.sub, lineHeight: 1.9, background: C.logBg, borderRadius: 10,
                    padding: '10px 14px', border: `1px solid ${C.border}`, minHeight: 120, maxHeight: 140,
                  }}>
                    {logs.length === 0
                      ? <span style={{ color: C.muted }}>› Waiting for live events or demo triggers…</span>
                      : logs.map((l, i) => <div key={i} style={{ marginBottom: 1, animation: 'fadeUp 0.2s both' }}><span style={{ color: C.muted }}>›</span> {l}</div>)
                    }
                  </div>
                </div>
              </div>

              {/* ═══════ REAL PIPELINE HEALTH KPIs ═══════ */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, animation: 'fadeUp 0.4s 0.25s both' }}>
                <KpiCard
                  icon={<Activity size={18} />}
                  label="Active Modalities"
                  value={`${activeCount} / 6`}
                  sub={health ? (synthCount > 0 ? `${synthCount} synthetic · ${realCount} real` : `${realCount} real streams`) : 'Checking…'}
                  color="#6366F1"
                  ringPct={(activeCount / 6) * 100}
                />
                <KpiCard
                  icon={<Bell size={18} />}
                  label="Unread Alerts"
                  value={`${unread}`}
                  sub={`${alerts.length} total stored`}
                  color="#F59E0B"
                />
                <KpiCard
                  icon={<Zap size={18} />}
                  label="Flagged Scores"
                  value={`${flaggedScores}`}
                  sub={`of ${scores.length} stored model outputs`}
                  color="#EF4444"
                />
                <KpiCard
                  icon={<Wifi size={18} />}
                  label="Live Channel"
                  value={wsStatus === 'connected' ? 'Connected' : 'Offline'}
                  sub={wsStatus === 'connected' ? 'WebSocket streaming' : 'Attempting reconnect'}
                  color="#0EA5E9"
                />
              </div>

              {/* ═══════ MODALITY STATUS DETAIL ═══════ */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 26px', animation: 'fadeUp 0.4s 0.3s both' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Database size={16} color={C.sub} />
                  <p style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Ingestion Pipeline — per modality</p>
                  <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>Source: GET /api/internal/ingestion/health</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                  {['gsr', 'ppg', 'pulse', 'location', 'typing', 'app_usage'].map(mod => {
                    const st = health?.active_modalities?.[mod] ?? 'inactive'
                    return (
                      <div key={mod} style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: C.hover }}>
                        <div style={{ marginBottom: 6 }}>
                          <StatusDot status={st === 'real' ? 'healthy' : st === 'synthetic' ? 'warning' : 'offline'} size={8} />
                        </div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{mod.replace('_', ' ')}</p>
                        <p style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{st}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
