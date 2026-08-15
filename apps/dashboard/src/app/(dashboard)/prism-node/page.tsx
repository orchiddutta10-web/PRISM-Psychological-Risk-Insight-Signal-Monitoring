'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { API, authFetch } from '@/lib/api'

// PRISM Node — Physiological Wearable Monitor (v4.0 Multi-Factor Edition)
// Hardware: ESP32 + Analog Pulse Sensor (GPIO34) + MPU6050 (I2C) + ISD1820 + I2C LCD
// This surface is intentionally isolated — no imports from the behavior dashboard.

type Tab = 'vitals' | 'sleep' | 'status' | 'about' | 'camera'

interface PulseReading {
  id: string
  subject_id: string
  ts_ms: number
  pulse_raw: number
  bpm: number
  g_force: number
  alert_status: string
  timestamp: string
}

interface PhysioReading {
  id: string
  subject_id: string
  sensor_type: string
  value: number
  variance: number
  timestamp: string
}

interface SleepWindow {
  id: string
  subject_id: string
  estimated_start: string
  estimated_end: string
  confidence: number
}

interface NodeStatus {
  connected: boolean
  last_seen: string | null
  sensor: string | null
}

function Sparkline({
  data,
  color,
  height = 60,
}: {
  data: number[]
  color: string
  height?: number
}) {
  if (!data.length) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100
      const y = height - ((v - min) / range) * (height - 8) - 4
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 100 ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
      />
    </svg>
  )
}

function sleepLabel(hours: number): { label: string; color: string } {
  if (hours >= 7) return { label: 'Good night', color: '#10b981' }
  if (hours >= 6) return { label: 'Moderate night', color: '#f59e0b' }
  if (hours >= 5) return { label: 'Short night', color: '#f97316' }
  return { label: 'Fragmented sleep', color: '#ef4444' }
}

function alertBadge(status: string) {
  if (status === 'OK') return { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', color: '#6ee7b7', text: '✓ NORMAL' }
  if (status.startsWith('WARNING')) return { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', color: '#fbbf24', text: '⚠ ' + status }
  return { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', color: '#fca5a5', text: '🔴 ' + status }
}

export default function PrismNodePage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('vitals')
  const [token, setToken] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [pulseReadings, setPulseReadings] = useState<PulseReading[]>([])
  const [ppgReadings, setPpgReadings] = useState<PhysioReading[]>([])
  const [sleepWindows, setSleepWindows] = useState<SleepWindow[]>([])
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>({ connected: false, last_seen: null, sensor: null })
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [devicesAvailable, setDevicesAvailable] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => {
    const tk = localStorage.getItem('prism_token')
    if (!tk) {
      router.push('/')
      setIsLoading(false)
      return
    }
    setToken(tk)

    const loadDevices = async () => {
      try {
        const response = await authFetch('/auth/devices', {
          headers: { Authorization: `Bearer ${tk}` },
          cache: 'no-store',
        })
        if (!response.ok) {
          setDevicesAvailable(false)
          setPageError(
            response.status === 401
              ? 'Your session has expired. Please sign in again.'
              : 'PRISM Node could not load your devices. Check that the API is running.',
          )
          return
        }

        const devices = (await response.json()) as Array<{ id: string; name?: string }>
        if (!Array.isArray(devices)) {
          throw new Error('Invalid device response')
        }

        setDevicesAvailable(devices.length > 0)
        if (devices.length > 0) {
          const saved = localStorage.getItem('prism_selected_device')
          const match = devices.find(d => d.id === saved)
          const selected = match ?? devices[0]
          localStorage.setItem('prism_selected_device', selected.id)
          setDeviceId(selected.id)
          setDeviceName(selected.name ?? null)
        }
      } catch {
        setDevicesAvailable(false)
        setPageError('PRISM Node could not connect to the API. Check that localhost:8000 is running.')
      } finally {
        setIsLoading(false)
      }
    }

    void loadDevices()
  }, [router])

  const fetchVitals = useCallback(async (tk: string, did: string) => {
    try {
      const headers = { Authorization: `Bearer ${tk}` }
      const [pulseRes, ppgRes] = await Promise.all([
        authFetch(`/physio/pulse/readings/${did}?limit=60&_t=${Date.now()}`, { headers, cache: 'no-store' }),
        authFetch(`/physio/readings/${did}?sensor_type=ppg&limit=60&_t=${Date.now()}`, { headers, cache: 'no-store' }),
      ])

      let pulseData: PulseReading[] = []
      let ppgData: PhysioReading[] = []

      if (pulseRes.ok) {
        const data = await pulseRes.json()
        if (!Array.isArray(data)) throw new Error('Invalid pulse response')
        pulseData = data
      } else if (pulseRes.status === 403) {
        const fallback = await pickOwnedDeviceId(tk)
        if (fallback) {
          setDeviceId(fallback.id)
          setDeviceName(fallback.name ?? null)
        }
      } else {
        throw new Error(`Pulse request failed: ${pulseRes.status}`)
      }

      if (ppgRes.ok) {
        const data = await ppgRes.json()
        if (!Array.isArray(data)) throw new Error('Invalid PPG response')
        ppgData = data
      }

      setPulseReadings([...pulseData].reverse())
      setPpgReadings([...ppgData].reverse())
      setIsDemoMode(false)
      setPageError(null)
    } catch {
      setPageError('PRISM Node telemetry is unavailable. Check the API or device connection.')
    }
    setLastRefresh(new Date())
  }, [])

  const fetchSleep = useCallback(async (tk: string, did: string) => {
    try {
      const res = await authFetch(`/physio/sleep/${did}?limit=30&_t=${Date.now()}`, { headers: { Authorization: `Bearer ${tk}` }, cache: 'no-store' })
      if (!res.ok) {
        setSleepWindows([])
        return
      }
      const data = await res.json()
      setSleepWindows(Array.isArray(data) ? data : [])
    } catch {
      setSleepWindows([])
    }
  }, [])

  const fetchStatus = useCallback(async (tk: string, did: string) => {
    try {
      const res = await authFetch(`/physio/status/${did}?_t=${Date.now()}`, { headers: { Authorization: `Bearer ${tk}` }, cache: 'no-store' })
      if (!res.ok) {
        setNodeStatus({ connected: false, last_seen: null, sensor: null })
        return
      }
      setNodeStatus(await res.json())
    } catch {
      setNodeStatus({ connected: false, last_seen: null, sensor: null })
    }
  }, [])

  useEffect(() => {
    if (!token || !deviceId) return
    const load = async () => {
      setIsLoading(true)
      await Promise.all([fetchVitals(token, deviceId), fetchSleep(token, deviceId), fetchStatus(token, deviceId)])
      setIsLoading(false)
    }
    load()
    const iv = setInterval(() => { fetchVitals(token, deviceId); fetchStatus(token, deviceId) }, 5000)
    return () => clearInterval(iv)
  }, [token, deviceId, fetchVitals, fetchSleep, fetchStatus])

  /**
   * If the dashboard has a stale device id (e.g. user switched accounts,
   * a device was deleted, or the token belongs to a different guardian)
   * the API returns 403. Pick the first device owned by the current
   * guardian and switch to it transparently.
   */
  async function pickOwnedDeviceId(tk: string): Promise<{ id: string; name?: string } | null> {
    try {
      const res = await fetch(`${API}/auth/devices`, { headers: { Authorization: `Bearer ${tk}` }, cache: 'no-store' })
      if (!res.ok) return null
      const list = (await res.json()) as Array<{ id: string; name?: string }>
      if (!list.length) return null
      const first = list[0]
      localStorage.setItem('prism_selected_device', first.id)
      return first
    } catch {
      return null
    }
  }

  // Only label a reading live when it arrived during the polling window.
  const latestPulse = pulseReadings.length ? pulseReadings[pulseReadings.length - 1] : null
  const latestPulseFresh = latestPulse
    ? Date.now() - new Date(latestPulse.timestamp).getTime() <= 15000
    : false
  const currentPulse = latestPulse
  const currentBPM = currentPulse ? currentPulse.bpm.toFixed(0) : '—'
  const currentGForce = currentPulse ? currentPulse.g_force.toFixed(2) : '—'
  const currentAlert = currentPulse ? currentPulse.alert_status : 'OK'
  const alertInfo = alertBadge(currentAlert)

  // Count active alerts in last 60 readings
  const alertCount = pulseReadings.filter(r => r.alert_status !== 'OK').length

  const TABS: { id: Tab; label: string }[] = [
    { id: 'vitals', label: '❤️  Live Vitals' },
    { id: 'camera', label: '📷  Camera' },
    { id: 'sleep', label: '🌙  Sleep Windows' },
    { id: 'status', label: '📡  Device Status' },
    { id: 'about', label: 'ℹ️  About' },
  ]

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* moved nodePulse keyframe to globals.css */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', margin: '0 auto 16px', animation: 'nodePulse 1.5s ease-in-out infinite' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Connecting to PRISM Node…</p>
        </div>
      </div>
    )
  }

  if (pageError && !deviceId) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>
        <header style={{ borderBottom: '1px solid var(--border)', padding: '16px 24px', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 40 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => router.push('/overview')} style={{ color: 'var(--text-secondary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Dashboard
            </button>
            <span style={{ color: 'var(--border)', opacity: 0.5 }}>|</span>
            <span style={{ fontWeight: 800, fontSize: 16 }}>PRISM Node</span>
          </div>
        </header>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', margin: '0 auto 24px', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>⚠️</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>PRISM Node is unavailable</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>{pageError}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Try Again
          </button>
        </main>
      </div>
    )
  }

  // Render an empty-state when the guardian has no devices at all.
  if (!devicesAvailable) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>
        <header style={{ borderBottom: '1px solid var(--border)', padding: '16px 24px', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 40 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button onClick={() => router.push('/overview')} style={{ color: 'var(--text-secondary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Dashboard
              </button>
              <span style={{ color: 'var(--border)', opacity: 0.5 }}>|</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', flexShrink: 0 }} />
                <div>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>PRISM Node</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginTop: -2 }}>Multi-Factor Physiological Monitor (v4.0)</span>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', margin: '0 auto 24px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>📡</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>No PRISM Node devices yet</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
            Register a PRISM PULSE ESP32 wearable to see live heart rate, G-force, and sleep windows here. Devices registered under your guardian account will appear automatically once telemetry starts flowing.
          </p>
          <button
            onClick={() => router.push('/devices')}
            style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Go to Devices &amp; Identity →
          </button>
        </main>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>
      {/* moved node/animation keyframes to globals.css */}

      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--border)', padding: '16px 24px', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              id="btn-back-to-dashboard"
              onClick={() => router.push('/overview')}
              style={{ color: 'var(--text-secondary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Dashboard
            </button>
            <span style={{ color: 'var(--border)', opacity: 0.5 }}>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', animation: 'nodePulse 3s ease-in-out infinite', flexShrink: 0 }} />
              <div>
                <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>PRISM Node</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginTop: -2 }}>
                  {deviceName ? `${deviceName} • ` : ''}Multi-Factor Physiological Monitor (v4.0)
                </span>
              </div>
            </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isDemoMode && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', letterSpacing: '0.05em' }}>
                ✦ SYNTHETIC DEMO MODE
              </span>
            )}
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: alertInfo.bg, border: `1px solid ${alertInfo.border}`, color: alertInfo.color, fontWeight: 700 }}>
              {alertInfo.text}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Refreshed {lastRefresh.toLocaleTimeString()}</span>
          </div>
        </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {/* Tab Bar */}
        <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 12, background: 'rgba(255,255,255,0.05)', marginBottom: 28 }}>
          {TABS.map((t) => (
            <button
              id={`prism-node-tab-${t.id}`}
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                background: tab === t.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                border: tab === t.id ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                color: tab === t.id ? '#fff' : '#9ca3af',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Live Vitals ── */}
        {tab === 'vitals' && (
          <div className="pn-slide">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              {/* Heart Rate (BPM) Card */}
              <div className="pn-card" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 20, padding: 24, backdropFilter: 'blur(12px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a5b4fc', marginBottom: 4 }}>Heart Rate</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Analog Pulse Sensor (GPIO 34)</p>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: currentPulse ? 'rgba(22,163,74,0.2)' : 'rgba(255,255,255,0.08)', color: currentPulse ? '#86efac' : '#9ca3af', fontWeight: 700, height: 'fit-content' }}>{latestPulseFresh ? 'LIVE' : currentPulse ? 'STALE' : 'WAITING'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                  <span style={{ fontSize: 56, fontWeight: 900, letterSpacing: '-0.04em', color: '#e0e7ff', lineHeight: 1 }}>{currentBPM}</span>
                  <span style={{ fontSize: 14, color: '#a5b4fc', fontWeight: 600 }}>bpm</span>
                </div>
                <Sparkline data={pulseReadings.map(r => r.bpm)} color="#818cf8" height={70} />
                {isDemoMode && <p style={{ fontSize: 10, color: '#818cf8', marginTop: 8, opacity: 0.7 }}>⚡ Synthetic waveform — connect ESP32 for live data</p>}
              </div>

              {/* G-Force / Movement Card */}
              <div className="pn-card" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: 24, backdropFilter: 'blur(12px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fbbf24', marginBottom: 4 }}>Movement / G-Force</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>MPU6050 Accelerometer (I2C)</p>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: currentPulse ? 'rgba(22,163,74,0.2)' : 'rgba(255,255,255,0.08)', color: currentPulse ? '#86efac' : '#9ca3af', fontWeight: 700, height: 'fit-content' }}>{latestPulseFresh ? 'LIVE' : currentPulse ? 'STALE' : 'WAITING'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                  <span style={{ fontSize: 56, fontWeight: 900, letterSpacing: '-0.04em', color: '#fef3c7', lineHeight: 1 }}>{currentGForce}</span>
                  <span style={{ fontSize: 14, color: '#fbbf24', fontWeight: 600 }}>g</span>
                </div>
                <Sparkline data={pulseReadings.map(r => r.g_force)} color="#f59e0b" height={70} />
                {isDemoMode && <p style={{ fontSize: 10, color: '#f59e0b', marginTop: 8, opacity: 0.7 }}>⚡ Synthetic waveform — connect ESP32 for live data</p>}
              </div>
            </div>

            {/* Stats strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {[
                { label: 'Pulse Readings', value: `${pulseReadings.length}`, unit: 'pts' },
                { label: 'Alerts Fired', value: `${alertCount}`, unit: alertCount > 0 ? '⚠' : '✓' },
                { label: 'Node Status', value: latestPulseFresh ? 'Online' : currentPulse ? 'Stale' : 'Waiting', unit: '' },
                { label: 'Data Mode', value: currentPulse ? 'Hardware' : 'Waiting', unit: '' },
              ].map((s) => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', backdropFilter: 'blur(8px)' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{s.label}</p>
                  <p style={{ fontSize: 20, fontWeight: 800 }}>{s.value}<span style={{ fontSize: 12, marginLeft: 4, color: 'var(--text-secondary)' }}>{s.unit}</span></p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Live Camera ── */}
        {tab === 'camera' && (
          <div className="pn-slide">
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Live Camera Feed</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 620, lineHeight: 1.6 }}>
              Live webcam feed from the monitoring station. Connects to any USB camera on the local machine or an RTSP stream from the Raspberry Pi. The camera endpoint is optional — if no camera hardware is configured, this panel shows a friendly empty state instead of a broken image.
            </p>
            <CameraPanel token={token} apiBase={API} />
          </div>
        )}

        {/* ── Sleep Windows ── */}
        {tab === 'sleep' && (
          <div className="pn-slide">
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Inferred Sleep Windows</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 620, lineHeight: 1.6 }}>
              Estimated from screen-off events, stillness periods, and typing gaps. These are statistical estimates — not medical measurements.
            </p>
            {!Array.isArray(sleepWindows) || sleepWindows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', border: '1px dashed var(--border)', borderRadius: 20 }}>
                <p style={{ fontSize: 36, marginBottom: 12 }}>🌙</p>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>No sleep windows yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Run the worker job or ingest more telemetry to generate estimates.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sleepWindows.map((sw) => {
                  const hrs = parseFloat(((new Date(sw.estimated_end).getTime() - new Date(sw.estimated_start).getTime()) / 3600000).toFixed(1))
                  const { label, color } = sleepLabel(hrs)
                  const conf = Math.round(sw.confidence * 100)
                  return (
                    <div key={sw.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{label}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{hrs}h</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                        <span>🕐 {new Date(sw.estimated_start).toLocaleString()}</span>
                        <span>→</span>
                        <span>{new Date(sw.estimated_end).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${conf}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
                      </div>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{conf}% model confidence</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Device Status ── */}
        {tab === 'status' && (
          <div className="pn-slide" style={{ maxWidth: 620 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 24 }}>PRISM Node Hardware Status</h2>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: 36, textAlign: 'center', backdropFilter: 'blur(12px)', marginBottom: 20 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px', background: nodeStatus.connected ? 'linear-gradient(135deg,#10b981,#059669)' : 'rgba(255,255,255,0.1)', animation: nodeStatus.connected ? 'connectedPulse 2s ease-in-out infinite' : 'none' }} />
              <h3 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
                {nodeStatus.connected ? '🟢 Connected' : '⚫ Not Connected'}
              </h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
                {nodeStatus.connected
                  ? `PRISM Node wearable is online. Last signal: ${nodeStatus.last_seen ? new Date(nodeStatus.last_seen).toLocaleString() : 'just now'}`
                  : 'No physio data received in the last 5 minutes. Ensure the PRISM Node ESP32 is powered and connected to the same network.'}
              </p>
              {nodeStatus.sensor && (
                <span style={{ fontSize: 12, padding: '4px 14px', borderRadius: 20, background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 700 }}>
                  Active sensor: {nodeStatus.sensor.toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ padding: '16px 20px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hardware Spec (PRISM PULSE v4.0)</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                PRISM Node uses an ESP32-D0WD-V3 microcontroller with an Analog Pulse Sensor (GPIO 34) for heart rate,
                an MPU6050 accelerometer/gyroscope (I2C) for movement context, an ISD1820 voice recorder module (GPIO 4)
                for local alerts, and a 16×2 I2C LCD display for on-device feedback.
                Multi-factor sensor fusion ensures voice alerts trigger only during sustained anomalous conditions
                (High BPM + Low Movement for 15 seconds). No audio, video, or message content is ever captured.
              </p>
            </div>
          </div>
        )}

        {/* ── About ── */}
        {tab === 'about' && (
          <div className="pn-slide" style={{ maxWidth: 700 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>What PRISM Node Measures — and Why</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28 }}>A plain-language explainer for guardians, teens, and clinicians.</p>

            {[
              { icon: '❤️', title: 'Heart Rate (Pulse Sensor)', color: '#818cf8', desc: 'Detects resting heart rate patterns using an analog pulse sensor worn on the fingertip. Photoplethysmography light passes through the skin to measure blood volume changes between heartbeats. Deviations from a personal baseline may indicate physiological stress and prompt a supportive check-in. This is NOT used for medical diagnosis.' },
              { icon: '🏃', title: 'Movement & G-Force (MPU6050)', color: '#f59e0b', desc: 'Tracks physical activity context using a 3-axis accelerometer and gyroscope. This sensor distinguishes between rest, walking, running, and falls. High heart rate during physical activity is normal — high heart rate while sitting still is not. The MPU6050 provides this critical context to prevent false alerts.' },
              { icon: '🔊', title: 'Local Voice Alert (ISD1820)', color: '#f87171', desc: 'When both heart rate and inactivity are abnormal for a sustained 15-second window, the ESP32 triggers a pre-recorded voice message via the ISD1820 module. This provides immediate, private, on-device support without requiring an internet connection. The message is recorded by the user and is never transmitted or stored digitally.' },
              { icon: '🌙', title: 'Sleep Windows', color: '#a78bfa', desc: 'Inferred from stillness patterns, screen-off timestamps, and typing activity gaps. When physiological data is available, resting heart rate plateaus and low movement variance add further signal. These are statistical estimates only — not clinical sleep studies.' },
            ].map((item) => (
              <div key={item.title} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 14, display: 'flex', gap: 16 }}>
                <span style={{ fontSize: 28, flexShrink: 0 }}>{item.icon}</span>
                <div>
                  <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 6, color: item.color }}>{item.title}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{item.desc}</p>
                </div>
              </div>
            ))}

            {/* Disclosure — required per AGENTS.md consent-first rules */}
            <div style={{ marginTop: 24, padding: '20px 24px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>📋 Privacy &amp; Consent Disclosure</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <strong>PRISM Node captures physiological metadata only.</strong> It does not capture audio, video, screenshots, or message content.
                All readings are encrypted at rest (AES-256) and in transit (TLS 1.3). Every data-access event is written to an immutable audit log.
                Monitoring is fully disclosed to the teen — there is no covert mode. Consent for any modality can be revoked at any time from the Consent Ledger.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

/* ── CameraPanel ──────────────────────────────────────────────────────────── */

/**
 * Camera feed panel that gracefully handles the absence of the camera
 * endpoint. Probes `/camera/stream` with the current bearer token; if the
 * endpoint is missing (404) or refuses (403/401) the panel renders a
 * friendly empty state instead of leaving a broken image element.
 */
function CameraPanel({ token, apiBase }: { token: string | null; apiBase: string }) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!token) {
      setError('No active session — log in to enable camera stream.')
      setStreamUrl(null)
      return
    }
    const url = `${apiBase}/camera/stream?token=${encodeURIComponent(token)}`
    setStreamUrl(url)
    setError(null)
  }, [token, apiBase, reloadKey])

  const handleImageError = useCallback(() => {
    setError(
      'Camera stream is not configured on this backend. ' +
      'Connect a USB webcam to the PRISM host or set PRISM_CAMERA_URL to an RTSP stream from the RPi.',
    )
    setStreamUrl(null)
  }, [])

  const refresh = useCallback(() => {
    setStreamUrl(null)
    setError(null)
    setReloadKey((k) => k + 1)
  }, [])

  if (!token) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '60px 20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 20 }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>📷</div>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Sign in to view the camera feed</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Your session token is required to authenticate the live stream.</p>
      </div>
    )
  }

  if (error || !streamUrl) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '60px 20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 20 }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>📷</div>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Camera not available</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto 16px', lineHeight: 1.6 }}>
          {error ?? 'No camera hardware configured. Connect a USB webcam to the PRISM host or set PRISM_CAMERA_URL to an RTSP stream from the RPi.'}
        </p>
        <button
          onClick={refresh}
          style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          ↻ Try Again
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ background: '#000', borderRadius: 20, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
        <img
          key={reloadKey}
          src={streamUrl}
          alt="Live camera feed"
          style={{ width: '100%', display: 'block', minHeight: 400, objectFit: 'cover' }}
          onError={handleImageError}
        />
        <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.6)', padding: '4px 12px', borderRadius: 20, backdropFilter: 'blur(8px)' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'nodePulse 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '0.05em' }}>LIVE</span>
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <button
          onClick={refresh}
          style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          ↻ Refresh Stream
        </button>
        <button
          onClick={() => token && window.open(`${apiBase}/camera/frame?token=${encodeURIComponent(token)}`, '_blank')}
          style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          📸 Snapshot
        </button>
      </div>
    </div>
  )
}
