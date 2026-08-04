'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, LogOut, Moon, Sun, Eye, Shield, TrendingUp, TrendingDown,
  Activity, ChevronRight, Radio, Wifi, WifiOff, Play,
  Database, X, Clock, Smartphone, MapPin, Keyboard,
  AlertTriangle, CheckCircle, Info, BarChart2, Zap, Users, HeartPulse
} from 'lucide-react'
import { API, wsUrl, authFetch } from '@/lib/api'

/* ─────────────────────────────────────────────────────────────
   TYPES — real API shapes
───────────────────────────────────────────────────────────── */
interface ApiDevice {
  id: string
  name: string
  platform: string
  last_seen: string | null
  risk_score: number
  risk_label: string
  latest_alert: { severity_tier: string; summary: string } | null
  consent_count: number
}

interface ApiAlert {
  id: string
  device_id: string
  severity_tier: string
  plain_language_summary: string
  contributing_factors: string[]
  is_viewed: boolean
  timestamp: string
}

interface ApiRiskScore {
  id: string
  device_id: string
  model_name: string
  score: number
  threshold: number
  flagged: boolean
  contributing_factors: string[]
  timestamp: string
}

interface ApiBaseline {
  mean: number
  variance: number
}

interface DeviceSignal {
  label: string
  icon: any
  baseline: number
  actual: number
  unit: string
  delta: number
  trend: 'up' | 'down' | 'stable'
}

interface DeviceView {
  id: string
  name: string
  initials: string
  childAge: number
  platform: string
  lastSeen: string
  riskScore: number
  riskLabel: string
  status: 'active' | 'idle' | 'offline'
  concern: string
  signals: DeviceSignal[]
  weeklyData: { day: string; baseline: number; actual: number }[]
}

/* ─────────────────────────────────────────────────────────────
   DEMO DATA — realistic, non-alarming baseline values
   (used ONLY as a fallback when the API is unreachable)
───────────────────────────────────────────────────────────── */

const DEVICES: DeviceView[] = [
  {
    id: 'dev-001', name: "Aarav's iPhone", initials: 'AA', childAge: 14,
    platform: 'iOS', lastSeen: '2 min ago', riskScore: 34, riskLabel: 'Normal Range',
    status: 'active' as const, concern: 'Screen Time & App Usage',
    signals: [
      { label: 'Screen Time', icon: Smartphone, baseline: 180, actual: 210, unit: 'min/day', delta: +17, trend: 'up' as const },
      { label: 'Bedtime', icon: Moon, baseline: 22.0, actual: 22.5, unit: 'hr', delta: +2, trend: 'stable' as const },
      { label: 'Daily Steps', icon: MapPin, baseline: 6200, actual: 5900, unit: 'steps', delta: -5, trend: 'down' as const },
      { label: 'Typing Pace', icon: Keyboard, baseline: 100, actual: 97, unit: 'WPM', delta: -3, trend: 'stable' as const },
    ],
    weeklyData: [
      { day: 'Mon', baseline: 180, actual: 175 }, { day: 'Tue', baseline: 180, actual: 190 },
      { day: 'Wed', baseline: 180, actual: 185 }, { day: 'Thu', baseline: 180, actual: 200 },
      { day: 'Fri', baseline: 180, actual: 220 }, { day: 'Sat', baseline: 180, actual: 230 },
      { day: 'Sun', baseline: 180, actual: 210 },
    ],
  },
  {
    id: 'dev-002', name: "Priya's Android", initials: 'PR', childAge: 16,
    platform: 'Android', lastSeen: '11 min ago', riskScore: 61, riskLabel: 'Mild Deviation',
    status: 'idle' as const, concern: 'Sleep Disruption',
    signals: [
      { label: 'Screen Time', icon: Smartphone, baseline: 150, actual: 290, unit: 'min/day', delta: +93, trend: 'up' as const },
      { label: 'Bedtime', icon: Moon, baseline: 22.5, actual: 24.5, unit: 'hr', delta: +9, trend: 'up' as const },
      { label: 'Daily Steps', icon: MapPin, baseline: 7000, actual: 3100, unit: 'steps', delta: -56, trend: 'down' as const },
      { label: 'Typing Pace', icon: Keyboard, baseline: 95, actual: 78, unit: 'WPM', delta: -18, trend: 'down' as const },
    ],
    weeklyData: [
      { day: 'Mon', baseline: 150, actual: 160 }, { day: 'Tue', baseline: 150, actual: 180 },
      { day: 'Wed', baseline: 150, actual: 210 }, { day: 'Thu', baseline: 150, actual: 240 },
      { day: 'Fri', baseline: 150, actual: 275 }, { day: 'Sat', baseline: 150, actual: 310 },
      { day: 'Sun', baseline: 150, actual: 290 },
    ],
  },
]

const INITIAL_ALERTS: ApiAlert[] = [
  {
    id: 'a1', device_id: 'dev-002', severity_tier: 'amber',
    plain_language_summary: "Priya's device showed 2.5h of usage between 11 PM–1:30 AM — later than her usual 10:30 PM bedtime.",
    contributing_factors: ['Screen time 93% above 7-day baseline', 'Bedtime shifted by +2 hours', 'Movement entropy dropped sharply'],
    is_viewed: false, timestamp: new Date(Date.now() - 2 * 3600e3).toISOString(),
  },
  {
    id: 'a2', device_id: 'dev-002', severity_tier: 'sage',
    plain_language_summary: "Priya's step count (3,100) was 56% below her usual 7,000-step daily average over 3 consecutive days.",
    contributing_factors: ['Steps 56% below rolling baseline', 'Home location stationary for 9+ hours'],
    is_viewed: true, timestamp: new Date(Date.now() - 5 * 3600e3).toISOString(),
  },
  {
    id: 'a3', device_id: 'dev-001', severity_tier: 'sage',
    plain_language_summary: "Aarav's daily screen time is ~30 min above baseline. Within expected weekend variance.",
    contributing_factors: ['Screen time +17% above baseline', 'Usage primarily social & educational apps'],
    is_viewed: true, timestamp: new Date(Date.now() - 26 * 3600e3).toISOString(),
  },
]

/* ─────────────────────────────────────────────────────────────
   COMPONENTS
───────────────────────────────────────────────────────────── */

/** Animated SVG spark line chart */
function SparkLine({ data, w = 520, h = 88 }: { data: { day: string; baseline: number; actual: number }[]; w?: number; h?: number }) {
  const pad = { t: 8, b: 8, l: 4, r: 4 }
  const allVals = data.flatMap(d => [d.baseline, d.actual])
  const min = Math.min(...allVals) - 15
  const max = Math.max(...allVals) + 15
  const sx = (i: number) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r)
  const sy = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b)
  const bPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d.baseline).toFixed(1)}`).join(' ')
  const aPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d.actual).toFixed(1)}`).join(' ')
  const aFill = [...data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d.actual).toFixed(1)}`), `L ${sx(data.length - 1).toFixed(1)} ${h} L ${sx(0).toFixed(1)} ${h} Z`].join(' ')

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0A0A0A" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#0A0A0A" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={pad.l} y1={pad.t + p * (h - pad.t - pad.b)} x2={w - pad.r} y2={pad.t + p * (h - pad.t - pad.b)}
          stroke="#E8E8E8" strokeWidth={1} />
      ))}
      {/* Area fill */}
      <path d={aFill} fill="url(#aGrad)" />
      {/* Baseline */}
      <path d={bPath} fill="none" stroke="#D1D1D6" strokeWidth={1.5} strokeDasharray="5 4" />
      {/* Actual line */}
      <path d={aPath} fill="none" stroke="#0A0A0A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {data.map((d, i) => (
        <circle key={i} cx={sx(i)} cy={sy(d.actual)} r={i === data.length - 1 ? 4 : 2.5}
          fill={i === data.length - 1 ? '#0A0A0A' : '#fff'} stroke="#0A0A0A"
          strokeWidth={i === data.length - 1 ? 0 : 1.5} />
      ))}
    </svg>
  )
}

/** Circular risk gauge */
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

/* ─────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────── */
export default function OverviewPage() {
  const router = useRouter()
  const [guardian, setGuardian] = useState({ name: 'Guardian', role: 'guardian' })
  const [devices, setDevices] = useState<DeviceView[]>(DEVICES)
  const [activeId, setActiveId] = useState(DEVICES[0].id)
  const [alerts, setAlerts] = useState<ApiAlert[]>([])
  const [alertOpen, setAlertOpen] = useState(false)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [logs, setLogs] = useState<string[]>([])
  const [simRunning, setSim] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [isLive, setIsLive] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const device = devices.find(d => d.id === activeId) ?? devices[0]
  const unread = alerts.filter(a => !a.is_viewed).length

  const pushLog = useCallback((msg: string) => {
    setLogs(p => [`${new Date().toLocaleTimeString()} — ${msg}`, ...p].slice(0, 30))
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    const gs = localStorage.getItem('prism_guardian')
    if (!token || !gs) { router.push('/'); return }
    try { const g = JSON.parse(gs); setGuardian({ name: g.full_name || 'Guardian', role: g.role || 'guardian' }) } catch {}
    const saved = localStorage.getItem('prism_theme') as any
    if (saved) { setTheme(saved); document.documentElement.setAttribute('data-theme', saved) }

    // Fetch real guardian devices + per-device alerts/scores/baselines.
    // Falls back to demo data only when the API is unreachable.
    const loadDevices = async () => {
      try {
        const res = await authFetch(`/auth/devices`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(`Devices API returned ${res.status}`)
        const list: ApiDevice[] = await res.json()
        if (list.length === 0) return

        const allAlerts: ApiAlert[] = []
        const allScores: Record<string, ApiRiskScore[]> = {}
        const allBaselines: Record<string, Record<string, ApiBaseline>> = {}
        const allPulse: Record<string, { bpm: number; g: number; at: string } | null> = {}

        await Promise.all(list.map(async d => {
          const headers = { Authorization: `Bearer ${token}` }
          const [alertRes, scoreRes, baseRes, pulseRes] = await Promise.all([
            fetch(`${API}/events/alerts/${d.id}`, { headers }),
            fetch(`${API}/events/scores/${d.id}`, { headers }),
            fetch(`${API}/events/baselines/${d.id}`, { headers }),
            fetch(`${API}/physio/pulse/readings/${d.id}?limit=1`, { headers }),
          ])
          if (alertRes.ok) {
            const data = await alertRes.json()
            if (Array.isArray(data)) allAlerts.push(...data)
          }
          if (scoreRes.ok) {
            const data = await scoreRes.json()
            if (Array.isArray(data)) allScores[d.id] = data
          }
          if (baseRes.ok) {
            const data = await baseRes.json()
            if (data && typeof data === 'object') allBaselines[d.id] = data
          }
          if (pulseRes.ok) {
            const data = await pulseRes.json()
            if (Array.isArray(data) && data.length > 0) {
              allPulse[d.id] = { bpm: data[0].bpm, g: data[0].g_force, at: data[0].timestamp }
            }
          }
        }))
        allAlerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setAlerts(allAlerts)

        const mapped: DeviceView[] = list.map((d, i) => {
          const initials = d.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || 'DV'
          const scores = allScores[d.id] ?? []
          const latest = scores[0]
          const baselines = allBaselines[d.id] ?? {}
          const pulse = allPulse[d.id] ?? null
          const risk = latest?.flagged ? Math.min(100, Math.round(latest.score * 100)) : (d.risk_score ?? 0)
          const signalCount = scores.length
          const flaggedCount = scores.filter(s => s.flagged).length

          const sig = (label: string, icon: any, raw: number, unit: string, delta: number, trend: 'up' | 'down' | 'stable'): DeviceSignal => ({
            label, icon, baseline: Math.round(raw), actual: Math.round(raw * (1 + delta / 100)), unit, delta, trend,
          })

          const signals: DeviceSignal[] = [
            sig('Risk Flags', BarChart2, Math.max(1, signalCount), 'models', flaggedCount, flaggedCount > 0 ? 'up' : 'stable'),
            sig('Consent Grants', Shield, Math.max(1, d.consent_count ?? 1), 'active', 0, 'stable'),
            sig('Heart Rate', HeartPulse, pulse?.bpm ?? Math.round(baselines['ppg']?.mean ?? 72), 'bpm',
              pulse?.bpm && pulse.bpm > 110 ? 25 : 0, pulse?.bpm && pulse.bpm > 110 ? 'up' : 'stable'),
            sig('Movement', Activity, (pulse?.g ?? baselines['movement']?.mean ?? 1.0), 'g',
              pulse?.g && pulse.g < 1.2 ? -10 : 0, pulse?.g && pulse.g < 1.2 ? 'down' : 'stable'),
          ]

          // 7-day trend from the last 7 risk scores (or alerts) — default to neutral flats when empty.
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          const weeklySource = scores.length >= 2 ? scores : (d.latest_alert ? [] : [])
          const weeklyData = weeklySource.length >= 2
            ? weeklySource.slice(0, 7).reverse().map((s, idx) => ({
                day: days[(new Date().getDay() - (weeklySource.length - 1 - idx) + 14) % 7],
                baseline: Math.max(1, Math.round((s.threshold ?? 0.5) * 100)),
                actual: Math.max(1, Math.round(s.score * 100)),
              }))
            : Array.from({ length: 7 }, (_, idx) => ({
                day: days[(new Date().getDay() - (6 - idx) + 14) % 7],
                baseline: 100, actual: 100,
              }))

          return {
            id: d.id,
            name: d.name,
            initials,
            childAge: 14,
            platform: d.platform === 'ios' ? 'iOS' : 'Android',
            lastSeen: d.last_seen ? new Date(d.last_seen).toLocaleString() : 'Never',
            riskScore: risk,
            riskLabel: latest?.flagged ? 'Deviation Detected' : (d.risk_label || 'Normal Range'),
            status: risk >= 55 ? 'idle' as const : 'active' as const,
            concern: d.latest_alert?.summary || (flaggedCount > 0 ? `${flaggedCount} signal(s) flagged` : 'Monitoring active'),
            signals,
            weeklyData,
          }
        })

        setDevices(mapped)
        setActiveId(mapped[0].id)
        setIsLive(true)
        pushLog(`Fetched ${mapped.length} device${mapped.length > 1 ? 's' : ''} + ${allAlerts.length} alert(s) from API`)
      } catch {
        setAlerts(INITIAL_ALERTS)
        pushLog('Devices API unreachable — showing demo data')
      }
    }
    loadDevices()

    try {
      const ws = new WebSocket(wsUrl('/events/ws?token=' + token))
      wsRef.current = ws
      ws.onopen  = () => setWsStatus('connected')
      ws.onclose = () => setWsStatus('disconnected')
      ws.onerror = () => setWsStatus('disconnected')
      ws.onmessage = (ev) => {
        try { const d = JSON.parse(ev.data); if (d.type !== 'chat_message') pushLog(`Live › ${d.signal_type?.toUpperCase() ?? 'EVENT'} — ${String(d.device_id ?? '').slice(0, 8)}`) } catch {}
      }
      return () => ws.close()
    } catch { setWsStatus('disconnected') }
  }, [router, pushLog])

  const applyTheme = (t: 'light' | 'dark') => {
    setTheme(t); localStorage.setItem('prism_theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }

  const runSim = async (s: 'A' | 'B' | 'C') => {
    setSim(true)
    const steps: Record<string, string[]> = {
      A: ['[SIM-A] Screen-time spike injected (3.5h at 11 PM)', '[SIM-A] Baseline delta +250% computed', '[SIM-A] Risk engine re-scoring…', '[SIM-A] Alert generated — severity: medium'],
      B: ['[SIM-B] Step count dropped → 1,800 (−74%)', '[SIM-B] Typing delay index +40%', '[SIM-B] Social-withdrawal model fired', '[SIM-B] Alert generated — severity: low'],
      C: ['[SIM-C] New app detected: com.anon.chat', '[SIM-C] App usage 3.0h overnight', '[SIM-C] Category scored high-risk', '[SIM-C] Alert generated — severity: high'],
    }
    for (const m of steps[s]) { await new Promise(r => setTimeout(r, 650)); pushLog(m) }
    const newAlert: ApiAlert = {
      id: `sim-${Date.now()}`,
      device_id: activeId,
      severity_tier: s === 'C' ? 'red' : s === 'A' ? 'amber' : 'sage',
      plain_language_summary: s === 'C' ? 'An unrecognised anonymous chat app appeared in overnight app-usage metadata.' : s === 'A' ? 'Screen usage spiked to 3.5h between 11 PM–2:30 AM, well beyond baseline.' : 'Step count and movement entropy dropped simultaneously — correlated withdrawal signal.',
      contributing_factors: steps[s].slice(0, 2),
      is_viewed: false,
      timestamp: new Date().toISOString(),
    }
    setAlerts(p => [newAlert, ...p])
    setAlertOpen(true)
    setSim(false)
  }

  const sevColor = (s: string) => s === 'red' ? '#EF4444' : s === 'amber' ? '#F59E0B' : '#10B981'
  const sevLabel = (s: string) => s === 'red' ? 'High' : s === 'amber' ? 'Moderate' : 'Low'

  /* ── Dark mode palette overrides ───────────────────────── */
  const dk = theme === 'dark'
  const C = {
    bg:     dk ? '#0A0A0A' : '#F4F4F2',
    card:   dk ? '#1C1C1E' : '#FFFFFF',
    nav:    dk ? '#111111' : '#FFFFFF',
    border: dk ? '#2C2C2E' : '#EBEBEB',
    text:   dk ? '#FFFFFF' : '#0A0A0A',
    sub:    dk ? '#8E8E93' : '#6B6B6B',
    muted:  dk ? '#48484A' : '#AEAEB2',
    hover:  dk ? '#2C2C2E' : '#F4F4F2',
    accent: dk ? '#FFFFFF' : '#0A0A0A',
    accentTxt: dk ? '#0A0A0A' : '#FFFFFF',
    input:  dk ? '#2C2C2E' : '#F4F4F2',
    logBg:  dk ? '#0A0A0A' : '#F9F9F8',
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", transition: 'background 0.2s, color 0.2s' }}>

      {/* ══════════════════════════════════════════════════════
          TOP NAVIGATION BAR
      ══════════════════════════════════════════════════════ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        height: 58, background: C.nav, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', padding: '0 28px',
        gap: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 40 }}>
          <div style={{ position: 'relative', width: 28, height: 28 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${C.text}` }} />
            <div style={{ position: 'absolute', top: 6, left: 6, width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${C.text}`, opacity: 0.35 }} />
          </div>
          <span style={{ fontFamily: "'Space Grotesk', monospace", fontWeight: 800, fontSize: 16, letterSpacing: '0.16em', color: C.text }}>PRISM</span>
        </div>

        {/* Nav tabs */}
        {[
          { label: 'Overview', active: true, href: '/overview' },
          { label: 'Signals', active: false, href: '/signals' },
          { label: 'Companion', active: false, href: '/companion' },
          { label: 'Alerts', active: false, href: '/alerts' },
          { label: 'Health Coach', active: false, href: '/medical' },
          { label: 'Typing', active: false, href: '/typing-analytics' },
          { label: 'Analytics', active: false, href: '/analytics' },
        ].map(tab => (
          <button type="button" key={tab.label} onClick={() => router.push(tab.href)} style={{
            padding: '6px 14px', marginRight: 4, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
            fontWeight: tab.active ? 700 : 500, background: tab.active ? C.hover : 'transparent',
            color: tab.active ? C.text : C.sub, transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Right cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* WS indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: C.hover, marginRight: 4 }}>
            {isLive
              ? <><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', animation: 'pulse 2s infinite' }} /><span style={{ fontSize: 12, color: '#16A34A', fontWeight: 700 }}>API DATA</span></>
              : wsStatus === 'connected'
              ? <><div style={{ width: 6, height: 6, borderRadius: '50%', background: C.text, animation: 'pulse 2s infinite' }} /><span style={{ fontSize: 12, color: C.sub }}>Live</span></>
              : <><WifiOff size={12} color={C.muted} /><span style={{ fontSize: 12, color: C.muted }}>Offline</span></>
            }
          </div>

          {/* Theme */}
          <button onClick={() => applyTheme(theme === 'light' ? 'dark' : 'light')} style={{
            width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub,
          }}>
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          {/* Alert bell */}
          <button onClick={() => setAlertOpen(o => !o)} style={{
            position: 'relative', width: 36, height: 36, borderRadius: 8,
            border: `1px solid ${alertOpen ? C.text : C.border}`, background: alertOpen ? C.accent : C.card,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: alertOpen ? C.accentTxt : C.sub,
          }}>
            <Bell size={15} />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -5, background: C.text, color: C.accentTxt,
                fontSize: 9, fontWeight: 800, borderRadius: 10, padding: '1px 5px', minWidth: 16, textAlign: 'center',
              }}>{unread}</span>
            )}
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: C.border, margin: '0 8px' }} />

          {/* User */}
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

      {/* ══════════════════════════════════════════════════════
          ALERT PANEL (slide-over)
      ══════════════════════════════════════════════════════ */}
      {alertOpen && (
        <div style={{
          position: 'fixed', top: 58, right: 0, width: 400, height: 'calc(100vh - 58px)',
          background: C.card, borderLeft: `1px solid ${C.border}`, zIndex: 200,
          display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.07)',
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
            {alerts.map((a, i) => {
              const sev = sevColor(a.severity_tier)
              const devName = devices.find(d => d.id === a.device_id)?.name || a.device_id.slice(0, 8)
              return (
                <div key={a.id} onClick={() => setAlerts(p => p.map(x => x.id === a.id ? { ...x, is_viewed: true } : x))}
                  style={{
                    padding: '16px 24px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                    background: !a.is_viewed ? (dk ? '#1A1A1A' : '#FAFAF9') : 'transparent',
                    transition: 'background 0.15s', animation: `fadeUp 0.3s ${i * 0.05}s both`,
                  }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ marginTop: 3, flexShrink: 0 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.is_viewed ? C.muted : sev, border: `2px solid ${a.is_viewed ? C.border : sev}` }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{a.plain_language_summary}</span>
                        <span style={{ fontSize: 11, color: C.muted, flexShrink: 0, marginLeft: 12 }}>{new Date(a.timestamp).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${sev}`, color: sev, fontWeight: 700 }}>
                          ● {sevLabel(a.severity_tier)}
                        </span>
                        <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, border: `1px solid ${C.border}`, color: C.sub }}>
                          {devName}
                        </span>
                      </div>
                      {(a.contributing_factors || []).slice(0, 3).map((f, fi) => (
                        <div key={fi} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                          <div style={{ width: 3, height: 3, borderRadius: '50%', background: C.muted, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: C.muted }}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          BODY LAYOUT  (sidebar + main)
      ══════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', maxWidth: 1320, margin: '0 auto', padding: '28px 28px 48px', gap: 24 }}>

        {/* ── SIDEBAR ──────────────────────────────────────── */}
        <aside style={{ width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
            Paired Devices
          </p>

          {devices.map(d => {
            const active = activeId === d.id
            return (
              <button key={d.id} onClick={() => {
                setActiveId(d.id)
                // Persist selected device for isolated PRISM Node surface
                localStorage.setItem('prism_selected_device', d.id)
              }} style={{
                background: active ? C.text : C.card,
                color: active ? C.accentTxt : C.text,
                border: `1.5px solid ${active ? C.text : C.border}`,
                borderRadius: 14, padding: '14px 16px', textAlign: 'left',
                cursor: 'pointer', transition: 'all 0.2s', width: '100%',
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
                    <p style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{d.platform} · Age {d.childAge}</p>
                  </div>
                </div>

                {/* Risk bar */}
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

                {/* Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 10, opacity: 0.5 }}>
                    {d.status === 'active' ? '● Live' : d.status === 'idle' ? '○ Idle' : '× Offline'}
                  </span>
                  <span style={{ fontSize: 10, opacity: 0.5 }}>{d.lastSeen}</span>
                </div>
              </button>
            )
          })}

          {/* Simulation panel */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginTop: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={10} /> Demo Scenarios
            </p>
            {[
              { s: 'A' as const, emoji: '🌙', label: 'Late-Night Spike' },
              { s: 'B' as const, emoji: '🚶', label: 'Social Withdrawal' },
              { s: 'C' as const, emoji: '📱', label: 'Unknown App Risk' },
            ].map(({ s, emoji, label }) => (
              <button key={s} onClick={() => runSim(s)} disabled={simRunning} style={{
                width: '100%', marginBottom: 7, padding: '9px 12px', borderRadius: 10,
                border: `1.5px solid ${C.border}`, background: C.hover,
                cursor: simRunning ? 'not-allowed' : 'pointer', textAlign: 'left',
                fontSize: 12, fontWeight: 600, color: C.text, opacity: simRunning ? 0.45 : 1,
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8,
              }}
                onMouseEnter={e => { if (!simRunning) (e.currentTarget as HTMLElement).style.borderColor = C.text }}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = C.border}
              >
                <span>{emoji}</span> {label}
              </button>
            ))}
            {simRunning && <p style={{ fontSize: 11, color: C.sub, textAlign: 'center', marginTop: 6, opacity: 0.7 }}>Running simulation…</p>}
          </div>

          {/* Guidance personas */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginTop: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 12 }}>Guidance Modes</p>
            {[
              {
                title: 'The Direct Coach',
                description: 'Notices the thought behind a feeling, gently offers another way to see the situation, and pushes toward one small, doable next step. Brisk, warm, action-oriented.',
              },
              {
                title: 'The Listener',
                description: 'Mostly reflects back what the user says and feels rather than advising. Trusts the user already has the answer inside them. Only offers an opinion if directly asked, and even then frames it as one option.',
              },
              {
                title: 'The Strategist',
                description: 'Focuses on "what\'s slightly better than today" instead of dissecting the past. Uses scaling questions (1–10), spots what\'s already working, and homes in on the smallest next step.',
              },
              {
                title: 'The Clinician',
                description: 'Asks structured questions like a clinical intake (sleep, appetite, concentration) and talks in clearer clinical-adjacent language than the others — but is the most repetitive about disclosing it\'s not a real clinician, since its tone is the one most likely to be mistaken for authority.',
              },
              {
                title: 'The Mentor',
                description: 'Draws out the user\'s own reasons for change rather than pushing advice, rolls with pushback instead of arguing, and occasionally reflects the user\'s own stated values back to them. Warm but willing to create a little productive friction.',
              },
            ].map(item => (
              <div key={item.title} style={{ marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.text }}>{item.title}</p>
                <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.7, color: C.sub }}>{item.description}</p>
              </div>
            ))}
            <div style={{ marginTop: 12, padding: 14, borderRadius: 14, background: C.hover, border: `1px solid ${C.border}` }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.text }}>Common safety wrapper</p>
              <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.7, color: C.sub }}>
                All modes disclose they are AI, not a licensed clinician; none diagnose, prescribe, or encourage secrecy; and all defer immediately to the crisis-safety system for anything concerning.
              </p>
            </div>
          </div>

          {/* Consent footer */}
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

        {/* ── MAIN CONTENT ─────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Profile header card */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 18,
            padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            animation: 'fadeUp 0.4s both',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: C.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <span style={{ color: C.accentTxt, fontWeight: 800, fontSize: 18 }}>{device.initials}</span>
              </div>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.01em', marginBottom: 4 }}>{device.name}</h1>
                <p style={{ fontSize: 13, color: C.sub }}>{device.platform} · Age {device.childAge} · Last seen {device.lastSeen}</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ textAlign: 'center' }}>
                <RiskGauge score={device.riskScore} />
                <p style={{ fontSize: 11, color: C.sub, marginTop: 4, fontWeight: 600 }}>{device.riskLabel}</p>
              </div>

              <div style={{ height: 64, width: 1, background: C.border }} />

              <div>
                <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Primary concern</p>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${C.border}`, color: C.text }}>
                  {device.concern}
                </span>
              </div>

              <button onClick={() => setAlertOpen(true)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px',
                background: C.text, color: C.accentTxt, border: 'none', borderRadius: 12,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                <Bell size={14} /> {unread > 0 ? `${unread} Alert${unread > 1 ? 's' : ''}` : 'Alerts'}
              </button>

              {/* PRISM Node — isolated wearable surface */}
              <button
                id="btn-prism-node"
                onClick={() => {
                  localStorage.setItem('prism_selected_device', device.id)
                  router.push('/prism-node')
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px',
                  background: 'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(139,92,246,0.18))',
                  color: '#a5b4fc', border: '1.5px solid rgba(99,102,241,0.35)', borderRadius: 12,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.01em',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.7)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.35)'}
                title="Open PRISM Node wearable dashboard"
              >
                {/* Pulsing indigo node icon */}
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#818cf8', display: 'inline-block', animation: 'pulse 2s ease-in-out infinite' }} />
                PRISM Node
              </button>
            </div>
          </div>

          {/* Signal cards — 2×2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, animation: 'fadeUp 0.4s 0.06s both' }}>
            {device.signals.map((sig, i) => {
              const Icon = sig.icon
              const deviation = Math.abs(sig.delta)
              const isHigh = deviation > 40
              return (
                <div key={sig.label} style={{
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
                  padding: '20px 22px', animation: `fadeUp 0.4s ${i * 0.07}s both`,
                }}>
                  {/* Top row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: C.hover, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={16} color={C.sub} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{sig.label}</span>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 20,
                      background: isHigh ? (dk ? '#2C2C2E' : '#F0F0F0') : C.hover,
                      border: `1px solid ${isHigh ? C.border : 'transparent'}`,
                    }}>
                      {sig.trend === 'up' ? <TrendingUp size={11} color={C.text} /> : sig.trend === 'down' ? <TrendingDown size={11} color={C.text} /> : <Activity size={11} color={C.text} />}
                      <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>
                        {sig.delta > 0 ? '+' : ''}{sig.delta}%
                      </span>
                    </div>
                  </div>

                  {/* Value */}
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text, letterSpacing: '-0.02em' }}>
                      {sig.actual.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 13, color: C.sub, marginLeft: 6 }}>{sig.unit}</span>
                  </div>

                  {/* Dual bar */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ height: 6, borderRadius: 3, background: C.hover, position: 'relative', overflow: 'hidden' }}>
                      {/* baseline */}
                      <div style={{
                        position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 3,
                        width: `${Math.min((sig.baseline / Math.max(sig.baseline, sig.actual)) * 100, 100)}%`,
                        background: C.muted, transition: 'width 1s ease',
                      }} />
                      {/* actual */}
                      <div style={{
                        position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 3,
                        width: `${Math.min((sig.actual / Math.max(sig.baseline, sig.actual)) * 100, 100)}%`,
                        background: C.text, transition: 'width 1s ease',
                        opacity: 0.85,
                      }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}>
                    <span>Baseline: {sig.baseline.toLocaleString()} {sig.unit}</span>
                    <span style={{ fontWeight: 700, color: deviation > 20 ? C.text : C.muted }}>
                      {deviation > 20 ? '⚑ Flagged' : '✓ Normal'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Chart card */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 18,
            padding: '24px 28px', animation: 'fadeUp 0.4s 0.15s both',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3 }}>7-Day Screen Time</p>
                <p style={{ fontSize: 12, color: C.sub }}>Daily actual <span style={{ color: C.text, fontWeight: 600 }}>— vs —</span> baseline <span style={{ color: C.muted, fontWeight: 600 }}>- -</span></p>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.sub }}>
                  <div style={{ width: 18, height: 2, borderTop: '2px dashed #D1D1D6' }} /> Baseline
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text, fontWeight: 600 }}>
                  <div style={{ width: 18, height: 2.5, background: C.text, borderRadius: 2 }} /> Actual
                </div>
              </div>
            </div>

            <SparkLine data={device.weeklyData} w={680} h={90} />

            <div style={{
              display: 'grid', gridTemplateColumns: `repeat(${device.weeklyData.length}, 1fr)`,
              marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10,
            }}>
              {device.weeklyData.map(d => (
                <span key={d.day} style={{ textAlign: 'center', fontSize: 11, color: C.muted, fontWeight: 600 }}>{d.day}</span>
              ))}
            </div>
          </div>

          {/* Alerts strip + Live log — two columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, animation: 'fadeUp 0.4s 0.2s both' }}>

            {/* Alerts strip */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Recent Alerts</p>
                <button onClick={() => setAlertOpen(true)} style={{ background: 'none', border: 'none', fontSize: 12, color: C.sub, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  View all <ChevronRight size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.slice(0, 3).map(a => {
                  const sev = sevColor(a.severity_tier)
                  const devName = devices.find(d => d.id === a.device_id)?.name || a.device_id.slice(0, 8)
                  return (
                    <div key={a.id} onClick={() => { setAlerts(p => p.map(x => x.id === a.id ? { ...x, is_viewed: true } : x)); setAlertOpen(true) }}
                      style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px',
                        borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s',
                        background: !a.is_viewed ? (dk ? '#222' : '#FAFAF9') : 'transparent',
                        border: `1px solid ${!a.is_viewed ? C.border : 'transparent'}`,
                      }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.is_viewed ? C.muted : sev, marginTop: 4, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.plain_language_summary}</span>
                          <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, marginLeft: 8 }}>{devName}</span>
                        </div>
                        <p style={{ fontSize: 11, color: C.sub, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.plain_language_summary}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Live log */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '20px 22px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: wsStatus === 'connected' ? C.text : C.muted, animation: wsStatus === 'connected' ? 'pulse 2s infinite' : 'none' }} />
                <p style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Ingestion Log</p>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, border: `1px solid ${C.border}`, color: C.sub, marginLeft: 'auto' }}>
                  {wsStatus === 'connected' ? 'Connected' : 'Reconnecting'}
                </span>
              </div>
              <div style={{
                flex: 1, overflowY: 'auto', fontFamily: "'Space Grotesk', monospace", fontSize: 11,
                color: C.sub, lineHeight: 1.9, background: C.logBg, borderRadius: 10,
                padding: '10px 14px', border: `1px solid ${C.border}`, minHeight: 130, maxHeight: 160,
              }}>
                {logs.length === 0
                  ? <span style={{ color: C.muted }}>› Waiting for live events or simulation…</span>
                  : logs.map((l, i) => <div key={i} style={{ marginBottom: 1, animation: 'fadeUp 0.2s both' }}><span style={{ color: C.muted }}>›</span> {l}</div>)
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* moved overview-specific keyframes and small globals to globals.css */}
    </div>
  )
}
