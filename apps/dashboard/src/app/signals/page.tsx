'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3, Bell, ShieldCheck, HeartPulse, Activity, Moon, Smartphone } from 'lucide-react'
import { API } from '@/lib/api'

interface ApiDevice {
  id: string
  name: string
  platform: string
  risk_score: number
  risk_label: string
  latest_alert: { severity_tier: string; summary: string } | null
  consent_count: number
}

interface SignalCard {
  id: string
  label: string
  value: string
  status: 'Normal' | 'Needs review' | 'Attention'
  icon: any
  detail: string
}

const fmtTime = (ts: string) => new Date(ts).toLocaleTimeString()

export default function SignalsPage() {
  const router = useRouter()
  const [guardian, setGuardian] = useState('Guardian')
  const [signals, setSignals] = useState<SignalCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSignals = useCallback(async (token: string) => {
    try {
      const devRes = await fetch(`${API}/auth/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!devRes.ok) throw new Error(`Devices API returned ${devRes.status}`)
      const devices: ApiDevice[] = await devRes.json()

      const cards: SignalCard[] = []

      for (const device of devices) {
        // Baselines
        const baseRes = await fetch(`${API}/events/baselines/${device.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        let baselines: Record<string, { mean: number; variance: number }> = {}
        if (baseRes.ok) baselines = await baseRes.json()

        // Pulse readings (PRISM PULSE ESP32)
        let pulseBpm: number | null = null
        let pulseG: number | null = null
        let pulseAt: string | null = null
        const pulseRes = await fetch(`${API}/physio/pulse/readings/${device.id}?limit=1`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (pulseRes.ok) {
          const data = await pulseRes.json()
          if (Array.isArray(data) && data.length > 0) {
            pulseBpm = data[0].bpm
            pulseG = data[0].g_force
            pulseAt = data[0].timestamp
          }
        }

        const bpm = pulseBpm ?? Math.round(baselines['ppg']?.mean ?? 72)
        const g = pulseG ?? 1.0
        const bpmStatus: SignalCard['status'] =
          pulseBpm !== null && pulseBpm > 110 ? 'Attention' : 'Normal'

        cards.push(
          {
            id: `${device.id}-hr`,
            label: `${device.name} · Heart Rate`,
            value: `${bpm} bpm`,
            status: bpmStatus,
            icon: HeartPulse,
            detail: pulseAt ? `Live · ${fmtTime(pulseAt)}` : 'Baseline estimate',
          },
          {
            id: `${device.id}-move`,
            label: `${device.name} · Movement / G-Force`,
            value: `${g.toFixed(2)} g`,
            status: 'Normal',
            icon: Activity,
            detail: pulseAt ? `Live · ${fmtTime(pulseAt)}` : 'No MPU6050 stream yet',
          },
          {
            id: `${device.id}-consent`,
            label: `${device.name} · Active Consents`,
            value: `${device.consent_count}`,
            status: device.consent_count > 0 ? 'Normal' : 'Attention',
            icon: ShieldCheck,
            detail: device.consent_count > 0 ? 'Consent granted' : 'No consent grants yet',
          },
        )

        if (device.latest_alert) {
          cards.push({
            id: `${device.id}-alert`,
            label: `${device.name} · Latest Signal`,
            value: device.latest_alert.severity_tier.toUpperCase(),
            status: device.latest_alert.severity_tier === 'red' ? 'Attention' : 'Needs review',
            icon: BarChart3,
            detail: device.latest_alert.summary,
          })
        }
      }

      if (cards.length === 0) {
        setSignals([])
      } else {
        setSignals(cards)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load signals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    if (!token) return router.push('/')
    const stored = localStorage.getItem('prism_guardian')
    if (stored) {
      try { setGuardian(JSON.parse(stored).full_name || 'Guardian') } catch {}
    }
    loadSignals(token)
  }, [router, loadSignals])

  const statusColor = (s: SignalCard['status']) =>
    s === 'Normal' ? '#16A34A' : s === 'Needs review' ? '#F59E0B' : '#EF4444'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 24 }}>
          <div>
            <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, color: 'var(--text-muted)' }}>Signals</p>
            <h1 style={{ margin: '10px 0 0', fontSize: 32, lineHeight: 1.1 }}>Telemetry signal overview</h1>
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
          <div className="card" style={{ padding: 48, textAlign: 'center', borderRadius: 24 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading signals…</p>
          </div>
        ) : error ? (
          <div className="card" style={{ padding: 32, borderRadius: 24, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 15, color: '#EF4444' }}>⚠️ {error}</p>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>Check that the API is running on localhost:8000.</p>
          </div>
        ) : signals.length === 0 ? (
          <div className="card" style={{ padding: 48, borderRadius: 24, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 28 }}>📡</p>
            <p style={{ margin: '12px 0 0', fontSize: 15, fontWeight: 700 }}>No signals yet</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Register a device and start ingesting telemetry to see live signals here.
            </p>
          </div>
        ) : (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {signals.map(signal => {
              const Icon = signal.icon
              return (
                <div key={signal.id} className="card" style={{ padding: 24, minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(11,112,209,0.08)', display: 'grid', placeItems: 'center' }}>
                        <Icon size={17} color="#0B70D1" />
                      </div>
                      <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: 'var(--text-muted)' }}>{signal.label}</p>
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{signal.value}</p>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderRadius: 16, background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{signal.detail}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: statusColor(signal.status), whiteSpace: 'nowrap' }}>{signal.status}</span>
                    </div>
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
            <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, color: 'var(--text-muted)' }}>What happens next</p>
            <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              As soon as PRISM detects signal deviations, alerts will populate in the Alerts tab. These alerts are generated from changes in app usage, sleep window, movement, or typing metadata — never message or audio content.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
