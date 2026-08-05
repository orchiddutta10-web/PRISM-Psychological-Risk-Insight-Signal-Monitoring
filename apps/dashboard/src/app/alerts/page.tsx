'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck, ArrowLeft, Inbox, ShieldAlert, Bell,
  AlertTriangle, CheckCircle, Info, RefreshCw,
} from 'lucide-react'
import {
  apiFetchSafe, timeAgo, severityOf,
  type ChildDevice, type BackendAlert,
} from '../../lib/api'

interface AlertRow {
  id: string
  device: string
  severity: 'high' | 'medium' | 'low'
  tier: string
  summary: string
  factors: string[]
  time: string
  read: boolean
}

const SEV_STYLE: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  high: { label: 'Urgent', color: '#DC2626', bg: 'rgba(220,38,38,0.08)', icon: <AlertTriangle size={16} color="#DC2626" /> },
  medium: { label: 'Moderate', color: '#D97706', bg: 'rgba(217,119,6,0.08)', icon: <Info size={16} color="#D97706" /> },
  low: { label: 'Notice', color: '#6B7280', bg: 'rgba(107,114,128,0.08)', icon: <CheckCircle size={16} color="#6B7280" /> },
}

export default function AlertsPage() {
  const router = useRouter()
  const [guardianName, setGuardianName] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = useCallback(async (tk: string) => {
    const devices = await apiFetchSafe<ChildDevice[]>('/auth/devices', tk, [])
    const nameOf: Record<string, string> = Object.fromEntries(devices.map(d => [d.id, d.name]))
    const lists = await Promise.all(
      devices.map(d => apiFetchSafe<BackendAlert[]>(`/events/alerts/${d.id}`, tk, []))
    )
    const rows: AlertRow[] = lists
      .flatMap(list => list.map(a => ({
        id: a.id,
        device: nameOf[a.device_id] ?? 'Device',
        severity: severityOf(a.severity_tier),
        tier: a.severity_tier,
        summary: a.plain_language_summary,
        factors: a.contributing_factors ?? [],
        time: timeAgo(a.timestamp),
        read: a.is_viewed,
      })))
      .sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1))
    setAlerts(rows)
    setLastRefresh(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    const tk = localStorage.getItem('prism_token')
    const guardianStr = localStorage.getItem('prism_guardian')
    if (!tk || !guardianStr) { router.push('/'); return }
    try { setGuardianName(JSON.parse(guardianStr).full_name || 'Guardian') } catch {}
    setToken(tk)
    load(tk)
    const iv = setInterval(() => load(tk), 30000)
    return () => clearInterval(iv)
  }, [router, load])

  const acknowledge = async (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a))
    if (token) await apiFetchSafe(`/events/alerts/viewed/${id}`, token, null as any, { method: 'POST' })
  }

  const unread = alerts.filter(a => !a.read).length
  const visible = filter === 'unread' ? alerts.filter(a => !a.read) : alerts

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
          </div>
        </header>

        <button type="button" onClick={() => router.push('/overview')} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <ArrowLeft className="h-4 w-4" /> Back to Overview
        </button>

        {/* Toolbar */}
        <div className="card" style={{ padding: '14px 20px', marginBottom: 20, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Bell size={16} color="var(--text-muted)" />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{unread} unread</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>· {alerts.length} total</span>
          <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
            {(['all', 'unread'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: filter === f ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                background: filter === f ? 'var(--gray-200)' : 'transparent', color: 'var(--text-primary)',
              }}>
                {f === 'all' ? 'All' : 'Unread'}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {lastRefresh && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Refreshed {lastRefresh.toLocaleTimeString()}</span>}
          <button onClick={() => token && load(token)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
            background: 'var(--gray-200)', border: '1px solid var(--border)', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
          }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading alerts…</div>
        ) : visible.length === 0 ? (
          <div className="card" style={{ padding: 48, borderRadius: 24, textAlign: 'center' }}>
            <div style={{ width: 58, height: 58, borderRadius: 18, background: 'rgba(16,185,129,0.1)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <Inbox className="h-6 w-6" color="#10B981" strokeWidth={2} />
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>
              {filter === 'unread' ? 'No unread alerts' : 'Alert inbox empty'}
            </h2>
            <p style={{ margin: '0 auto', fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', maxWidth: 560 }}>
              The risk engine has not flagged any behavioral deviations. Alerts appear here in real time
              when telemetry crosses baseline thresholds — always with human-readable contributing factors.
            </p>
            <div style={{ marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 14, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
              <ShieldAlert size={15} color="#0B70D1" />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Tip: use the Demo Scenarios on the Overview page to fire the real risk engine and watch alerts land here.
              </span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visible.map(a => {
              const sev = SEV_STYLE[a.severity]
              return (
                <div key={a.id} className="card" style={{
                  padding: '20px 24px', borderRadius: 18,
                  borderLeft: `4px solid ${sev.color}`,
                  opacity: a.read ? 0.75 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: sev.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        {sev.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 12, background: sev.bg, color: sev.color }}>{sev.label}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 10px', borderRadius: 12, border: '1px solid var(--border)' }}>{a.device}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.time}</span>
                          {a.read && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>✓ acknowledged</span>}
                        </div>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{a.summary}</p>
                        {a.factors.length > 0 && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {a.factors.map((f, i) => (
                              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {!a.read && (
                      <button onClick={() => acknowledge(a.id)} style={{
                        padding: '7px 16px', borderRadius: 10, border: '1px solid var(--border)',
                        background: 'var(--bg-card)', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        color: 'var(--text-primary)', flexShrink: 0,
                      }}>
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Privacy footer */}
        <div style={{ marginTop: 28, padding: 16, borderRadius: 14, background: 'var(--gray-100, rgba(0,0,0,0.03))', border: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <ShieldCheck size={16} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            Alerts are non-diagnostic behavioral signals only. They never contain message content, audio, or clinical labels —
            only explainable contributing factors relative to your teen&apos;s own baseline.
          </p>
        </div>
      </div>
    </div>
  )
}
