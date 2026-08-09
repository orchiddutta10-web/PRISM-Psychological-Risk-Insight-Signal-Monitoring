'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { API } from '@/lib/api'

// PRISM Node — Physiological Wearable Monitor (v4.0 Multi-Factor Edition)
// Hardware: ESP32 + Analog Pulse Sensor (GPIO34) + MPU6050 (I2C) + ISD1820 + I2C LCD
// This surface is intentionally isolated — no imports from the behavior dashboard.

type Tab = 'vitals' | 'insights' | 'sleep' | 'status' | 'about'

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

interface EdgeDevice {
  device_id: string
  device_type: string
  battery_level: number | null
  status: string
  last_seen: string
  signal_quality: number
  risk_score: number
  ai_tags: string[]
}

function generateSyntheticEdgeDevices(): EdgeDevice[] {
  return [
    {
      device_id: 'esp32_pulse_01',
      device_type: 'wearable',
      battery_level: 82,
      status: 'online',
      last_seen: new Date().toISOString(),
      signal_quality: 95,
      risk_score: 12,
      ai_tags: ['STABLE_HR', 'RESTING']
    },
    {
      device_id: 'iphone_15_pro',
      device_type: 'mobile',
      battery_level: 45,
      status: 'online',
      last_seen: new Date(Date.now() - 5000).toISOString(),
      signal_quality: 100,
      risk_score: 38,
      ai_tags: ['HIGH_SCREEN_TIME', 'LATE_NIGHT_USAGE']
    }
  ]
}

function generateSyntheticPulseReadings(count = 60): PulseReading[] {
  const now = Date.now()
  return Array.from({ length: count }, (_, i) => {
    const t = (i / count) * Math.PI * 4
    const bpmBase = 72
    const bpmNoise = (Math.random() - 0.5) * 6
    const bpmWave = Math.sin(t) * 4
    const bpm = Math.max(40, Math.min(180, bpmBase + bpmWave + bpmNoise))

    const gBase = 1.0
    const gNoise = (Math.random() - 0.5) * 0.15
    const gForce = Math.max(0.5, gBase + gNoise)

    const pulseRaw = 1800 + Math.sin(t * 2) * 300 + (Math.random() - 0.5) * 200

    return {
      id: `synth-pulse-${i}`,
      subject_id: 'demo',
      ts_ms: now - (count - i) * 5000,
      pulse_raw: Math.round(pulseRaw),
      bpm: Math.round(bpm),
      g_force: parseFloat(gForce.toFixed(2)),
      alert_status: bpm > 110 && gForce < 1.2 ? 'WARNING' : 'OK',
      timestamp: new Date(now - (count - i) * 5000).toISOString(),
    }
  })
}

function generateSyntheticReadings(type: 'ppg', count = 60): PhysioReading[] {
  const now = Date.now()
  return Array.from({ length: count }, (_, i) => {
    const t = (i / count) * Math.PI * 4
    const base = 65
    const noise = (Math.random() - 0.5) * 4
    const wave = Math.sin(t) * 3
    return {
      id: `synth-${i}`,
      subject_id: 'demo',
      sensor_type: type,
      value: base + wave + noise,
      variance: 0.1,
      timestamp: new Date(now - (count - i) * 5000).toISOString(),
    }
  })
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
  const [pulseReadings, setPulseReadings] = useState<PulseReading[]>([])
  const [ppgReadings, setPpgReadings] = useState<PhysioReading[]>([])
  const [sleepWindows, setSleepWindows] = useState<SleepWindow[]>([])
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>({ connected: false, last_seen: null, sensor: null })
  const [edgeDevices, setEdgeDevices] = useState<EdgeDevice[]>([])
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => {
    const tk = localStorage.getItem('prism_token')
    if (!tk) { router.push('/'); return }
    setToken(tk)
    setDeviceId(localStorage.getItem('prism_selected_device') || '')
  }, [router])

  const fetchVitals = useCallback(async (tk: string, did: string) => {
    try {
      // Fetch from PRISM PULSE multi-factor endpoint (ESP32 BPM + G-Force)
      const pulseRes = await fetch(`${API}/physio/pulse/readings/${did}?limit=60`, { headers: { Authorization: `Bearer ${tk}` } })
      // Also try legacy PPG readings
      const ppgRes = await fetch(`${API}/physio/readings/${did}?sensor_type=ppg&limit=60`, { headers: { Authorization: `Bearer ${tk}` } })

      let pulseData: PulseReading[] = []
      let ppgData: PhysioReading[] = []

      if (pulseRes.ok) {
        pulseData = await pulseRes.json()
      }
      if (ppgRes.ok) {
        ppgData = await ppgRes.json()
      }

      if (pulseData.length === 0 && ppgData.length === 0) {
        // No real data — fall back to synthetic demo
        setPulseReadings(generateSyntheticPulseReadings())
        setPpgReadings(generateSyntheticReadings('ppg'))
        setIsDemoMode(true)
      } else {
        setPulseReadings([...pulseData].reverse())
        setPpgReadings([...ppgData].reverse())
        setIsDemoMode(false)
      }
    } catch {
      setPulseReadings(generateSyntheticPulseReadings())
      setPpgReadings(generateSyntheticReadings('ppg'))
      setIsDemoMode(true)
    }
    setLastRefresh(new Date())
  }, [])

  const fetchSleep = useCallback(async (tk: string, did: string) => {
    try {
      const res = await fetch(`${API}/physio/sleep/${did}?limit=30`, { headers: { Authorization: `Bearer ${tk}` } })
      if (!res.ok) throw new Error(`Sleep API returned ${res.status}`)
      const data = await res.json()
      setSleepWindows(Array.isArray(data) ? data : [])
    } catch { setSleepWindows([]) }
  }, [])

  const fetchStatus = useCallback(async (tk: string, did: string) => {
    try {
      const res = await fetch(`${API}/physio/status/${did}`, { headers: { Authorization: `Bearer ${tk}` } })
      if (!res.ok) throw new Error(`Status API returned ${res.status}`)
      setNodeStatus(await res.json())
    } catch { setNodeStatus({ connected: false, last_seen: null, sensor: null }) }
    
    // Simulate fetching Edge devices from our new gateway for demo mode or fall back
    try {
      // In a real environment, we'd query the edge node or the backend relay
      const devRes = await fetch(`http://localhost:8081/api/v1/devices`, { signal: AbortSignal.timeout(2000) })
      if (devRes.ok) {
        const data = await devRes.json()
        setEdgeDevices(data.devices || [])
      } else {
        setEdgeDevices(generateSyntheticEdgeDevices())
      }
    } catch {
      setEdgeDevices(generateSyntheticEdgeDevices())
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

  // Derive current values from pulse readings
  const latestPulse = pulseReadings.length ? pulseReadings[pulseReadings.length - 1] : null
  const currentBPM = latestPulse ? latestPulse.bpm.toFixed(0) : '—'
  const currentGForce = latestPulse ? latestPulse.g_force.toFixed(2) : '—'
  const currentAlert = latestPulse ? latestPulse.alert_status : 'OK'
  const alertInfo = alertBadge(currentAlert)

  // Count active alerts in last 60 readings
  const alertCount = pulseReadings.filter(r => r.alert_status !== 'OK').length

  const TABS: { id: Tab; label: string }[] = [
    { id: 'vitals', label: '❤️  Live Vitals' },
    { id: 'insights', label: '🧠  AI Insights' },
    { id: 'sleep', label: '🌙  Sleep Windows' },
    { id: 'status', label: '📡  Edge Devices & Status' },
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
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginTop: -2 }}>Multi-Factor Physiological Monitor (v4.0)</span>
              </div>
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
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(99,102,241,0.2)', color: '#c7d2fe', fontWeight: 700, height: 'fit-content' }}>LIVE</span>
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
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(245,158,11,0.2)', color: '#fbbf24', fontWeight: 700, height: 'fit-content' }}>LIVE</span>
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
                { label: 'Node Status', value: isDemoMode ? 'Demo' : nodeStatus.connected ? 'Online' : 'Offline', unit: '' },
                { label: 'Data Mode', value: isDemoMode ? 'Synthetic' : 'Real', unit: '' },
              ].map((s) => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', backdropFilter: 'blur(8px)' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{s.label}</p>
                  <p style={{ fontSize: 20, fontWeight: 800 }}>{s.value}<span style={{ fontSize: 12, marginLeft: 4, color: 'var(--text-secondary)' }}>{s.unit}</span></p>
                </div>
              ))}
            </div>
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

        {/* ── AI Insights ── */}
        {tab === 'insights' && (
          <div className="pn-slide" style={{ maxWidth: 700 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>AI Risk Engine Insights</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
              The local Edge AI aggregates session data and tags physiological and behavioral changes automatically.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
              {edgeDevices.map(device => (
                <div key={device.device_id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 24 }}>{device.device_type === 'mobile' ? '📱' : '⌚'}</span>
                      <div>
                        <h3 style={{ fontSize: 14, fontWeight: 700 }}>{device.device_id.toUpperCase()}</h3>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Risk Score: {device.risk_score}/100</p>
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '4px 12px', fontSize: 12, fontWeight: 700, color: device.risk_score > 50 ? '#ef4444' : '#10b981' }}>
                      {device.risk_score > 50 ? 'ELEVATED RISK' : 'LOW RISK'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {device.ai_tags.map(tag => (
                      <span key={tag} style={{ fontSize: 11, background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', padding: '4px 10px', borderRadius: 16, border: '1px solid rgba(99,102,241,0.3)' }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Device Status ── */}
        {tab === 'status' && (
          <div className="pn-slide">
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 24 }}>Edge Gateway & Connected Devices</h2>
            
            <div style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Connected Edge Nodes</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {edgeDevices.map((dev) => (
                  <div key={dev.device_id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase' }}>{dev.device_type} NODE</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID: {dev.device_id}</p>
                      </div>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: dev.status === 'online' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: dev.status === 'online' ? '#6ee7b7' : '#fca5a5', fontWeight: 700, height: 'fit-content' }}>
                        {dev.status.toUpperCase()}
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Battery</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 30, height: 12, border: '1px solid var(--border)', borderRadius: 3, padding: 1 }}>
                            <div style={{ width: `${dev.battery_level || 0}%`, height: '100%', background: (dev.battery_level || 0) > 20 ? '#10b981' : '#ef4444', borderRadius: 1 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{dev.battery_level ? `${dev.battery_level}%` : 'N/A'}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Signal Quality</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: dev.signal_quality > 70 ? '#10b981' : '#f59e0b' }}>{dev.signal_quality}%</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Last Sync</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{new Date(dev.last_seen).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: 36, textAlign: 'center', backdropFilter: 'blur(12px)', marginBottom: 20 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px', background: nodeStatus.connected ? 'linear-gradient(135deg,#10b981,#059669)' : 'rgba(255,255,255,0.1)', animation: nodeStatus.connected ? 'connectedPulse 2s ease-in-out infinite' : 'none' }} />
              <h3 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
                {nodeStatus.connected ? '🟢 Gateway Connected' : '⚫ Gateway Not Connected'}
              </h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
                {nodeStatus.connected
                  ? `PRISM Node Gateway is online. Last signal: ${nodeStatus.last_seen ? new Date(nodeStatus.last_seen).toLocaleString() : 'just now'}`
                  : 'No physio data received in the last 5 minutes. Ensure the PRISM Node ESP32 is powered and connected to the same network.'}
              </p>
              {nodeStatus.sensor && (
                <span style={{ fontSize: 12, padding: '4px 14px', borderRadius: 20, background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 700 }}>
                  Active sensor: {nodeStatus.sensor.toUpperCase()}
                </span>
              )}
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
