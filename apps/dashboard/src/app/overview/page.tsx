'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, LogOut, Moon, Sun, Eye, Shield, TrendingUp, TrendingDown,
  Activity, ChevronRight, Radio, Wifi, WifiOff, Play,
  Database, X, Clock, Smartphone, MapPin, Keyboard,
  AlertTriangle, CheckCircle, Info, BarChart2, Zap, Users,
  Cpu, HardDrive, Thermometer, Signal, Cloud, CloudOff, RefreshCw,
  Server, CircleDot
} from 'lucide-react'

/* ─────────────────────────────────────────────────────────────
   DEMO DATA — realistic, non-alarming baseline values
───────────────────────────────────────────────────────────── */
const DEVICES = [
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

const INITIAL_ALERTS = [
  {
    id: 'a1', severity: 'medium' as const, title: 'Late-Night Screen Activity',
    summary: "Priya's device showed 2.5h of usage between 11 PM–1:30 AM — later than her usual 10:30 PM bedtime.",
    factors: ['Screen time 93% above 7-day baseline', 'Bedtime shifted by +2 hours', 'Movement entropy dropped sharply'],
    device: "Priya's Android", time: '2h ago', read: false,
  },
  {
    id: 'a2', severity: 'low' as const, title: 'Reduced Daily Movement',
    summary: "Priya's step count (3,100) was 56% below her usual 7,000-step daily average over 3 consecutive days.",
    factors: ['Steps 56% below rolling baseline', 'Home location stationary for 9+ hours'],
    device: "Priya's Android", time: '5h ago', read: true,
  },
  {
    id: 'a3', severity: 'low' as const, title: 'Screen Time Slightly Elevated',
    summary: "Aarav's daily screen time is ~30 min above baseline. Within expected weekend variance.",
    factors: ['Screen time +17% above baseline', 'Usage primarily social & educational apps'],
    device: "Aarav's iPhone", time: 'Yesterday', read: true,
  },
]

/* ─────────────────────────────────────────────────────────────
   PREMIUM REUSABLE COMPONENTS
───────────────────────────────────────────────────────────── */

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

/** Mini progress ring for KPIs */
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

/** Compact KPI card */
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

/** Animated status dot */
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
   MAIN PAGE
───────────────────────────────────────────────────────────── */
export default function OverviewPage() {
  const router = useRouter()
  const [guardian, setGuardian] = useState({ name: 'Guardian', role: 'guardian' })
  const [activeId, setActiveId] = useState(DEVICES[0].id)
  const [alerts, setAlerts] = useState(INITIAL_ALERTS)
  const [alertOpen, setAlertOpen] = useState(false)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [logs, setLogs] = useState<string[]>([])
  const [simRunning, setSim] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const wsRef = useRef<WebSocket | null>(null)

  // Simulated system health metrics
  const [sysHealth, setSysHealth] = useState({
    cpu: 34, ram: 58, disk: 42, temp: 47,
    networkPct: 88, syncStatus: 'synced' as const, queueSize: 3,
    lastSync: '18s ago', apiLatency: 47, dbStatus: 'healthy' as const,
    uptime: '3d 14h', activeSensors: 4, dataRate: '1.2 KB/s',
  })

  // Live-update system health every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      setSysHealth(prev => ({
        ...prev,
        cpu: Math.max(12, Math.min(92, prev.cpu + (Math.random() - 0.5) * 8)),
        ram: Math.max(20, Math.min(95, prev.ram + (Math.random() - 0.5) * 6)),
        networkPct: Math.max(50, Math.min(98, prev.networkPct + (Math.random() - 0.5) * 4)),
        apiLatency: Math.max(20, Math.min(220, prev.apiLatency + (Math.random() - 0.5) * 15)),
        queueSize: Math.max(0, Math.min(12, prev.queueSize + (Math.random() > 0.7 ? 1 : Math.random() > 0.9 ? -1 : 0))),
        lastSync: `${Math.floor(Math.random() * 60 + 5)}s ago`,
        dataRate: `${(Math.random() * 2 + 0.5).toFixed(1)} KB/s`,
      }))
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const device = DEVICES.find(d => d.id === activeId) ?? DEVICES[0]
  const unread = alerts.filter(a => !a.read).length

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

    try {
      const ws = new WebSocket(`ws://localhost:8000/api/v1/events/ws?token=${token}`)
      wsRef.current = ws
      ws.onopen  = () => setWsStatus('connected')
      ws.onclose = () => setWsStatus('disconnected')
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
    const newAlert = {
      id: `sim-${Date.now()}`,
      severity: (s === 'C' ? 'high' : s === 'A' ? 'medium' : 'low') as any,
      title: s === 'C' ? 'New High-Risk App Detected' : s === 'A' ? 'Late-Night Screen Spike' : 'Social Withdrawal Signal',
      summary: s === 'C' ? 'An unrecognised anonymous chat app appeared in overnight app-usage metadata.' : s === 'A' ? 'Screen usage spiked to 3.5h between 11 PM–2:30 AM, well beyond baseline.' : 'Step count and movement entropy dropped simultaneously — correlated withdrawal signal.',
      factors: steps[s].slice(0, 2),
      device: "Priya's Android", time: 'Just now', read: false,
    }
    setAlerts(p => [newAlert, ...p])
    setAlertOpen(true)
    setSim(false)
  }

  const sevBorder = (s: string) => s === 'high' ? '#2C2C2E' : s === 'medium' ? '#636366' : '#AEAEB2'
  const sevColors: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#AEAEB2' }

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
    glowGreen: dk ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.10)',
    glowIndigo: dk ? 'rgba(99,102,241,0.20)' : 'rgba(99,102,241,0.12)',
    glowAmber: dk ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.10)',
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

      {/* ══════════════════════════════════════════════════════
          ALERT PANEL (slide-over)
      ══════════════════════════════════════════════════════ */}
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
            {alerts.map((a, i) => (
              <div key={a.id} onClick={() => setAlerts(p => p.map(x => x.id === a.id ? { ...x, read: true } : x))}
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
                        {(a.severity as string) === 'high' ? '● High' : (a.severity as string) === 'medium' ? '● Moderate' : '● Low'}
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

      {/* ══════════════════════════════════════════════════════
          BODY LAYOUT  (sidebar + main)
      ══════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', maxWidth: 1440, margin: '0 auto', padding: '28px 28px 48px', gap: 24 }}>

        {/* ── SIDEBAR ──────────────────────────────────────── */}
        <aside style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
            Paired Devices
          </p>

          {DEVICES.map(d => {
            const active = activeId === d.id
            return (
              <button key={d.id} onClick={() => {
                setActiveId(d.id)
                localStorage.setItem('prism_selected_device', d.id)
              }} style={{
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
                    <p style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{d.platform} · Age {d.childAge}</p>
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

        {/* ── MAIN CONTENT ─────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* ═══════ PROFILE HEADER CARD ═══════ */}
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
                <p style={{ fontSize: 13, color: C.sub }}>{device.platform} · Age {device.childAge} · Last seen {device.lastSeen}</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <RiskGauge score={device.riskScore} />
                <p style={{ fontSize: 11, color: C.sub, marginTop: 4, fontWeight: 600 }}>{device.riskLabel}</p>
              </div>
              <div style={{ height: 56, width: 1, background: C.border }} />
              <div>
                <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Primary concern</p>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${C.border}`, color: C.text }}>
                  {device.concern}
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

              {/* PRISM Node button — premium glassmorphism */}
              <button onClick={() => { localStorage.setItem('prism_selected_device', device.id); router.push('/prism-node') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
                  background: `linear-gradient(135deg, rgba(99,102,241,0.16), rgba(139,92,246,0.16))`,
                  color: '#a5b4fc', border: '1.5px solid rgba(99,102,241,0.35)', borderRadius: 12,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.01em',
                  transition: 'all 0.3s ease',
                  backdropFilter: 'blur(8px)',
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

          {/* ═══════ SIGNAL CARDS (2 × 2) ═══════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, animation: 'fadeUp 0.4s 0.06s both' }}>
            {device.signals.map((sig, i) => {
              const Icon = sig.icon
              const deviation = Math.abs(sig.delta)
              const isHigh = deviation > 40
              return (
                <div key={sig.label} style={{
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
                  padding: '18px 20px', animation: `fadeUp 0.4s ${i * 0.07}s both`,
                  transition: 'all 0.2s ease',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.text; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${dk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: C.hover, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={15} color={C.sub} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{sig.label}</span>
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
                  <div style={{ marginBottom: 14 }}>
                    <span style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text, letterSpacing: '-0.02em' }}>
                      {sig.actual.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 13, color: C.sub, marginLeft: 6 }}>{sig.unit}</span>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ height: 5, borderRadius: 3, background: C.hover, position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 3,
                        width: `${Math.min((sig.baseline / Math.max(sig.baseline, sig.actual)) * 100, 100)}%`,
                        background: C.muted, transition: 'width 1s ease',
                      }} />
                      <div style={{
                        position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 3,
                        width: `${Math.min((sig.actual / Math.max(sig.baseline, sig.actual)) * 100, 100)}%`,
                        background: C.text, transition: 'width 1s ease', opacity: 0.85,
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

          {/* ═══════ CHART CARD ═══════ */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 18,
            padding: '22px 26px', animation: 'fadeUp 0.4s 0.15s both',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 3 }}>7-Day Screen Time</p>
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
                {alerts.slice(0, 3).map(a => (
                  <div key={a.id} onClick={() => { setAlerts(p => p.map(x => x.id === a.id ? { ...x, read: true } : x)); setAlertOpen(true) }}
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
                  ? <span style={{ color: C.muted }}>› Waiting for live events or simulation…</span>
                  : logs.map((l, i) => <div key={i} style={{ marginBottom: 1, animation: 'fadeUp 0.2s both' }}><span style={{ color: C.muted }}>›</span> {l}</div>)
                }
              </div>
            </div>
          </div>

          {/* ═══════ SYSTEM HEALTH KPIs (4 columns) ═══════ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, animation: 'fadeUp 0.4s 0.25s both' }}>
            <KpiCard
              icon={<Cpu size={18} />}
              label="CPU Usage"
              value={`${sysHealth.cpu.toFixed(0)}%`}
              sub={`${sysHealth.activeSensors} sensors · ${sysHealth.dataRate}`}
              color="#6366F1"
              ringPct={sysHealth.cpu}
            />
            <KpiCard
              icon={<HardDrive size={18} />}
              label="Memory"
              value={`${sysHealth.ram.toFixed(0)}%`}
              sub={`Disk ${sysHealth.disk}% · Temp ${sysHealth.temp}°C`}
              color="#10B981"
              ringPct={sysHealth.ram}
            />
            <KpiCard
              icon={<Cloud size={18} />}
              label="Cloud Sync"
              value={sysHealth.syncStatus === 'synced' ? 'Synced' : 'Pending'}
              sub={`Last: ${sysHealth.lastSync} · Queue: ${sysHealth.queueSize.toFixed(0)}`}
              color="#F59E0B"
            />
            <KpiCard
              icon={<Wifi size={18} />}
              label="Connectivity"
              value={`${sysHealth.networkPct.toFixed(0)}%`}
              sub={`API: ${sysHealth.apiLatency.toFixed(0)}ms · ${sysHealth.uptime}`}
              color="#0EA5E9"
              ringPct={sysHealth.networkPct}
            />
          </div>

          {/* ═══════ PRISM NODE PREMIUM CARD ═══════ */}
          <div style={{
            background: `linear-gradient(145deg, ${dk ? '#1A1A2E' : '#F8F7FF'}, ${dk ? '#1C1C1E' : '#FFFFFF'})`,
            border: `1px solid ${dk ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.15)'}`,
            borderRadius: 20, padding: '22px 26px', animation: 'fadeUp 0.4s 0.3s both',
            position: 'relative', overflow: 'hidden',
            transition: 'all 0.3s ease',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = dk ? '0 0 40px rgba(99,102,241,0.12)' : '0 4px 32px rgba(99,102,241,0.08)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
          >
            {/* Background glow */}
            <div style={{
              position: 'absolute', top: -60, right: -40, width: 200, height: 200,
              borderRadius: '50%', background: 'rgba(99,102,241,0.04)', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', bottom: -40, left: '40%', width: 160, height: 160,
              borderRadius: '50%', background: 'rgba(139,92,246,0.03)', pointerEvents: 'none',
            }} />

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Prism icon with glow */}
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))',
                  border: '1.5px solid rgba(99,102,241,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', background: '#818cf8',
                    animation: 'nodePulse 2s ease-in-out infinite',
                  }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>PRISM Node</p>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                      background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <StatusDot status="healthy" size={6} /> Online
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{device.name} · ESP32 + Raspberry Pi · v5.0 firmware</p>
                </div>
              </div>
              <button onClick={() => router.push('/prism-node')} style={{
                padding: '8px 18px', borderRadius: 10, border: '1.5px solid rgba(99,102,241,0.3)',
                background: 'rgba(99,102,241,0.08)', color: '#a5b4fc', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.16)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.6)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.3)' }}
              >
                Open Dashboard <ChevronRight size={12} style={{ marginLeft: 4, display: 'inline' }} />
              </button>
            </div>

            {/* Metrics grid — 6 columns */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12,
              position: 'relative', zIndex: 1,
            }}>
              {/* CPU */}
              <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: C.hover }}>
                <div style={{ display: 'inline-flex', position: 'relative', marginBottom: 8 }}>
                  <MiniRing pct={sysHealth.cpu} size={52} stroke={5} color="#6366F1" />
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text }}>
                    {sysHealth.cpu.toFixed(0)}
                  </span>
                </div>
                <p style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>CPU</p>
              </div>
              {/* Memory */}
              <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: C.hover }}>
                <div style={{ display: 'inline-flex', position: 'relative', marginBottom: 8 }}>
                  <MiniRing pct={sysHealth.ram} size={52} stroke={5} color="#10B981" />
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text }}>
                    {sysHealth.ram.toFixed(0)}
                  </span>
                </div>
                <p style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Memory</p>
              </div>
              {/* Temperature */}
              <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: C.hover }}>
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Thermometer size={20} color={sysHealth.temp > 70 ? '#EF4444' : '#F59E0B'} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text, marginBottom: 2 }}>{sysHealth.temp}°C</p>
                <p style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Temp</p>
              </div>
              {/* Network */}
              <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: C.hover }}>
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Signal size={16} color="#0EA5E9" />
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 14 }}>
                    {[0.4, 0.7, 1, 0.85].map((h, i) => (
                      <div key={i} style={{ width: 3, height: `${h * 14}px`, borderRadius: '1px', background: i < 3 ? '#0EA5E9' : '#AEAEB2', opacity: i < 3 ? 1 : 0.3 }} />
                    ))}
                  </div>
                </div>
                <p style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text, marginBottom: 2 }}>{sysHealth.networkPct.toFixed(0)}%</p>
                <p style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Signal</p>
              </div>
              {/* Sync */}
              <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: C.hover }}>
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <RefreshCw size={15} color="#10B981" style={{ animation: 'spin 3s linear infinite' }} />
                  <StatusDot status="healthy" size={6} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text, marginBottom: 2 }}>Synced</p>
                <p style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sysHealth.lastSync}</p>
              </div>
              {/* Queue */}
              <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: C.hover }}>
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Database size={18} color={sysHealth.queueSize > 5 ? '#F59E0B' : '#10B981'} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text, marginBottom: 2 }}>{sysHealth.queueSize.toFixed(0)}</p>
                <p style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Queue</p>
              </div>
            </div>

            {/* Footer status bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`, position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', gap: 18 }}>
                {[
                  { label: 'DB', status: sysHealth.dbStatus === 'healthy' ? 'healthy' as const : 'warning' as const },
                  { label: 'API', status: sysHealth.apiLatency < 100 ? 'healthy' as const : sysHealth.apiLatency < 200 ? 'warning' as const : 'critical' as const },
                  { label: 'Edge', status: 'healthy' as const },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: C.muted }}>
                    <StatusDot status={item.status} size={6} /> <span style={{ fontWeight: 600 }}>{item.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: C.muted }}>
                <span>Uptime: <span style={{ fontWeight: 700, color: C.sub }}>{sysHealth.uptime}</span></span>
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: C.muted }} />
                <span>API: <span style={{ fontWeight: 700, color: C.sub }}>{sysHealth.apiLatency.toFixed(0)}ms</span></span>
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: C.muted }} />
                <span>Last backup: <span style={{ fontWeight: 700, color: C.sub }}>22 min ago</span></span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}