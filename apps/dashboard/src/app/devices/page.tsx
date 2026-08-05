'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Cpu, Wifi, Clock, Activity,
  CheckCircle, AlertTriangle, Smartphone, Monitor,
  Signal, Radio,
} from 'lucide-react'
import { useAuth } from '../lib/auth-context'
import { apiFetchSafe, timeAgo, type BackendAlert, type IngestionHealth } from '../../lib/api'

interface DeviceStatus {
  id: string
  name: string
  type: 'esp32' | 'android' | 'rpi'
  label: string
  connected: boolean
  lastSeen: string
  unreadAlerts: number
  latency: number | null
  readingsPerMin: number | null
  firmware: string | null
}

export default function DevicesPage() {
  const router = useRouter()
  const { token, isAuthLoaded, devices } = useAuth()
  const [deviceStatuses, setDeviceStatuses] = useState<DeviceStatus[]>([])
  const [modalities, setModalities] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchStatuses = useCallback(async () => {
    if (!token || !devices.length) {
      if (isAuthLoaded) setLoading(false)
      return
    }
    try {
      // Real per-device alerts (unread count) — one call per device, in parallel
      const alertLists = await Promise.all(
        devices.map(d => apiFetchSafe<BackendAlert[]>(`/events/alerts/${d.id}`, token, []))
      )
      // Real ingestion health for stream status
      const health = await apiFetchSafe<IngestionHealth>('/internal/ingestion/health', token, null as any)
      const mods = health?.active_modalities ?? {}
      setModalities(mods)

      const statuses: DeviceStatus[] = devices.map((d, i) => {
        const online = d.last_seen ? (Date.now() - new Date(d.last_seen).getTime()) < 15 * 60 * 1000 : false
        return {
          id: d.id,
          name: d.name,
          type: 'android',
          label: d.platform === 'ios' ? 'iPhone' : 'Android',
          connected: online,
          lastSeen: d.last_seen ? timeAgo(d.last_seen) : 'Never',
          unreadAlerts: alertLists[i].filter(a => !a.is_viewed).length,
          latency: null,
          readingsPerMin: null,
          firmware: null,
        }
      })

      // PRISM PULSE wearable row — status derived from real ingestion health
      const pulseFlow = mods.pulse === 'real' || mods.pulse === 'synthetic'
      statuses.push({
        id: 'prism-pulse',
        name: 'PRISM PULSE',
        type: 'esp32',
        label: 'ESP32 Wearable',
        connected: mods.pulse === 'real',
        lastSeen: pulseFlow ? `Streaming (${mods.pulse})` : 'No data received',
        unreadAlerts: 0,
        latency: null,
        readingsPerMin: null,
        firmware: null,
      })

      setDeviceStatuses(statuses)
      setLastRefresh(new Date())
    } catch {
      setDeviceStatuses([])
    } finally {
      setLoading(false)
    }
  }, [token, devices, isAuthLoaded])

  useEffect(() => {
    if (!isAuthLoaded) return
    if (!token) { router.push('/'); return }
  }, [isAuthLoaded, token, router])

  useEffect(() => {
    fetchStatuses()
  }, [fetchStatuses])

  useEffect(() => {
    const interval = setInterval(fetchStatuses, 30000)
    return () => clearInterval(interval)
  }, [fetchStatuses])

  const connectedCount = deviceStatuses.filter(d => d.connected).length
  const totalCount = deviceStatuses.length

  const typeIcons: Record<string, any> = {
    esp32: Cpu,
    android: Smartphone,
    rpi: Monitor,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 28 }}>
          <div>
            <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, color: 'var(--text-muted)' }}>Devices</p>
            <h1 style={{ margin: '10px 0 0', fontSize: 32, lineHeight: 1.1 }}>Device Monitoring</h1>
          </div>
          <div style={{ textAlign: 'right', minWidth: 160 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Last refresh</p>
            <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 700 }}>
              {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
        </header>

        <button type="button" onClick={() => router.push('/overview')} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <ArrowLeft size={16} /> Back to Overview
        </button>

        {/* System health bar */}
        <div className="card" style={{ padding: '20px 24px', marginBottom: 24, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: connectedCount === totalCount && totalCount > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
              display: 'grid', placeItems: 'center',
            }}>
              {connectedCount === totalCount && totalCount > 0
                ? <CheckCircle size={22} color="#047857" />
                : <AlertTriangle size={22} color="#92400E" />
              }
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {connectedCount}/{totalCount} devices online
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                {connectedCount === totalCount && totalCount > 0 ? 'All systems operational' : 'Some devices are offline'}
              </p>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <button onClick={fetchStatuses} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
            background: 'var(--gray-200)', border: '1px solid var(--border)', borderRadius: 10,
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          }}>
            <Activity size={14} /> Refresh
          </button>
        </div>

        {/* Loading */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="card" style={{ padding: 24, minHeight: 200 }}>
                <div className="skeleton" style={{ height: 14, width: 100, marginBottom: 18 }} />
                <div className="skeleton" style={{ height: 28, width: 160, marginBottom: 14 }} />
                <div className="skeleton" style={{ height: 14, width: 120 }} />
              </div>
            ))}
          </div>
        ) : deviceStatuses.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <Smartphone size={28} color="var(--text-muted)" style={{ marginBottom: 14 }} />
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>No devices registered</h2>
            <p style={{ margin: '0 auto', fontSize: 14, color: 'var(--text-secondary)', maxWidth: 480, lineHeight: 1.7 }}>
              Devices appear here as soon as the teen&apos;s PRISM app registers under your account.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {deviceStatuses.map(device => {
              const Icon = typeIcons[device.type] || Cpu
              return (
                <div key={device.id} className="card" style={{ padding: 24, borderRadius: 20 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 14,
                        background: device.connected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        display: 'grid', placeItems: 'center',
                      }}>
                        <Icon size={22} color={device.connected ? '#047857' : '#DC2626'} />
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{device.name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{device.label}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: device.connected ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${device.connected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: device.connected ? '#10B981' : '#EF4444',
                        animation: device.connected ? 'pulse 2s infinite' : 'none',
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: device.connected ? '#047857' : '#DC2626' }}>
                        {device.connected ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>

                  {/* Metrics grid — only real values are shown */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Clock size={12} color="var(--text-muted)" />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Last Seen</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{device.lastSeen}</span>
                    </div>

                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <AlertTriangle size={12} color="var(--text-muted)" />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Unread Alerts</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{device.unreadAlerts}</span>
                    </div>
                  </div>

                  {device.type === 'esp32' && (
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Radio size={12} color="var(--text-muted)" />
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          Pulse stream: {modalities.pulse ?? 'inactive'} · PPG: {modalities.ppg ?? 'inactive'} · GSR: {modalities.gsr ?? 'inactive'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p style={{ marginTop: 20, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          All values on this page come from live API responses (registered devices, stored alerts, ingestion health).
          Battery, signal strength, and latency are intentionally omitted — the backend does not collect them, so no fake numbers are shown.
        </p>
      </div>
    </div>
  )
}
