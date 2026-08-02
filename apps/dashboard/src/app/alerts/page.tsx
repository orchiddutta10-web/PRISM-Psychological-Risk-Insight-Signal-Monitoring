'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, ArrowLeft, Inbox, ShieldAlert, Cpu, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { API } from '@/lib/api'

interface ApiAlert {
  id: string
  device_id: string
  severity_tier: string
  plain_language_summary: string
  contributing_factors: string[]
  is_viewed: boolean
  timestamp: string
}

interface ApiDevice {
  id: string
  name: string
  platform: string
}

const SEV_META: Record<string, { label: string; color: string; bg: string; icon: typeof Info }> = {
  red: { label: 'High', color: '#EF4444', bg: 'rgba(239,68,68,0.1)', icon: AlertTriangle },
  amber: { label: 'Moderate', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', icon: Info },
  sage: { label: 'Low', color: '#10B981', bg: 'rgba(16,185,129,0.1)', icon: CheckCircle2 },
}

export default function AlertsPage() {
  const router = useRouter()
  const [guardianName, setGuardianName] = useState('')
  const [alerts, setAlerts] = useState<ApiAlert[]>([])
  const [deviceNames, setDeviceNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAlerts = useCallback(async (token: string) => {
    try {
      // 1. Fetch guardian's devices
      const devRes = await fetch(`${API}/auth/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!devRes.ok) throw new Error(`Devices API returned ${devRes.status}`)
      const devices: ApiDevice[] = await devRes.json()
      const nameMap: Record<string, string> = {}
      devices.forEach(d => { nameMap[d.id] = d.name })

      // 2. Aggregate alerts across all devices
      const all: ApiAlert[] = []
      for (const device of devices) {
        const res = await fetch(`${API}/events/alerts/${device.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) all.push(...data)
        }
      }
      all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setAlerts(all)
      setDeviceNames(nameMap)
    } catch (e: any) {
      setError(e?.message || 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    const guardianStr = localStorage.getItem('prism_guardian')
    if (!token || !guardianStr) {
      router.push('/')
      return
    }
    try { setGuardianName(JSON.parse(guardianStr).full_name || '') } catch {}
    loadAlerts(token)
  }, [router, loadAlerts])

  const markViewed = async (alertId: string) => {
    const token = localStorage.getItem('prism_token')
    if (!token) return
    try {
      await fetch(`${API}/events/alerts/viewed/${alertId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_viewed: true } : a))
    } catch {}
  }

  const unread = alerts.filter(a => !a.is_viewed).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 28 }}>
          <div>
            <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, color: 'var(--text-muted)' }}>Alerts</p>
            <h1 style={{ margin: '10px 0 0', fontSize: 32, lineHeight: 1.1 }}>Guardian alert center</h1>
          </div>
          <div style={{ textAlign: 'right', minWidth: 160 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Welcome,</p>
            <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 700 }}>{guardianName || 'Guardian'}</p>
            {unread > 0 && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#F59E0B', fontWeight: 600 }}>{unread} unread</p>
            )}
          </div>
        </header>

        <button type="button" onClick={() => router.push('/overview')} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <ArrowLeft className="h-4 w-4" /> Back to Overview
        </button>

        {loading ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', borderRadius: 24 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading alerts…</p>
          </div>
        ) : error ? (
          <div className="card" style={{ padding: 32, borderRadius: 24, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 15, color: '#EF4444' }}>⚠️ {error}</p>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>Check that the API is running on localhost:8000.</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="card" style={{ padding: 32, borderRadius: 24, boxShadow: '0 35px 100px rgba(15, 23, 42, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 20 }}>
              <div style={{ width: 58, height: 58, borderRadius: 18, background: 'rgba(59,130,246,0.1)', display: 'grid', placeItems: 'center' }}>
                <Inbox className="h-6 w-6" color="#0B70D1" strokeWidth={2} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-muted)' }}>Alert inbox</p>
                <h2 style={{ margin: '10px 0 0', fontSize: 28, fontWeight: 700 }}>Alert Inbox Empty</h2>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)', maxWidth: 760 }}>
              Your teen&apos;s behavioral baseline is currently stable. No alerts or deviations have been flagged.
            </p>
            <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 10, padding: 16, borderRadius: 16, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <CheckCircle2 size={18} color="#10B981" />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Live ingestion is active — alerts will appear here automatically when deviations are detected.
              </span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {alerts.map(a => {
              const meta = SEV_META[a.severity_tier] ?? SEV_META.sage
              const Icon = meta.icon
              return (
                <div
                  key={a.id}
                  onClick={() => { if (!a.is_viewed) markViewed(a.id) }}
                  style={{
                    display: 'flex', gap: 16, alignItems: 'flex-start', padding: 22, borderRadius: 20,
                    background: 'rgba(255,255,255,0.92)', border: `1px solid ${a.is_viewed ? 'var(--border)' : meta.color}33`,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: meta.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon size={20} color={meta.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 12px', borderRadius: 20, background: meta.bg, color: meta.color }}>
                          ● {meta.label}
                        </span>
                        {!a.is_viewed && <span style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B' }}>NEW</span>}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {deviceNames[a.device_id] || a.device_id.slice(0, 8)} · {new Date(a.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {a.plain_language_summary}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(a.contributing_factors || []).map((f, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: meta.color, marginTop: 7, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 32, display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'start', padding: 24, borderRadius: 22, background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 14, background: 'rgba(16,185,129,0.12)', display: 'grid', placeItems: 'center' }}>
              <Cpu className="h-5 w-5" color="#10B981" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-muted)' }}>Phase 1 Integration Active</p>
              <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
                Alerts are generated by the risk engine when telemetry deviates from a teen&apos;s personal baseline. Every alert ships with human-readable contributing factors — never diagnostic labels.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'start', padding: 24, borderRadius: 22, background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 14, background: 'rgba(59,130,246,0.12)', display: 'grid', placeItems: 'center' }}>
              <ShieldAlert className="h-5 w-5" color="#0B70D1" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-muted)' }}>Privacy & Security Disclosures</p>
              <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
                All alerts follow the strict PRISM privacy guidelines. No black-box diagnostic scores or raw communication content will ever be displayed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
