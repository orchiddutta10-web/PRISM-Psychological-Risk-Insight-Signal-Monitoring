'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3, Bell, ShieldCheck, MapPin, Keyboard, Smartphone, Activity, Radio } from 'lucide-react'
import {
  apiFetchSafe,
  type ChildDevice, type RiskScore, type BaselineMap, type IngestionHealth,
} from '../../lib/api'

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
    if (!devices.length) { setRows([]); setLoading(false); return }
    const selected = localStorage.getItem('prism_selected_device')
    const device = devices.find(d => d.id === selected) ?? devices[0]
    setDeviceName(device.name)

    const [baselines, scores, health] = await Promise.all([
      apiFetchSafe<BaselineMap>(`/events/baselines/${device.id}`, token, {}),
      apiFetchSafe<RiskScore[]>(`/events/scores/${device.id}`, token, []),
      apiFetchSafe<IngestionHealth>('/internal/ingestion/health', token, null as any),
    ])

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
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 24 }}>
          <div>
            <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, color: 'var(--text-muted)' }}>Signals</p>
            <h1 style={{ margin: '10px 0 0', fontSize: 32, lineHeight: 1.1 }}>Telemetry signal overview</h1>
            {deviceName && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Device: {deviceName}</p>}
          </div>
          <div style={{ textAlign: 'right', minWidth: 160 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Guardian</p>
            <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 700 }}>{guardian}</p>
          </div>
        </header>

        <button type="button" onClick={() => router.push('/overview')} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <ArrowLeft className="h-4 w-4" /> Back to Overview
        </button>

        {loading ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading real telemetry signals…</div>
        ) : rows.length === 0 ? (
          <div className="card" style={{ padding: 48, borderRadius: 24, textAlign: 'center' }}>
            <BarChart3 size={28} color="var(--text-muted)" style={{ marginBottom: 14 }} />
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>No device paired yet</h2>
            <p style={{ margin: '0 auto', fontSize: 14, color: 'var(--text-secondary)', maxWidth: 520, lineHeight: 1.7 }}>
              Signal cards populate from real baseline profiles and model scores once a device is registered and telemetry begins flowing.
            </p>
          </div>
        ) : (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {rows.map(row => {
              const Icon = row.icon
              const hasBaseline = row.baselineMean !== null
              const statusLabel = row.flagged
                ? '⚑ Deviation flagged'
                : hasBaseline
                  ? '✓ Within baseline'
                  : 'Awaiting baseline'
              const statusColor = row.flagged ? '#F59E0B' : hasBaseline ? '#16A34A' : 'var(--text-muted)'
              return (
                <div key={row.key} className="card" style={{ padding: 24, minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 12, color: 'var(--text-muted)' }}>{row.label}</p>
                      <Icon size={16} color="var(--text-muted)" />
                    </div>
                    {hasBaseline ? (
                      <p style={{ margin: '18px 0 0', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {fmtMean(row.baselineMean!)}
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>{row.unit}</span>
                      </p>
                    ) : (
                      <p style={{ margin: '18px 0 0', fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        No rolling baseline yet — worker aggregation pending.
                      </p>
                    )}
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Space Grotesk', monospace" }}>
                      {row.variance !== null && <>σ² {row.variance < 1 ? row.variance.toFixed(3) : row.variance.toFixed(1)} · </>}
                      {row.latestScore !== null ? `score ${(row.latestScore * 100).toFixed(0)}/100` : 'no score stored'}
                      {' · '}{row.stream}
                    </p>
                    {row.factor && (
                      <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>⚑ {row.factor}</p>
                    )}
                  </div>
                  <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderRadius: 14, background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Status</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>{statusLabel}</span>
                  </div>
                </div>
              )
            })}
          </section>
        )}

        <section className="card" style={{ marginTop: 32, padding: 24, display: 'flex', gap: 20, alignItems: 'flex-start', borderRadius: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(59,130,246,0.1)', display: 'grid', placeItems: 'center' }}>
            <Bell size={24} color='#0B70D1' />
          </div>
          <div>
            <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, color: 'var(--text-muted)' }}>How this page works</p>
            <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              Every card above is read live from the backend: rolling baselines from <code>GET /events/baselines</code>,
              model outputs from <code>GET /events/scores</code>, and stream status from <code>GET /api/internal/ingestion/health</code>.
              No values are hardcoded — when deviations are flagged, they link through to the Alerts tab with contributing factors.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
