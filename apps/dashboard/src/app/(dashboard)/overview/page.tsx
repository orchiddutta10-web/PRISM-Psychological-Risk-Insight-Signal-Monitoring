'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, Moon, Sun, Shield, TrendingUp, TrendingDown,
  ChevronRight, Smartphone, MapPin, Keyboard, Zap, CheckCircle, Info,
} from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { Card } from '@/components/ui/Card'
import { RiskGauge } from '@/components/ui/RiskGauge'
import { Sparkline } from '@/components/ui/Sparkline'
import { MetricCard, type Status } from '@/components/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Reveal } from '@/lib/motion'
import { useShell } from '@/components/layout/shell-context'
import { setSelectedDevice } from '@/lib/api'
import { cx } from '@/lib/cx'

/* ─────────────────────────────────────────────────────────────
   DEMO DATA — realistic, non-alarming baseline values
───────────────────────────────────────────────────────────── */
const DEVICES = [
  {
    id: 'dev-001', name: "Aarav's iPhone", initials: 'AA', childAge: 14,
    platform: 'iOS', lastSeen: '2 min ago', riskScore: 34, riskLabel: 'Normal Range',
    status: 'active' as const, concern: 'Screen Time & App Usage',
    signals: [
      { label: 'Screen Time', icon: Smartphone, baseline: 180, actual: 210, unit: 'min/day', delta: +17 },
      { label: 'Bedtime', icon: Moon, baseline: 22.0, actual: 22.5, unit: 'hr', delta: +2 },
      { label: 'Daily Steps', icon: MapPin, baseline: 6200, actual: 5900, unit: 'steps', delta: -5 },
      { label: 'Typing Pace', icon: Keyboard, baseline: 100, actual: 97, unit: 'WPM', delta: -3 },
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
      { label: 'Screen Time', icon: Smartphone, baseline: 150, actual: 290, unit: 'min/day', delta: +93 },
      { label: 'Bedtime', icon: Moon, baseline: 22.5, actual: 24.5, unit: 'hr', delta: +9 },
      { label: 'Daily Steps', icon: MapPin, baseline: 7000, actual: 3100, unit: 'steps', delta: -56 },
      { label: 'Typing Pace', icon: Keyboard, baseline: 95, actual: 78, unit: 'WPM', delta: -18 },
    ],
    weeklyData: [
      { day: 'Mon', baseline: 150, actual: 160 }, { day: 'Tue', baseline: 150, actual: 180 },
      { day: 'Wed', baseline: 150, actual: 210 }, { day: 'Thu', baseline: 150, actual: 240 },
      { day: 'Fri', baseline: 150, actual: 275 }, { day: 'Sat', baseline: 150, actual: 310 },
      { day: 'Sun', baseline: 150, actual: 290 },
    ],
  },
]

interface AlertItem {
  id: string
  severity: 'low' | 'medium' | 'high'
  title: string
  summary: string
  factors: string[]
  device: string
  time: string
  read: boolean
}

const INITIAL_ALERTS: AlertItem[] = [
  {
    id: 'a1', severity: 'medium', title: 'Late-Night Screen Activity',
    summary: "Priya's device showed 2.5h of usage between 11 PM–1:30 AM — later than her usual 10:30 PM bedtime.",
    factors: ['Screen time 93% above 7-day baseline', 'Bedtime shifted by +2 hours', 'Movement entropy dropped sharply'],
    device: "Priya's Android", time: '2h ago', read: false,
  },
  {
    id: 'a2', severity: 'low', title: 'Reduced Daily Movement',
    summary: "Priya's step count (3,100) was 56% below her usual 7,000-step daily average over 3 consecutive days.",
    factors: ['Steps 56% below rolling baseline', 'Home location stationary for 9+ hours'],
    device: "Priya's Android", time: '5h ago', read: true,
  },
  {
    id: 'a3', severity: 'low', title: 'Screen Time Slightly Elevated',
    summary: "Aarav's daily screen time is ~30 min above baseline. Within expected weekend variance.",
    factors: ['Screen time +17% above baseline', 'Usage primarily social & educational apps'],
    device: "Aarav's iPhone", time: 'Yesterday', read: true,
  },
]

const GUIDANCE_MODES = [
  { title: 'The Direct Coach', description: 'Notices the thought behind a feeling, gently offers another way to see the situation, and pushes toward one small, doable next step. Brisk, warm, action-oriented.' },
  { title: 'The Listener', description: 'Mostly reflects back what the user says and feels rather than advising. Trusts the user already has the answer inside them. Only offers an opinion if directly asked, and even then frames it as one option.' },
  { title: 'The Strategist', description: 'Focuses on "what\'s slightly better than today" instead of dissecting the past. Uses scaling questions (1–10), spots what\'s already working, and homes in on the smallest next step.' },
  { title: 'The Clinician', description: 'Asks structured questions like a clinical intake (sleep, appetite, concentration) and talks in clearer clinical-adjacent language than the others — but is the most repetitive about disclosing it\'s not a real clinician, since its tone is the one most likely to be mistaken for authority.' },
  { title: 'The Mentor', description: 'Draws out the user\'s own reasons for change rather than pushing advice, rolls with pushback instead of arguing, and occasionally reflects the user\'s own stated values back to them. Warm but willing to create a little productive friction.' },
]

function signalStatus(delta: number): Status {
  const dev = Math.abs(delta)
  if (dev > 40) return 'critical'
  if (dev > 20) return 'warning'
  return 'good'
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
    <PageContainer>
      <div className="space-y-6">
        {/* Paired devices — horizontal selector */}
        <Reveal>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DEVICES.map((d) => {
              const active = activeId === d.id
              return (
                <button
                  key={d.id}
                  onClick={() => {
                    setActiveId(d.id)
                    setSelectedDevice(d.id)
                  }}
                  className={cx(
                    'flex items-center gap-3 rounded-2xl border-[1.5px] p-4 text-left transition-all',
                    active
                      ? 'border-(--accent) bg-(--accent) text-(--accent-text)'
                      : 'border-(--border) bg-(--bg-card) text-(--text-primary) hover:border-(--border-strong)'
                  )}
                >
                  <div className={cx(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold',
                    active ? 'bg-white/20' : 'bg-(--bg-main)'
                  )}>
                    {d.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{d.name}</p>
                    <p className={cx('text-[11px]', active ? 'opacity-70' : 'text-(--text-muted)')}>
                      {d.platform} · Age {d.childAge}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cx('h-1 w-16 overflow-hidden rounded-full', active ? 'bg-white/20' : 'bg-(--gray-200)')}>
                      <div className="h-full rounded-full" style={{ width: `${d.riskScore}%`, background: active ? '#fff' : 'var(--accent)' }} />
                    </div>
                    <span className="font-mono text-[11px] font-extrabold tabular-nums">{d.riskScore}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </Reveal>

        {/* Profile header card */}
        <Reveal delay={0.04}>
          <Card className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-(--accent) text-lg font-extrabold text-(--accent-text)">
                  {device.initials}
                </div>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-(--text-primary)">{device.name}</h1>
                  <p className="mt-0.5 text-[13px] text-(--text-secondary)">
                    {device.platform} · Age {device.childAge} · Last seen {device.lastSeen}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <RiskGauge score={device.riskScore} label={device.riskLabel} />

                <div className="hidden h-16 w-px bg-(--border) sm:block" />

                <div>
                  <p className="mb-1 text-[11px] text-(--text-muted)">Primary concern</p>
                  <Badge tone="neutral">{device.concern}</Badge>
                </div>

                <Button onClick={openAlerts} icon={<Bell size={14} />}>
                  {unread > 0 ? `${unread} Alert${unread > 1 ? 's' : ''}` : 'Alerts'}
                </Button>

                {/* PRISM Node — isolated wearable surface */}
                <button
                  id="btn-prism-node"
                  onClick={() => {
                    setSelectedDevice(device.id)
                    router.push('/prism-node')
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border-[1.5px] border-indigo-500/40 bg-indigo-500/10 px-4 py-2.5 text-xs font-bold text-indigo-400 transition-colors hover:border-indigo-500/70"
                  title="Open PRISM Node wearable dashboard"
                >
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
                  PRISM Node
                </button>
              </div>
            </div>
          </Card>
        </Reveal>

        {/* Signal cards — 2×2 grid */}
        <Reveal delay={0.08}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {device.signals.map((sig) => {
              const Icon = sig.icon
              return (
                <MetricCard
                  key={sig.label}
                  title={sig.label}
                  value={sig.actual.toLocaleString()}
                  unit={sig.unit}
                  icon={<Icon size={16} />}
                  status={signalStatus(sig.delta)}
                  progress={Math.min((sig.actual / sig.baseline) * 100, 100)}
                  lastUpdated="Just now"
                />
              )
            })}
          </div>
        </Reveal>

        {/* Chart card */}
        <Reveal delay={0.12}>
          <Card className="p-6 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[15px] font-extrabold text-(--text-primary)">7-Day Screen Time</p>
                <p className="mt-1 text-xs text-(--text-secondary)">
                  Daily actual <span className="font-semibold text-(--text-primary)">— vs —</span> baseline <span className="text-(--text-muted)">- -</span>
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-(--text-secondary)">
                  <span className="inline-block h-0 w-4 border-t-2 border-dashed border-(--border-strong)" /> Baseline
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-(--text-primary)">
                  <span className="inline-block h-0.5 w-4 rounded bg-(--accent)" /> Actual
                </span>
              </div>
            </div>

            <Sparkline
              data={device.weeklyData.map((d) => ({ label: d.day, value: d.actual, baseline: d.baseline }))}
              width={680}
              height={90}
            />

            <div className="mt-2.5 grid border-t border-(--border) pt-2.5" style={{ gridTemplateColumns: `repeat(${device.weeklyData.length}, 1fr)` }}>
              {device.weeklyData.map((d) => (
                <span key={d.day} className="text-center text-[11px] font-semibold text-(--text-muted)">{d.day}</span>
              ))}
            </div>
          </Card>
        </Reveal>

        {/* Alerts strip + Live log — two columns */}
        <Reveal delay={0.16}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Alerts strip */}
            <Card>
              <div className="flex items-center justify-between px-6 py-4">
                <p className="text-[14px] font-extrabold text-(--text-primary)">Recent Alerts</p>
                <button onClick={openAlerts} className="flex items-center gap-1 text-xs text-(--text-secondary) transition-colors hover:text-(--text-primary)">
                  View all <ChevronRight size={12} />
                </button>
              </div>
              <div className="space-y-2 px-4 pb-5">
                {alerts.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAlerts((p) => p.map((x) => (x.id === a.id ? { ...x, read: true } : x)))
                      openAlerts()
                    }}
                    className={cx(
                      'flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
                      !a.read ? 'border-(--border) bg-(--bg-main)' : 'border-transparent'
                    )}
                  >
                    <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', a.read ? 'bg-(--text-muted)' : 'bg-(--accent)')} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold text-(--text-primary)">{a.title}</span>
                        <span className="shrink-0 text-[10px] text-(--text-muted)">{a.time}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-(--text-secondary)">{a.summary}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>

            {/* Live log */}
            <Card className="flex flex-col">
              <div className="flex items-center gap-2 px-6 py-4">
                <span className={cx('relative flex h-2 w-2', wsStatus !== 'connected' && 'opacity-40')}>
                  {wsStatus === 'connected' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--status-ok) opacity-60" />}
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-(--status-ok)" />
                </span>
                <p className="text-[14px] font-extrabold text-(--text-primary)">Ingestion Log</p>
                <Badge tone={wsStatus === 'connected' ? 'ok' : 'neutral'} className="ml-auto">
                  {wsStatus === 'connected' ? 'Connected' : 'Reconnecting'}
                </Badge>
              </div>
              <div className="mx-4 mb-5 max-h-[160px] flex-1 overflow-y-auto rounded-xl border border-(--border) bg-(--bg-main) p-3.5 font-mono text-[11px] leading-relaxed text-(--text-secondary)">
                {logs.length === 0
                  ? <span className="text-(--text-muted)">› Waiting for live events or simulation…</span>
                  : logs.map((l, i) => (
                      <div key={i} className="mb-0.5" style={{ animation: 'fadeUp 0.2s both' }}>
                        <span className="text-(--text-muted)">›</span> {l}
                      </div>
                    ))}
              </div>
            </Card>
          </div>
        </Reveal>

        {/* Demo scenarios + Guidance + Privacy */}
        <Reveal delay={0.2}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Demo scenarios */}
            <Card className="p-5">
              <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-(--text-muted)">
                <Zap size={10} /> Demo Scenarios
              </p>
              <div className="space-y-2">
                {[
                  { s: 'A' as const, emoji: '🌙', label: 'Late-Night Spike' },
                  { s: 'B' as const, emoji: '🚶', label: 'Social Withdrawal' },
                  { s: 'C' as const, emoji: '📱', label: 'Unknown App Risk' },
                ].map(({ s, emoji, label }) => (
                  <button
                    key={s}
                    onClick={() => runSim(s)}
                    disabled={simRunning}
                    className={cx(
                      'flex w-full items-center gap-2 rounded-xl border-[1.5px] border-(--border) bg-(--bg-main) px-3 py-2 text-left text-xs font-semibold text-(--text-primary) transition-colors hover:border-(--text-primary)',
                      simRunning && 'cursor-not-allowed opacity-45'
                    )}
                  >
                    <span>{emoji}</span> {label}
                  </button>
                ))}
                {simRunning && <p className="pt-1 text-center text-[11px] text-(--text-secondary)">Running simulation…</p>}
              </div>
            </Card>

            {/* Guidance modes */}
            <Card className="p-5 lg:col-span-2">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-(--text-muted)">Guidance Modes</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {GUIDANCE_MODES.map((item) => (
                  <div key={item.title} className="rounded-xl bg-(--bg-main) p-3">
                    <p className="text-[13px] font-bold text-(--text-primary)">{item.title}</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-(--text-secondary)">{item.description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-(--border) bg-(--bg-main) p-3.5">
                <p className="text-[11px] font-bold text-(--text-primary)">Common safety wrapper</p>
                <p className="mt-1.5 text-xs leading-relaxed text-(--text-secondary)">
                  All modes disclose they are AI, not a licensed clinician; none diagnose, prescribe, or encourage secrecy; and all defer immediately to the crisis-safety system for anything concerning.
                </p>
              </div>
            </Card>
          </div>
        </Reveal>

        {/* Privacy footer */}
        <Reveal delay={0.24}>
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-(--text-muted)">Privacy</p>
            {[
              { icon: <Shield size={11} />, text: 'Metadata only' },
              { icon: <CheckCircle size={11} />, text: 'Teen can pause anytime' },
              { icon: <Info size={11} />, text: 'Encrypted in transit' },
            ].map(({ icon, text }) => (
              <span key={text} className="flex items-center gap-1.5 text-[11px] text-(--text-secondary)">
                {icon} {text}
              </span>
            ))}
          </Card>
        </Reveal>
      </div>
    </PageContainer>
  )
}
