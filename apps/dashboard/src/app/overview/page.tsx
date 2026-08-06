'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, LogOut, Moon, Sun, Eye, Shield, TrendingUp, TrendingDown,
  Activity, ChevronRight, Radio, Wifi, WifiOff, Play,
  Database, X, Clock, Smartphone, MapPin, Keyboard,
  AlertTriangle, CheckCircle, Info, BarChart2, Zap, Users, Heart
} from 'lucide-react'
import { API, wsUrl, authFetch } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

/* ─────────────────────────────────────────────────────────────
   DEMO DATA — realistic, non-alarming baseline values
───────────────────────────────────────────────────────────── */
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
  const [alerts, setAlerts] = useState(INITIAL_ALERTS)
  const [alertOpen, setAlertOpen] = useState(false)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [logs, setLogs] = useState<string[]>([])
  const [simRunning, setSim] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [isLive, setIsLive] = useState(false)
  const [pulseData, setPulseData] = useState<{ bpm: number; g_force: number; alert_status: string; pulse_raw: number; ts_ms: number } | null>(null)
  const [pulseConnected, setPulseConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const device = devices.find(d => d.id === activeId) ?? devices[0]
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

    const loadDevices = async () => {
      try {
        const res = await authFetch(`/auth/devices`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(`Devices API returned ${res.status}`)
        const list: any[] = await res.json()
        if (list.length > 0) {
          const mapped = list.map((d, i) => {
            const initials = d.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || 'DV'
            const risk = d.risk_score ?? 0
            return {
              id: d.id,
              name: d.name,
              initials,
              childAge: 14,
              platform: d.platform === 'ios' ? 'iOS' : 'Android',
              lastSeen: d.last_seen ? new Date(d.last_seen).toLocaleString() : 'Never',
              riskScore: risk,
              riskLabel: d.risk_label || 'Normal Range',
              status: risk >= 55 ? 'idle' as const : 'active' as const,
              concern: d.latest_alert?.summary || 'Monitoring active',
              signals: [
                { label: 'Consent Grants', icon: Shield, baseline: 1, actual: Math.max(1, d.consent_count ?? 1), unit: 'active', delta: 0, trend: 'stable' as const },
                { label: 'Latest Signal', icon: Activity, baseline: 1, actual: d.latest_alert ? 1 : 0, unit: 'alert', delta: d.latest_alert ? 25 : 0, trend: d.latest_alert ? ('up' as const) : ('stable' as const) },
              ],
              weeklyData: [
                { day: 'Mon', baseline: 100, actual: 100 }, { day: 'Tue', baseline: 100, actual: 100 },
                { day: 'Wed', baseline: 100, actual: 100 }, { day: 'Thu', baseline: 100, actual: 100 },
                { day: 'Fri', baseline: 100, actual: 100 }, { day: 'Sat', baseline: 100, actual: 100 },
                { day: 'Sun', baseline: 100, actual: 100 },
              ],
            }
          })
          setDevices(mapped)
          setActiveId(mapped[0].id)
          setIsLive(true)
          pushLog(`Fetched ${mapped.length} device${mapped.length > 1 ? 's' : ''} from API`)
        }
      } catch {
        pushLog('Devices API unreachable — showing demo data')
      }
    }
    loadDevices()

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    const maxDelay = 30000

    const connect = () => {
      if (ws?.readyState === WebSocket.OPEN) return
      try {
        ws = new WebSocket(wsUrl('/events/ws?token=' + token))
        wsRef.current = ws
        ws.onopen = () => {
          setWsStatus('connected')
          attempt = 0
        }
        ws.onclose = () => {
          setWsStatus('disconnected')
          scheduleReconnect()
        }
        ws.onerror = () => {
          setWsStatus('disconnected')
          scheduleReconnect()
        }
        ws.onmessage = (ev) => {
          try { const d = JSON.parse(ev.data); if (d.type !== 'chat_message') pushLog(`Live › ${d.signal_type?.toUpperCase() ?? 'EVENT'} — ${String(d.device_id ?? '').slice(0, 8)}`) } catch {}
        }
      } catch { setWsStatus('disconnected'); scheduleReconnect() }
    }

    const scheduleReconnect = () => {
      if (reconnectTimer) return
      const delay = Math.min(1000 * Math.pow(2, attempt), maxDelay)
      attempt += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delay)
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [router, pushLog])

  // Poll ESP32 pulse data from bridge
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('http://192.168.180.97:8081/latest')
        const json = await res.json()
        if (json.status === 'ok' && json.data && json.data.bpm) {
          setPulseData(json.data)
          setPulseConnected(true)
        }
      } catch {
        setPulseConnected(false)
      }
    }
    poll()
    const interval = setInterval(poll, 2000)
    return () => clearInterval(interval)
  }, [])

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

  const getSevVariant = (s: string) => s === 'high' ? 'danger' : s === 'medium' ? 'warning' : 'success'

  const dk = theme === 'dark'
  const C = {
    bg:     dk ? '#0A0A0A' : '#F4F4F2',
    nav:    dk ? '#111111' : '#FFFFFF',
    border: dk ? '#2C2C2E' : '#EBEBEB',
    text:   dk ? '#FFFFFF' : '#0A0A0A',
    sub:    dk ? '#8E8E93' : '#6B6B6B',
    muted:  dk ? '#48484A' : '#AEAEB2',
    hover:  dk ? '#2C2C2E' : '#F4F4F2',
    accent: dk ? '#FFFFFF' : '#0A0A0A',
    accentTxt: dk ? '#0A0A0A' : '#FFFFFF',
    logBg:  dk ? '#0A0A0A' : '#F9F9F8',
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", transition: 'background 0.2s, color 0.2s' }}>

      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        height: 58, background: C.nav, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', padding: '0 28px', gap: 0,
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
          { label: 'Companion', active: false, href: '/companion' },
          { label: 'Alerts', active: false, href: '/alerts' },
          { label: 'Medical AI', active: false, href: '/medical' },
          { label: 'Typing', active: false, href: '/typing-analytics' },
        ].map(tab => (
          <Button key={tab.label} variant={tab.active ? 'custom' : 'ghost'} onClick={() => router.push(tab.href)} style={{
            marginRight: 4, background: tab.active ? C.hover : 'transparent', color: tab.active ? C.text : C.sub,
          }}>
            {tab.label}
          </Button>
        ))}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: C.hover, marginRight: 4 }}>
            {isLive
              ? <><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', animation: 'pulse 2s infinite' }} /><span style={{ fontSize: 12, color: '#16A34A', fontWeight: 700 }}>API DATA</span></>
              : wsStatus === 'connected'
              ? <><div style={{ width: 6, height: 6, borderRadius: '50%', background: C.text, animation: 'pulse 2s infinite' }} /><span style={{ fontSize: 12, color: C.sub }}>Live</span></>
              : <><WifiOff size={12} color={C.muted} /><span style={{ fontSize: 12, color: C.muted }}>Offline</span></>
            }
          </div>

          <Button variant="outline" onClick={() => applyTheme(theme === 'light' ? 'dark' : 'light')} style={{ width: 36, height: 36, padding: 0 }}>
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </Button>

          <Button variant="outline" onClick={() => setAlertOpen(o => !o)} style={{
            position: 'relative', width: 36, height: 36, padding: 0,
            background: alertOpen ? C.accent : 'transparent', color: alertOpen ? C.accentTxt : C.sub,
          }}>
            <Bell size={15} />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -5, background: C.text, color: C.accentTxt,
                fontSize: 9, fontWeight: 800, borderRadius: 10, padding: '1px 5px', minWidth: 16, textAlign: 'center',
              }}>{unread}</span>
            )}
          </Button>

          <div style={{ width: 1, height: 24, background: C.border, margin: '0 8px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.accentTxt }}>
                {guardian.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{guardian.name.split(' ')[0]}</span>
          </div>

          <Button variant="outline" onClick={() => { wsRef.current?.close(); localStorage.clear(); router.push('/') }}>
            <LogOut size={13} /> Sign out
          </Button>
        </div>
      </nav>

      {alertOpen && (
        <Card style={{
          position: 'fixed', top: 58, right: 0, width: 400, height: 'calc(100vh - 58px)',
          borderLeft: `1px solid ${C.border}`, zIndex: 200, padding: 0,
          display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.07)',
          borderRadius: 0,
        }}>
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Alerts</p>
              <p style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{unread} unread · {alerts.length} total</p>
            </div>
            <Button variant="ghost" onClick={() => setAlertOpen(false)} style={{ width: 32, height: 32, padding: 0 }}>
              <X size={15} />
            </Button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {alerts.map((a, i) => (
              <div key={a.id} onClick={() => setAlerts(p => p.map(x => x.id === a.id ? { ...x, read: true } : x))}
                style={{
                  padding: '16px 24px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                  background: !a.read ? (dk ? '#1A1A1A' : '#FAFAF9') : 'transparent',
                  transition: 'background 0.15s', animation: `fadeUp 0.3s ${i * 0.05}s both`,
                }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ marginTop: 3, flexShrink: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.read ? C.muted : C.text, border: `2px solid ${a.read ? C.border : C.text}` }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{a.title}</span>
                      <span style={{ fontSize: 11, color: C.muted, flexShrink: 0, marginLeft: 12 }}>{a.time}</span>
                    </div>
                    <p style={{ fontSize: 12, color: C.sub, lineHeight: 1.65, marginBottom: 10 }}>{a.summary}</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      <Badge variant={getSevVariant(a.severity as string)}>
                        {(a.severity as string) === 'high' ? '● High' : (a.severity as string) === 'medium' ? '● Moderate' : '● Low'}
                      </Badge>
                      <Badge variant="default">
                        {a.device}
                      </Badge>
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
        </Card>
      )}

      <div style={{ display: 'flex', maxWidth: 1320, margin: '0 auto', padding: '28px 28px 48px', gap: 24 }}>
        <aside style={{ width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
            Paired Devices
          </p>

          {devices.map(d => {
            const active = activeId === d.id
            return (
              <button key={d.id} onClick={() => {
                setActiveId(d.id)
                localStorage.setItem('prism_selected_device', d.id)
              }} style={{
                background: active ? C.text : 'var(--bg-card)',
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

          <Card style={{ padding: 16, marginTop: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={10} /> Demo Scenarios
            </p>
            {[
              { s: 'A' as const, emoji: '🌙', label: 'Late-Night Spike' },
              { s: 'B' as const, emoji: '🚶', label: 'Social Withdrawal' },
              { s: 'C' as const, emoji: '📱', label: 'Unknown App Risk' },
            ].map(({ s, emoji, label }) => (
              <Button key={s} variant="outline" onClick={() => runSim(s)} disabled={simRunning} style={{
                width: '100%', marginBottom: 7, padding: '9px 12px', justifyContent: 'flex-start',
              }}>
                <span>{emoji}</span> {label}
              </Button>
            ))}
            {simRunning && <p style={{ fontSize: 11, color: C.sub, textAlign: 'center', marginTop: 6, opacity: 0.7 }}>Running simulation…</p>}
          </Card>

          <Card style={{ padding: 16, marginTop: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 12 }}>Guidance Modes</p>
            <div style={{ marginTop: 12, padding: 14, borderRadius: 14, background: C.hover, border: `1px solid ${C.border}` }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.text }}>Common safety wrapper</p>
              <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.7, color: C.sub }}>
                All modes disclose they are AI, not a licensed clinician.
              </p>
            </div>
          </Card>
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'fadeUp 0.4s both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                <Badge variant="default">{device.concern}</Badge>
              </div>

              <Button onClick={() => setAlertOpen(true)}>
                <Bell size={14} /> {unread > 0 ? `${unread} Alert${unread > 1 ? 's' : ''}` : 'Alerts'}
              </Button>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, animation: 'fadeUp 0.4s 0.06s both' }}>
            {device.signals.map((sig, i) => {
              const Icon = sig.icon
              const deviation = Math.abs(sig.delta)
              const isHigh = deviation > 40
              return (
                <Card key={sig.label} style={{ animation: `fadeUp 0.4s ${i * 0.07}s both` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: C.hover, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={16} color={C.sub} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{sig.label}</span>
                    </div>
                    <Badge variant={isHigh ? 'warning' : 'default'}>
                      {sig.trend === 'up' ? <TrendingUp size={11} /> : sig.trend === 'down' ? <TrendingDown size={11} /> : <Activity size={11} />}
                      {sig.delta > 0 ? '+' : ''}{sig.delta}%
                    </Badge>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text, letterSpacing: '-0.02em' }}>
                      {sig.actual.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 13, color: C.sub, marginLeft: 6 }}>{sig.unit}</span>
                  </div>
                </Card>
              )
            })}
          </div>

          {pulseData && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', animation: 'fadeUp 0.4s 0.2s both' }}>
              <Card style={{ padding: 0, overflow: 'hidden', background: '#0A0A0A', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Live Camera Feed</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16A34A', animation: 'pulse 2s infinite' }} />
                </div>
                <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img 
                    src="http://192.168.180.97:8081/camera/stream" 
                    alt="Live Camera Feed"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.nextElementSibling) {
                        (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'block';
                      }
                    }}
                  />
                  <div style={{ display: 'none', color: '#8E8E93', fontSize: 14 }}>Camera Stream Offline</div>
                </div>
              </Card>
            <Card style={{
              background: pulseData.alert_status.startsWith('WARNING') ? '#FFF7ED' : pulseConnected ? '#F0FDF4' : '#F9FAFB',
              borderColor: pulseData.alert_status.startsWith('WARNING') ? '#FBBF24' : pulseConnected ? '#22C55E' : '#E5E7EB',
              animation: 'fadeUp 0.4s 0.2s both',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Heart size={18} color="#DC2626" style={{ animation: 'pulse 1.2s infinite' }} />
                  </div>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>ESP32 PULSE — Live</span>
                    <span style={{ marginLeft: 8, fontSize: 10, color: pulseConnected ? '#16A34A' : '#DC2626', fontWeight: 700 }}>
                      {pulseConnected ? '● ONLINE' : '● OFFLINE'}
                    </span>
                  </div>
                </div>
                <Badge variant={pulseData.alert_status.startsWith('WARNING') ? 'warning' : 'success'}>
                  {pulseData.alert_status}
                </Badge>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Heart Rate</p>
                  <span style={{ fontSize: 36, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text }}>
                    {pulseData.bpm}
                  </span>
                  <span style={{ fontSize: 14, color: C.sub, marginLeft: 4 }}>BPM</span>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>G-Force</p>
                  <span style={{ fontSize: 36, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text }}>
                    {pulseData.g_force.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 14, color: C.sub, marginLeft: 4 }}>G</span>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Raw Signal</p>
                  <span style={{ fontSize: 36, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: C.text }}>
                    {pulseData.pulse_raw}
                  </span>
                </div>
              </div>
            </Card>
            </div>
          )}

          {!pulseData && (
            <Card style={{ animation: 'fadeUp 0.4s 0.2s both', opacity: 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '8px 0' }}>
                <WifiOff size={14} color={C.muted} />
                <span style={{ fontSize: 13, color: C.sub }}>ESP32 PULSE — Waiting for data…</span>
              </div>
            </Card>
          )}

          <Card style={{ animation: 'fadeUp 0.4s 0.15s both' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3 }}>7-Day Screen Time</p>
                <p style={{ fontSize: 12, color: C.sub }}>Daily actual vs baseline</p>
              </div>
            </div>
            <SparkLine data={device.weeklyData} w={680} h={90} />
          </Card>
        </div>
      </div>
    </div>
  )
}
