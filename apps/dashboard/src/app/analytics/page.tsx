'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ShieldCheck, Activity, HeartPulse, TrendingUp, TrendingDown,
  BookOpen, FileText, Stethoscope, MessageSquare, Calendar, AlertTriangle,
  CheckCircle2, Info, Clock, ChevronRight, X, Search, Sparkles,
} from 'lucide-react'
import { API, authFetch } from '@/lib/api'

/* ─── Types ──────────────────────────────────────────────── */

interface TrendPoint {
  period_start: string
  period_end: string
  wellness: number
  sample_count: number
  scores: Record<string, number>
}

interface TrendResponse {
  device_id: string
  granularity: string
  points: TrendPoint[]
  trend: number
}

interface AlertItem {
  id: string
  device_id: string
  severity_tier: string
  plain_language_summary: string
  contributing_factors: string[]
  is_viewed: boolean
  timestamp: string
}

interface ChatTurn {
  role: 'user' | 'assistant'
  utterance: string
  evidence?: { source: string; page: number; chunk: string; score: number }[]
  timestamp: string
}

interface DeviceInfo {
  id: string
  name: string
  platform: string
  last_seen: string | null
  risk_score: number
  risk_label: string
}

/* ─── Helpers ───────────────────────────────────────────── */

const DIM_COLORS: Record<string, string> = {
  stress: '#EF4444',
  cognitive_load: '#F59E0B',
  typing_fatigue: '#8B5CF6',
  typing_stability: '#10B981',
  mental_risk: '#0B70D1',
}

const DIM_LABELS: Record<string, string> = {
  stress: 'Stress',
  cognitive_load: 'Cognitive load',
  typing_fatigue: 'Typing fatigue',
  typing_stability: 'Typing stability',
  mental_risk: 'Mental wellness',
}

function LineChart({ data, height = 140 }: { data: TrendPoint[]; height?: number }) {
  const w = 600
  const h = height
  const pad = { t: 10, b: 14, l: 6, r: 6 }
  if (data.length === 0) return null
  const all = data.flatMap(p => [p.wellness, ...Object.values(p.scores).filter(v => v !== undefined)])
  const min = Math.min(0, ...all) - 0.05
  const max = Math.max(1, ...all) + 0.05
  const sx = (i: number) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r)
  const sy = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b)

  // Wellness line
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d.wellness).toFixed(1)}`).join(' ')

  // Per-dimension dashed lines
  const dims = Object.keys(DIM_COLORS).filter(dim => data.some(p => p.scores[dim] !== undefined))

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={pad.l} y1={pad.t + p * (h - pad.t - pad.b)} x2={w - pad.r} y2={pad.t + p * (h - pad.t - pad.b)}
          stroke="#E5E5EA" strokeWidth={1} />
      ))}
      {dims.map(dim => {
        const pts = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d.scores[dim] ?? 0).toFixed(1)}`).join(' ')
        return (
          <path key={dim} d={pts} fill="none" stroke={DIM_COLORS[dim]} strokeWidth={1.4}
            strokeDasharray="5 4" opacity={0.7} />
        )
      })}
      <path d={path} fill="none" stroke="#0A0A0A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={sx(i)} cy={sy(d.wellness)} r={i === data.length - 1 ? 4 : 2.5}
          fill={i === data.length - 1 ? '#0A0A0A' : '#fff'} stroke="#0A0A0A"
          strokeWidth={i === data.length - 1 ? 0 : 1.5} />
      ))}
      {data.map((d, i) => (
        <text key={`x${i}`} x={sx(i)} y={h - 2} textAnchor="middle" fontSize={8.5} fill="#8E8E93">
          {new Date(d.period_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
      ))}
    </svg>
  )
}

function RiskMeter({ wellness, trend }: { wellness: number; trend: number }) {
  const pct = Math.round(wellness * 100)
  const label = pct < 30 ? 'Stable' : pct < 55 ? 'Elevated' : 'Needs attention'
  const color = pct < 30 ? '#16A34A' : pct < 55 ? '#F59E0B' : '#EF4444'
  const r = 42, circ = 2 * Math.PI * r
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: 104, height: 104 }}>
        <svg width={104} height={104} viewBox="0 0 104 104">
          <circle cx={52} cy={52} r={r} fill="none" stroke="#F0F0F0" strokeWidth={8} />
          <circle cx={52} cy={52} r={r} fill="none" stroke={color} strokeWidth={8}
            strokeDasharray={`${(pct / 100) * circ} ${circ}`} strokeLinecap="round"
            transform="rotate(-90 52 52)" style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Grotesk', monospace", color: 'var(--text-primary)' }}>{pct}</span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>wellness</span>
        </div>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: color }}>{label}</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {trend >= 0 ? '+' : ''}{trend.toFixed(2)} vs previous period
        </p>
      </div>
    </div>
  )
}

/* ─── Main page ─────────────────────────────────────────── */

export default function AnalyticsPage() {
  const router = useRouter()
  const [guardian, setGuardian] = useState('Guardian')
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [trend, setTrend] = useState<TrendResponse | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    if (!token) { router.push('/'); return }
    const gs = localStorage.getItem('prism_guardian')
    if (gs) { try { setGuardian(JSON.parse(gs).full_name || 'Guardian') } catch {} }
    const saved = localStorage.getItem('prism_selected_device')
    if (saved) setDeviceId(saved)

    const loadDevices = async () => {
      try {
        const res = await authFetch(`/auth/devices`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const list = await res.json()
          setDevices(list.map((d: any) => ({
            id: d.id, name: d.name, platform: d.platform,
            last_seen: d.last_seen, risk_score: d.risk_score ?? 0,
            risk_label: d.risk_label || 'Normal Range',
          })))
          if (!saved && list.length > 0) setDeviceId(list[0].id)
        }
      } catch {}
    }
    loadDevices()
  }, [router])

  useEffect(() => {
    if (!deviceId) { setLoading(false); return }
    const token = localStorage.getItem('prism_token')
    if (!token) return
    setLoading(true)
    setError(null)

    const loadAll = async () => {
      const headers = { Authorization: `Bearer ${token}` }
      try {
        const [tRes, aRes, cRes] = await Promise.all([
          fetch(`${API}/events/trends/${deviceId}?granularity=${granularity}`, { headers }),
          fetch(`${API}/events/alerts/${deviceId}`, { headers }),
          fetch(`${API}/events/chat/history`, { headers }),
        ])
        if (tRes.ok) setTrend(await tRes.json())
        if (aRes.ok) {
          const data = await aRes.json()
          if (Array.isArray(data)) setAlerts(data)
        }
        if (cRes.ok) {
          const data = await cRes.json()
          if (Array.isArray(data)) {
            setChatTurns(data.map((m: any) => ({
              role: m.sender === 'aria' ? 'assistant' : 'user',
              utterance: m.aria_utterance,
              timestamp: m.timestamp,
            })))
          }
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load analytics')
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [deviceId, granularity])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatTurns])

  const latestWellness = trend?.points?.length ? trend.points[trend.points.length - 1].wellness : 0
  const avgStress = trend?.points?.length
    ? trend.points.reduce((a, p) => a + (p.scores.stress ?? 0), 0) / trend.points.length
    : 0
  const avgFatigue = trend?.points?.length
    ? trend.points.reduce((a, p) => a + (p.scores.typing_fatigue ?? 0), 0) / trend.points.length
    : 0

  const sevColor = (s: string) => s === 'red' ? '#EF4444' : s === 'amber' ? '#F59E0B' : '#10B981'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 24px 56px' }}>
        {/* Header */}
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => router.push('/overview')} className="btn-ghost" style={{ padding: 10 }}>
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Long-Term Analytics</h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                Behavioural trends · alerts · sources · notes — {guardian}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select
              value={deviceId ?? ''}
              onChange={e => { const v = e.target.value; setDeviceId(v || null); if (v) localStorage.setItem('prism_selected_device', v) }}
              className="prism-input" style={{ width: 200, padding: '9px 12px' }}
            >
              <option value="">Select device</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <span className="badge" style={{ background: 'rgba(16,185,129,0.1)', color: '#16A34A', gap: 6 }}>
              <ShieldCheck size={13} /> Metadata only
            </span>
          </div>
        </header>

        {error && (
          <div className="card" style={{ padding: 20, borderRadius: 16, marginBottom: 20, color: '#EF4444', fontSize: 14 }}>
            ⚠️ {error} — check that the API is running on localhost:8000.
          </div>
        )}

        {!deviceId ? (
          <div className="card" style={{ padding: 56, textAlign: 'center', borderRadius: 20 }}>
            <p style={{ margin: 0, fontSize: 30 }}>📊</p>
            <p style={{ margin: '12px 0 0', fontWeight: 700 }}>Select a device to view analytics</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Long-term behavioural tracking requires a paired child device.
            </p>
          </div>
        ) : loading ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', borderRadius: 20 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading analytics…</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div className="card" style={{ padding: 20, borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(11,112,209,0.08)', display: 'grid', placeItems: 'center' }}>
                    <HeartPulse size={16} color="#0B70D1" />
                  </div>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Current wellness</span>
                </div>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 800, fontFamily: "'Space Grotesk', monospace" }}>
                  {Math.round(latestWellness * 100)}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>%</span>
                </p>
              </div>
              <div className="card" style={{ padding: 20, borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(239,68,68,0.08)', display: 'grid', placeItems: 'center' }}>
                    <Activity size={16} color="#EF4444" />
                  </div>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Avg stress</span>
                </div>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 800, fontFamily: "'Space Grotesk', monospace" }}>
                  {Math.round(avgStress * 100)}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>%</span>
                </p>
              </div>
              <div className="card" style={{ padding: 20, borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(139,92,246,0.08)', display: 'grid', placeItems: 'center' }}>
                    <TrendingUp size={16} color="#8B5CF6" />
                  </div>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Avg fatigue</span>
                </div>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 800, fontFamily: "'Space Grotesk', monospace" }}>
                  {Math.round(avgFatigue * 100)}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>%</span>
                </p>
              </div>
              <div className="card" style={{ padding: 20, borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(245,158,11,0.08)', display: 'grid', placeItems: 'center' }}>
                    <AlertTriangle size={16} color="#F59E0B" />
                  </div>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Alerts</span>
                </div>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 800, fontFamily: "'Space Grotesk', monospace" }}>
                  {alerts.length}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}> total</span>
                </p>
              </div>
            </div>

            {/* Risk meter + trend chart */}
            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, marginBottom: 20 }}>
              <div className="card" style={{ padding: 22, borderRadius: 16 }}>
                <p style={{ margin: '0 0 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Risk meter</p>
                <RiskMeter wellness={latestWellness} trend={trend?.trend ?? 0} />
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    Composite of stress, cognitive load, fatigue, and typing stability — a screening signal, never a diagnosis.
                  </p>
                </div>
              </div>

              <div className="card" style={{ padding: 22, borderRadius: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
                    Mental wellness trend
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['daily', 'weekly', 'monthly'] as const).map(g => (
                      <button key={g} onClick={() => setGranularity(g)}
                        style={{
                          padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                          border: `1.5px solid ${granularity === g ? 'var(--text-primary)' : 'var(--border)'}`,
                          background: granularity === g ? 'var(--accent)' : 'transparent',
                          color: granularity === g ? 'var(--accent-text)' : 'var(--text-secondary)',
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                        {g[0].toUpperCase() + g.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {trend && trend.points.length > 0 ? (
                  <>
                    <LineChart data={trend.points} />
                    <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span style={{ width: 16, height: 2.5, background: '#0A0A0A', borderRadius: 2 }} /> Wellness
                      </span>
                      {Object.entries(DIM_COLORS).map(([dim, color]) => (
                        <span key={dim} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
                          <span style={{ width: 12, height: 0, borderTop: `2px dashed ${color}` }} /> {DIM_LABELS[dim]}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                    No trend data yet — run the worker aggregation or wait for more telemetry.
                  </p>
                )}
              </div>
            </div>

            {/* Timeline + conversation */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {/* Alert timeline */}
              <div className="card" style={{ padding: 22, borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Calendar size={16} color="#0B70D1" />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Alert timeline</p>
                </div>
                {alerts.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>No alerts in this period.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {alerts.slice(0, 8).map((a, i) => (
                      <div key={a.id} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: 14 }}>
                        {i < Math.min(8, alerts.length) - 1 && (
                          <div style={{ position: 'absolute', left: 4, top: 12, bottom: 0, width: 2, background: 'var(--border)' }} />
                        )}
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: sevColor(a.severity_tier), marginTop: 4, flexShrink: 0, zIndex: 1 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{a.plain_language_summary}</span>
                            <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>
                              {new Date(a.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, border: `1px solid ${sevColor(a.severity_tier)}`, color: sevColor(a.severity_tier), fontWeight: 700 }}>
                              ● {a.severity_tier === 'red' ? 'High' : a.severity_tier === 'amber' ? 'Moderate' : 'Low'}
                            </span>
                            {a.contributing_factors.slice(0, 1).map((f, j) => (
                              <span key={j} style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{f}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Conversation history */}
              <div className="card" style={{ padding: 22, borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <MessageSquare size={16} color="#8B5CF6" />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Conversation history</p>
                </div>
                {chatTurns.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                    No assistant conversations yet — open the Health Coach or Companion to start.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
                    {chatTurns.slice(-10).map((t, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: t.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
                          background: t.role === 'user' ? 'var(--accent)' : 'var(--bg-main)',
                          color: t.role === 'user' ? 'var(--accent-text)' : 'var(--text-primary)',
                          border: t.role === 'user' ? 'none' : '1px solid var(--border)',
                          fontSize: 12.5, lineHeight: 1.6,
                        }}>
                          {t.utterance}
                          <div style={{ marginTop: 4, fontSize: 10, color: t.role === 'user' ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)' }}>
                            {t.timestamp ? new Date(t.timestamp).toLocaleString() : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sources + notes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Retrieved sources */}
              <div className="card" style={{ padding: 22, borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <BookOpen size={16} color="#0B70D1" />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Retrieved sources</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {chatTurns.flatMap(t => t.evidence ?? []).slice(0, 5).map((e, i) => (
                    <button key={i} onClick={() => setPdfUrl(`/medical/${e.source}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                        borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-main)',
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e2 => (e2.currentTarget as HTMLElement).style.borderColor = 'var(--text-primary)'}
                      onMouseLeave={e2 => (e2.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
                    >
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(11,112,209,0.08)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <FileText size={15} color="#0B70D1" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.source} · page {e.page}
                        </p>
                        <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.chunk}
                        </p>
                      </div>
                      <ChevronRight size={14} color="var(--text-muted)" />
                    </button>
                  ))}
                  {chatTurns.flatMap(t => t.evidence ?? []).length === 0 && (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                      Sources from medical RAG answers will appear here.
                    </p>
                  )}
                </div>
              </div>

              {/* Doctor notes */}
              <div className="card" style={{ padding: 22, borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Stethoscope size={16} color="#10B981" />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Doctor notes</p>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                  Clinical notes and consultation summaries will be attached here by authorized
                  clinicians. PRISM never stores message content — only the screening signals and
                  alert summaries above.
                </p>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  <Info size={13} /> Field reserved for the clinician role (RBAC).
                </div>
              </div>
            </div>

            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* PDF viewer modal */}
      {pdfUrl && (
        <div onClick={() => setPdfUrl(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(900px, 100%)', height: '80vh', background: '#fff', borderRadius: 16,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #E5E5EA' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0A0A0A', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={15} color="#0B70D1" /> {pdfUrl.split('/').pop()}
              </span>
              <button onClick={() => setPdfUrl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0A0A0A', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, background: '#F5F5F5', display: 'grid', placeItems: 'center' }}>
              <p style={{ fontSize: 14, color: '#8E8E93', maxWidth: 420, textAlign: 'center', lineHeight: 1.7 }}>
                PDF preview: <b>{pdfUrl.split('/').pop()}</b>
                <br /><br />
                Medical knowledge-base documents are served from the admin-uploaded library.
                (Native PDF rendering requires the file to exist under the API&apos;s KB directory.)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
