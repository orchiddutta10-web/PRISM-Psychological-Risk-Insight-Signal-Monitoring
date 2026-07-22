'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// PRISM Node — Physiological Wearable Monitor
// Alternate brand names in reserve: Pulse, Aura, VitalLink
// This surface is intentionally isolated — no imports from the behavior dashboard.

type Tab = 'vitals' | 'sleep' | 'status' | 'about'

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

function generateSyntheticReadings(type: 'ppg' | 'gsr', count = 60): PhysioReading[] {
  const now = Date.now()
  return Array.from({ length: count }, (_, i) => {
    const t = (i / count) * Math.PI * 4
    const base = type === 'ppg' ? 65 : 0.5
    const noise = (Math.random() - 0.5) * (type === 'ppg' ? 4 : 0.05)
    const wave = type === 'ppg' ? Math.sin(t) * 3 : Math.sin(t * 0.5) * 0.08
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
  readings,
  color,
  height = 60,
}: {
  readings: PhysioReading[]
  color: string
  height?: number
}) {
  if (!readings.length) return null
  const values = readings.map((r) => r.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100
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

export default function PrismNodePage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('vitals')
  const [token, setToken] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [ppgReadings, setPpgReadings] = useState<PhysioReading[]>([])
  const [gsrReadings, setGsrReadings] = useState<PhysioReading[]>([])
  const [sleepWindows, setSleepWindows] = useState<SleepWindow[]>([])
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>({ connected: false, last_seen: null, sensor: null })
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
      const [ppgRes, gsrRes] = await Promise.all([
        fetch(`http://localhost:8000/api/v1/physio/readings/${did}?sensor_type=ppg&limit=60`, { headers: { Authorization: `Bearer ${tk}` } }),
        fetch(`http://localhost:8000/api/v1/physio/readings/${did}?sensor_type=gsr&limit=60`, { headers: { Authorization: `Bearer ${tk}` } }),
      ])
      const ppg: PhysioReading[] = await ppgRes.json()
      const gsr: PhysioReading[] = await gsrRes.json()
      if (ppg.length === 0 && gsr.length === 0) {
        setPpgReadings(generateSyntheticReadings('ppg'))
        setGsrReadings(generateSyntheticReadings('gsr'))
        setIsDemoMode(true)
      } else {
        setPpgReadings([...ppg].reverse())
        setGsrReadings([...gsr].reverse())
        setIsDemoMode(false)
      }
    } catch {
      setPpgReadings(generateSyntheticReadings('ppg'))
      setGsrReadings(generateSyntheticReadings('gsr'))
      setIsDemoMode(true)
    }
    setLastRefresh(new Date())
  }, [])

  const fetchSleep = useCallback(async (tk: string, did: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/physio/sleep/${did}?limit=30`, { headers: { Authorization: `Bearer ${tk}` } })
      setSleepWindows(await res.json())
    } catch { setSleepWindows([]) }
  }, [])

  const fetchStatus = useCallback(async (tk: string, did: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/physio/status/${did}`, { headers: { Authorization: `Bearer ${tk}` } })
      setNodeStatus(await res.json())
    } catch { setNodeStatus({ connected: false, last_seen: null, sensor: null }) }
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

  const currentHR = ppgReadings.length ? ppgReadings[ppgReadings.length - 1].value.toFixed(0) : '—'
  const currentGSR = gsrReadings.length ? gsrReadings[gsrReadings.length - 1].value.toFixed(3) : '—'

  const TABS: { id: Tab; label: string }[] = [
    { id: 'vitals', label: '❤️  Live Vitals' },
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
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginTop: -2 }}>Physiological Wearable Monitor</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isDemoMode && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', letterSpacing: '0.05em' }}>
                ✦ SYNTHETIC DEMO MODE
              </span>
            )}
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
              {/* HR Card */}
              <div className="pn-card" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 20, padding: 24, backdropFilter: 'blur(12px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a5b4fc', marginBottom: 4 }}>Heart Rate</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>PPG inter-beat interval</p>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(99,102,241,0.2)', color: '#c7d2fe', fontWeight: 700, height: 'fit-content' }}>LIVE</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                  <span style={{ fontSize: 56, fontWeight: 900, letterSpacing: '-0.04em', color: '#e0e7ff', lineHeight: 1 }}>{currentHR}</span>
                  <span style={{ fontSize: 14, color: '#a5b4fc', fontWeight: 600 }}>bpm</span>
                </div>
                <Sparkline readings={ppgReadings} color="#818cf8" height={70} />
                {isDemoMode && <p style={{ fontSize: 10, color: '#818cf8', marginTop: 8, opacity: 0.7 }}>⚡ Synthetic waveform — connect hardware for live data</p>}
              </div>

              {/* GSR Card */}
              <div className="pn-card" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 20, padding: 24, backdropFilter: 'blur(12px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6ee7b7', marginBottom: 4 }}>Skin Conductance</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>GSR tonic / phasic level</p>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', fontWeight: 700, height: 'fit-content' }}>LIVE</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                  <span style={{ fontSize: 56, fontWeight: 900, letterSpacing: '-0.04em', color: '#d1fae5', lineHeight: 1 }}>{currentGSR}</span>
                  <span style={{ fontSize: 14, color: '#6ee7b7', fontWeight: 600 }}>µS</span>
                </div>
                <Sparkline readings={gsrReadings} color="#34d399" height={70} />
                {isDemoMode && <p style={{ fontSize: 10, color: '#34d399', marginTop: 8, opacity: 0.7 }}>⚡ Synthetic waveform — connect hardware for live data</p>}
              </div>
            </div>

            {/* Stats strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {[
                { label: 'Readings (PPG)', value: `${ppgReadings.length}`, unit: 'pts' },
                { label: 'Readings (GSR)', value: `${gsrReadings.length}`, unit: 'pts' },
                { label: 'Node Status', value: nodeStatus.connected ? 'Online' : 'Offline', unit: '' },
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
            {sleepWindows.length === 0 ? (
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
              <p style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hardware Spec (MVP Demo)</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                PRISM Node uses an ESP32 microcontroller with a Grove-compatible GSR sensor and MAX30102 PPG module.
                Data is streamed via MQTT to an edge buffer, then batch-pushed to the PRISM API over TLS.
                No audio, video, or message content is ever captured.
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
              { icon: '❤️', title: 'Heart Rate (PPG)', color: '#818cf8', desc: 'Detects resting heart rate patterns derived from the time between heartbeats (inter-beat intervals). This is NOT used for medical diagnosis. Deviations from a personal baseline may indicate physiological stress and prompt a supportive conversation.' },
              { icon: '⚡', title: 'Skin Conductance (GSR)', color: '#34d399', desc: 'Detects stress arousal patterns from sweat gland activity on the skin surface — metadata only, no clinical interpretation. Elevated GSR tonic levels may correlate with heightened emotional arousal and are surfaced as context clues, never diagnoses.' },
              { icon: '🌙', title: 'Sleep Windows', color: '#a78bfa', desc: 'Inferred from stillness patterns, screen-off timestamps, and typing activity gaps. When physiological data is available, resting HR plateaus and low GSR variance add further signal. These are statistical estimates only — not clinical sleep studies.' },
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
