'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Keyboard, ShieldCheck, Info, Activity, HeartPulse, TrendingUp } from 'lucide-react'
import { API, authFetch, wsUrl } from '@/lib/api'

interface ApiDevice {
  id: string
  name: string
  platform: string
}

interface TypingScore {
  model_name: string
  score: number
  threshold: number
  flagged: boolean
  contributing_factors: string[]
  timestamp: string
}

interface TypingInsights {
  device_id: string
  baseline: { mean: number; variance: number; source: string } | null
  scores: TypingScore[]
}

interface BehaviorDim {
  name: string
  score: number | null
  flagged: boolean
  contributing_factors: string[]
  timestamp: string | null
  feature_importance?: { feature: string; label: string; importance: number }[]
  shap_values?: { feature: string; label: string; contribution: number }[]
  reasoning?: string[]
}

interface BehavioralInsights {
  device_id: string
  dimensions: BehaviorDim[]
  disclaimer: string
}

interface DeviceCard {
  id: string
  name: string
  platform: string
  latest: TypingScore | null
  baselineMean: number | null
  baselineSigma: number | null
  zScore: number | null
  behavioral: BehaviorDim[] | null
  disclaimer: string | null
}

const statusColor = (s: string) => s === 'Normal' ? '#16A34A' : s === 'Needs review' ? '#F59E0B' : '#EF4444'

export default function TypingAnalyticsPage() {
  const router = useRouter()
  const [guardian, setGuardian] = useState('Guardian')
  const [cards, setCards] = useState<DeviceCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadInsights = useCallback(async (token: string) => {
    try {
      const devRes = await authFetch(`/auth/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!devRes.ok) throw new Error(`Devices API returned ${devRes.status}`)
      const devices: ApiDevice[] = await devRes.json()

      const built: DeviceCard[] = []
      for (const d of devices) {
        try {
          const res = await fetch(`${API}/events/typing/insights/${d.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) continue
          const data: TypingInsights = await res.json()
          const latest = data.scores[0] || null
          const sigma = data.baseline ? Math.sqrt(data.baseline.variance) : null

          // Module 4: behavioral screening explainability (stress, cognitive
          // load, fatigue, stability + feature importance / SHAP / reasoning).
          let behavioral: BehaviorDim[] | null = null
          let disclaimer: string | null = null
          try {
            const bres = await fetch(`${API}/events/typing/behavioral/${d.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (bres.ok) {
              const bdata: BehavioralInsights = await bres.json()
              behavioral = bdata.dimensions
              disclaimer = bdata.disclaimer
            }
          } catch {}

          built.push({
            id: d.id,
            name: d.name,
            platform: d.platform === 'ios' ? 'iOS' : 'Android',
            latest,
            baselineMean: data.baseline?.mean ?? null,
            baselineSigma: sigma,
            zScore: latest && sigma ? (latest.score * 4) / sigma : null,
            behavioral,
            disclaimer,
          })
        } catch {}
      }
      setCards(built)
    } catch (e: any) {
      setError(e?.message || 'Failed to load typing insights')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    if (!token) { router.push('/'); return }
    const gs = localStorage.getItem('prism_guardian')
    if (gs) { try { setGuardian(JSON.parse(gs).full_name || 'Guardian') } catch {} }

    loadInsights(token)

    // Live typing events
    try {
      const ws = new WebSocket(wsUrl('/events/ws?token=' + token))
      ws.onerror = () => {}
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)
          if (d.signal_type === 'typing' || d.type?.includes('typing')) {
            loadInsights(token)
          }
        } catch {}
      }
      return () => ws.close()
    } catch {}
  }, [router, loadInsights])

  const labelFor = (c: DeviceCard) => {
    if (!c.latest) return 'No data'
    if (c.latest.flagged) return c.latest.model_name === 'typing_rhythm' ? 'Attention' : 'Needs review'
    return 'Normal'
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => router.push('/overview')} className="btn-ghost" style={{ padding: 10 }}>
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Typing Insights</h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                Mental-state signals from keystroke timing — {guardian}
              </p>
            </div>
          </div>
          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={14} color="#16A34A" />
            Timing metadata only — never message content
          </span>
        </header>

        {loading ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', borderRadius: 24 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading typing insights…</p>
          </div>
        ) : error ? (
          <div className="card" style={{ padding: 32, borderRadius: 24, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 15, color: '#EF4444' }}>⚠️ {error}</p>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>Check that the API is running on localhost:8000.</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', borderRadius: 24 }}>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>⌨️</p>
            <p style={{ margin: 0, fontWeight: 700 }}>No devices yet</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>Register a device to start collecting typing rhythm insights.</p>
          </div>
        ) : (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {cards.map(card => {
              const label = labelFor(card)
              const color = statusColor(label)
              return (
                <div key={card.id} className="card" style={{ padding: 24, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(11,112,209,0.08)', display: 'grid', placeItems: 'center' }}>
                      <Keyboard size={18} color="#0B70D1" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{card.name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{card.platform} · {card.id.slice(0, 8)}</p>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{label}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 12, padding: '12px 14px' }}>
                      <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Risk score</p>
                      <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700 }}>
                        {card.latest ? (card.latest.score * 100).toFixed(0) : '—'}<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>%</span>
                      </p>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 12, padding: '12px 14px' }}>
                      <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Z-score</p>
                      <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700 }}>
                        {card.zScore !== null && card.zScore !== undefined ? card.zScore.toFixed(1) : '—'}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {card.baselineMean !== null && (
                      <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <TrendingUp size={12} /> Baseline {card.baselineMean.toFixed(2)}
                      </span>
                    )}
                    {card.baselineSigma !== null && (
                      <span className="badge">σ {card.baselineSigma.toFixed(2)}</span>
                    )}
                    {card.latest?.model_name && (
                      <span className="badge">{card.latest.model_name === 'typing_rhythm' ? 'Rhythm model' : 'Proxy model'}</span>
                    )}
                  </div>

                  {card.latest?.contributing_factors && card.latest.contributing_factors.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <p style={{ margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Info size={12} /> Contributing factors
                      </p>
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {card.latest.contributing_factors.map((f, i) => (
                          <li key={i} style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {card.behavioral && card.behavioral.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                      <p style={{ margin: '0 0 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ShieldCheck size={12} color="#0B70D1" /> Behavioral screening (explainable)
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {card.behavioral.map(dim => {
                          const dimColor = dim.flagged ? (dim.score && dim.score >= 0.7 ? '#EF4444' : '#F59E0B') : '#16A34A'
                          return (
                            <div key={dim.name} style={{
                              background: 'rgba(0,0,0,0.02)', border: `1px solid ${dim.flagged ? `${dimColor}44` : 'var(--border)'}`,
                              borderRadius: 12, padding: '12px 14px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                                  {dim.name.replace(/_/g, ' ')}
                                </span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: dimColor }}>
                                  {dim.score !== null ? `${(dim.score * 100).toFixed(0)}%` : '—'}
                                </span>
                              </div>
                              {dim.reasoning && dim.reasoning.length > 0 && (
                                <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{dim.reasoning[0]}</p>
                              )}
                              {dim.shap_values && dim.shap_values.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                  <p style={{ margin: '0 0 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Top contributing signals</p>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {dim.shap_values.slice(0, 3).map((s, i) => (
                                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.label}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: s.contribution > 0 ? '#F59E0B' : '#16A34A' }}>
                                          {s.contribution > 0 ? '+' : ''}{Math.round(s.contribution * 100)}%
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {dim.feature_importance && dim.feature_importance.length > 0 && (
                                <div>
                                  <p style={{ margin: '0 0 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Most influential features</p>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {dim.feature_importance.slice(0, 3).map((f, i) => (
                                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 110, flexShrink: 0, fontSize: 11, color: 'var(--text-secondary)' }}>{f.label}</span>
                                        <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.06)' }}>
                                          <div style={{ width: `${f.importance * 100}%`, height: '100%', borderRadius: 3, background: '#0B70D1' }} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {card.disclaimer && (
                        <p style={{ margin: '10px 0 0', fontSize: 11, lineHeight: 1.5, color: 'var(--text-muted)' }}>
                          ⚠️ {card.disclaimer}
                        </p>
                      )}
                    </div>
                  )}

                  {!card.latest && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                      <HeartPulse size={14} /> No typing samples yet — waiting for the next flush.
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}

        <section className="card" style={{ marginTop: 32, padding: 24, display: 'flex', gap: 20, alignItems: 'flex-start', borderRadius: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(11,112,209,0.1)', display: 'grid', placeItems: 'center' }}>
            <Activity size={24} color="#0B70D1" />
          </div>
          <div>
            <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, color: 'var(--text-muted)' }}>How typing rhythm works</p>
            <p style={{ margin: '14px 0 0', fontSize: 14.5, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              PRISM measures the <b>timing between keypresses</b> on the device — inter-key intervals,
              backspace density, and burst length — and compares each reading to the child&apos;s own rolling
              baseline. A sustained, statistically significant deviation (z-score &gt; 2) may indicate
              fatigue, stress, or low energy, surfaced as an explainable alert. Only timing metadata is
              collected — never the characters typed.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
