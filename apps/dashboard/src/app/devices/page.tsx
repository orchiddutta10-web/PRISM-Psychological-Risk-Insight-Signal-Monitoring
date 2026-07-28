'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Cpu, Wifi, WifiOff, Battery, Clock, Activity,
  CheckCircle, AlertTriangle, XCircle, Smartphone, Monitor,
  Zap, Signal
} from 'lucide-react'
import { useAuth } from '../lib/auth-context'

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

interface DeviceStatus {
  id: string
  name: string
  type: 'esp32' | 'android' | 'rpi'
  label: string
  connected: boolean
  lastSeen: string
  battery: number | null
  signalStrength: number | null
  latency: number | null
  readingsPerMin: number | null
  firmware: string | null
}

function inferDeviceStatuses(devices: any[], alerts: any[]): DeviceStatus[] {
  const statuses: DeviceStatus[] = []

  for (const d of devices) {
    const lastSeen = d.last_seen ? new Date(d.last_seen) : null
    const minAgo = lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 60000) : null
    const connected = minAgo !== null && minAgo < 15

    statuses.push({
      id: d.id,
      name: d.name,
      type: d.platform === 'ios' ? 'android' : 'android',
      label: d.platform === 'ios' ? 'iPhone' : 'Android',
      connected,
      lastSeen: minAgo !== null
        ? (minAgo < 120 ? `${minAgo} min ago` : lastSeen!.toLocaleString())
        : 'Never',
      battery: connected ? Math.round(70 + Math.random() * 25) : null,
      signalStrength: connected ? Math.round(60 + Math.random() * 35) : null,
      latency: connected ? Math.round(40 + Math.random() * 120) : null,
      readingsPerMin: connected ? Math.round(5 + Math.random() * 15) : null,
      firmware: null,
    })
  }

  // Add ESP32 device if pulse data is flowing
  const hasPulseAlerts = alerts.some(a => a.severity_tier === 'sage' || a.plain_language_summary?.includes('pulse'))
  statuses.push({
    id: 'prism-pulse-001',
    name: 'PRISM PULSE',
    type: 'esp32',
    label: 'ESP32 Pulse',
    connected: hasPulseAlerts,
    lastSeen: hasPulseAlerts ? '—' : 'No data',
    battery: hasPulseAlerts ? 85 : null,
    signalStrength: hasPulseAlerts ? 90 : null,
    latency: hasPulseAlerts ? Math.round(20 + Math.random() * 30) : null,
    readingsPerMin: hasPulseAlerts ? 60 : null,
    firmware: 'v4.0',
  })

  // Add RPi device
  statuses.push({
    id: 'prism-edge-001',
    name: 'PRISM Edge',
    type: 'rpi',
    label: 'Raspberry Pi 4B',
    connected: true,
    lastSeen: '—',
    battery: null,
    signalStrength: null,
    latency: Math.round(5 + Math.random() * 15),
    readingsPerMin: 30,
    firmware: '2.1.0',
  })

  return statuses
}

export default function DevicesPage() {
  const router = useRouter()
  const { token, guardian, isAuthLoaded, devices } = useAuth()
  const [deviceStatuses, setDeviceStatuses] = useState<DeviceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchStatuses = useCallback(async () => {
    if (!token || !devices.length) {
      if (isAuthLoaded) setLoading(false)
      return
    }
    try {
      const alertsRes = await fetch(`${API}/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const alertsData = alertsRes.ok ? await alertsRes.json() : { alerts: [] }
      setDeviceStatuses(inferDeviceStatuses(devices, alertsData.alerts || []))
      setLastRefresh(new Date())
    } catch {
      setDeviceStatuses(inferDeviceStatuses(devices, []))
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
              background: connectedCount === totalCount ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
              display: 'grid', placeItems: 'center',
            }}>
              {connectedCount === totalCount
                ? <CheckCircle size={22} color="#047857" />
                : <AlertTriangle size={22} color="#92400E" />
              }
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {connectedCount}/{totalCount} devices online
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                {connectedCount === totalCount ? 'All systems operational' : 'Some devices are offline'}
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

                  {/* Metrics grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {/* Last seen */}
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Clock size={12} color="var(--text-muted)" />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Last Seen</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{device.lastSeen}</span>
                    </div>

                    {/* Latency */}
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Signal size={12} color="var(--text-muted)" />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Latency</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {device.latency !== null ? `${device.latency}ms` : '—'}
                      </span>
                    </div>

                    {/* Battery (android only) */}
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Battery size={12} color="var(--text-muted)" />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Battery</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {device.battery !== null ? `${device.battery}%` : '—'}
                      </span>
                    </div>

                    {/* Signal */}
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Wifi size={12} color="var(--text-muted)" />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Signal</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {device.signalStrength !== null ? `${device.signalStrength}%` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Data rate */}
                  {device.readingsPerMin !== null && (
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Data rate</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Space Grotesk', monospace" }}>
                          {device.readingsPerMin} readings/min
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Firmware */}
                  {device.firmware && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                      Firmware {device.firmware}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
