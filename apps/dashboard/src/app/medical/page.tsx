'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, HeartPulse, Send, ShieldCheck, BookOpen, ChevronDown, Activity, Loader2, Bot } from 'lucide-react'
import { API, authFetch } from '@/lib/api'

interface Evidence {
  source: string
  page: number
  chunk: string
  score: number
}

interface AssistantMessage {
  answer: string
  evidence: Evidence[]
  sources: string[]
  confidence: number
  disclaimer: string
  crisis: boolean
  context?: {
    profile?: { device_name?: string; platform?: string; last_seen?: string | null }
    behavioral?: Record<string, { score: number; flagged: boolean; factors: string[]; timestamp: string }>
    typing_drivers?: string[]
  }
}

interface ChatItem {
  role: 'user' | 'assistant'
  prompt?: string
  result?: AssistantMessage
  error?: string
}

interface KbStatus {
  enabled: boolean
  provider: string
  model: string
  docs: number
  chunks: number
  vector_ready: boolean
}

const SUGGESTIONS = [
  'How should I treat a mild fever at home?',
  'What are the basics of first aid for a burn?',
  'How much sleep does a teenager need?',
  'What are the signs of dehydration?',
]

export default function MedicalPage() {
  const router = useRouter()
  const [guardian, setGuardian] = useState('Guardian')
  const [messages, setMessages] = useState<ChatItem[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [kb, setKb] = useState<KbStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([])
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    if (!token) { router.push('/'); return }
    const gs = localStorage.getItem('prism_guardian')
    if (gs) { try { setGuardian(JSON.parse(gs).full_name || 'Guardian') } catch {} }

    const loadStatus = async () => {
      try {
        const res = await authFetch(`/medical/status`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) setKb(await res.json())
      } catch {}
    }
    loadStatus()

    const loadDevices = async () => {
      try {
        const res = await authFetch(`/auth/devices`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const list = await res.json()
          const ids = new Set(list.map((d: any) => d.id))
          setDevices(list.map((d: any) => ({ id: d.id, name: d.name })))
          // Restore the selected device ONLY if it belongs to this guardian;
          // a stale id from a previous login would 403 the medical chat.
          const saved = localStorage.getItem('prism_selected_device')
          if (saved && ids.has(saved)) {
            setDeviceId(saved)
          } else if (saved) {
            localStorage.removeItem('prism_selected_device')
          }
        }
      } catch {}
    }
    loadDevices()
  }, [router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text?: string) => {
    const prompt = (text ?? input).trim()
    if (!prompt || loading) return
    const token = localStorage.getItem('prism_token')
    if (!token) { router.push('/'); return }

    setMessages(m => [...m, { role: 'user', prompt }])
    setInput('')
    setLoading(true)
    setError(null)
    try {
      // Only send a device_id the current guardian actually owns — a stale
      // id would make the API return 403 on the chat route.
      const validDevice = deviceId && devices.some(d => d.id === deviceId) ? deviceId : undefined
      const res = await authFetch(`/medical/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prompt,
          device_id: validDevice,
          // Pass recent conversation so the assistant fuses prior context.
          history: messages.slice(-6).map(m => ({
            role: m.role,
            utterance: m.role === 'user' ? m.prompt : m.result?.answer,
          })),
        }),
      })
      if (!res.ok) throw new Error(`Medical API returned ${res.status}`)
      const data: AssistantMessage = await res.json()
      setMessages(m => [...m, { role: 'assistant', result: data }])
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', error: e?.message || 'Something went wrong.' }])
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (i: number) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))

  const pct = (c: number) => `${Math.round(c * 100)}%`

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 48px' }}>
        {/* Header */}
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => router.push('/overview')} className="btn-ghost" style={{ padding: 10 }}>
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Prism Health Coach</h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                RAG-powered health and wellness coaching for {guardian}
              </p>
            </div>
          </div>
          {kb && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: kb.vector_ready ? '#16A34A' : '#F59E0B' }} />
                {kb.provider === 'openai' ? 'OpenAI' : 'Local Ollama'} · {kb.model}
              </span>
              <span className="badge">{kb.docs} docs · {kb.chunks} chunks</span>
            </div>
          )}
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>
          {/* Left rail */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {devices.length > 0 && (
              <section className="card" style={{ padding: 20, borderRadius: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Activity size={18} color="#0B70D1" />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Context device</p>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  The assistant fuses this child&apos;s behavioral screening signals into answers.
                </p>
                <select
                  value={deviceId ?? ''}
                  onChange={e => { setDeviceId(e.target.value || null); if (e.target.value) localStorage.setItem('prism_selected_device', e.target.value) }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}
                >
                  <option value="">No device context</option>
                  {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </section>
            )}

            <section className="card" style={{ padding: 20, borderRadius: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <BookOpen size={18} color="#0B70D1" />
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>How it works</p>
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                Your question is matched against a curated medical and wellness
                knowledge base (WHO/NIH/CDC-style fact sheets) using hybrid
                search, then answered with cited sources. It coaches fitness,
                nutrition, mental wellness, and lifestyle habits, and answers
                health questions with a medical disclaimer. When a device is
                selected, the child&apos;s typing-behavior screening signals are
                fused into the answer for supportive nuance. Every answer
                includes evidence, a confidence score, and a disclaimer.
              </p>
            </section>

            <section className="card" style={{ padding: 20, borderRadius: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <ShieldCheck size={18} color="#16A34A" />
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Safety first</p>
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                This assistant is for general health education, not diagnosis or
                treatment. A crisis filter runs before every response. In an
                emergency, call your local emergency number.
              </p>
            </section>

            <section className="card" style={{ padding: 20, borderRadius: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Activity size={18} color="#F59E0B" />
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Try asking</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} disabled={loading}
                    style={{ textAlign: 'left', fontSize: 12.5, lineHeight: 1.5, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {s}
                  </button>
                ))}
              </div>
            </section>
          </aside>

          {/* Chat window */}
          <section className="card" style={{ borderRadius: 24, display: 'flex', flexDirection: 'column', minHeight: '72vh', overflow: 'hidden' }}>
            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', maxHeight: '62vh', background: '#F2F2F7' }}>
              {messages.length === 0 && !loading && (
                <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 380, padding: '40px 20px' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 20, background: 'rgba(11,112,209,0.1)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
                    <HeartPulse size={26} color="#0B70D1" />
                  </div>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Ask about symptoms, first aid, or healthy habits</p>
                  <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                    Evidence-backed answers with sources and a confidence score.
                  </p>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%',
                    padding: '14px 18px',
                    borderRadius: 18,
                    background: m.role === 'user' ? '#0A0A0A' : '#FFFFFF',
                    color: m.role === 'user' ? '#FFFFFF' : '#000000',
                    border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  }}>
                    {m.role === 'user' ? (
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{m.prompt}</p>
                    ) : m.error ? (
                      <p style={{ margin: 0, fontSize: 14, color: '#EF4444' }}>⚠️ {m.error}</p>
                    ) : m.result ? (
                      <div>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.result.answer}</p>

                        {m.result.context && (
                          <div style={{ marginTop: 12, borderTop: '1px solid #E5E5E5', paddingTop: 10 }}>
                            <p style={{ margin: '0 0 8px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8E8E93', fontWeight: 700 }}>
                              Fused behavioral context
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {m.result.context.profile && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#555' }}>
                                  <Activity size={12} color="#0B70D1" />
                                  {m.result.context.profile.device_name} ({m.result.context.profile.platform})
                                </div>
                              )}
                              {m.result.context.typing_drivers && m.result.context.typing_drivers.length > 0 && (
                                <div style={{ fontSize: 11.5, lineHeight: 1.6, color: '#555' }}>
                                  <span style={{ fontWeight: 700, color: '#0B70D1' }}>Typing pattern: </span>
                                  {m.result.context.typing_drivers.join(', ')}
                                </div>
                              )}
                              {m.result.context.behavioral && Object.keys(m.result.context.behavioral).length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {Object.entries(m.result.context.behavioral).map(([k, v]) => {
                                    const label = k.replace(/_/g, ' ')
                                    return (
                                      <span key={k} style={{
                                        fontSize: 10.5, padding: '3px 10px', borderRadius: 20,
                                        border: `1.5px solid ${v.flagged ? '#F59E0B' : '#D1D1D6'}`,
                                        color: v.flagged ? '#B45309' : '#6B6B6B', fontWeight: 600,
                                      }}>
                                        {label} · {Math.round((v.score ?? 0) * 100)}%
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: 10.5, lineHeight: 1.5, color: '#8E8E93' }}>
                              Screening signals from typing metadata only — never a diagnosis.
                            </p>
                          </div>
                        )}

                        {m.result.evidence && m.result.evidence.length > 0 && (
                          <div style={{ marginTop: 14, borderTop: '1px solid #E5E5E5', paddingTop: 12 }}>
                            <button onClick={() => toggleExpand(i)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                              <ChevronDown size={15} style={{ transform: expanded[i] ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                              <span style={{ fontSize: 12.5, fontWeight: 700 }}>Evidence · {m.result.evidence.length} sources · Confidence {pct(m.result.confidence)}</span>
                            </button>
                            <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: '#E5E5E5', overflow: 'hidden' }}>
                              <div style={{ width: pct(m.result.confidence), height: '100%', background: m.result.confidence >= 0.7 ? '#16A34A' : m.result.confidence >= 0.4 ? '#F59E0B' : '#EF4444', transition: 'width 0.3s' }} />
                            </div>
                            {expanded[i] && (
                              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {m.result.evidence.map((e, j) => (
                                  <div key={j} style={{ background: '#F7F7F8', borderRadius: 10, padding: '10px 12px' }}>
                                    <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: '#0B70D1', marginBottom: 4 }}>
                                      {e.source} · page {e.page} · {Math.round(e.score * 100)}% match
                                    </p>
                                    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: '#555' }}>{e.chunk}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            <p style={{ margin: '10px 0 0', fontSize: 10.5, lineHeight: 1.5, color: '#8E8E93' }}>
                              {m.result.disclaimer}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ maxWidth: '80%', padding: '14px 18px', borderRadius: 18, background: '#FFFFFF', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Searching the medical library…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div style={{ padding: 16, borderTop: '1px solid var(--border)', background: '#FAFAFB', display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') send() }}
                placeholder="Ask a health question… (e.g. 'What should I do for a sprained ankle?')"
                className="prism-input"
                style={{ flex: 1, padding: '13px 16px', borderRadius: 12, border: '1.5px solid var(--border)', fontFamily: 'inherit', fontSize: 14, background: '#fff' }}
              />
              <button onClick={() => send()} disabled={loading || !input.trim()}
                style={{ width: 48, height: 48, borderRadius: 14, background: '#0A0A0A', color: '#fff', border: 'none', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', opacity: loading || !input.trim() ? 0.5 : 1, display: 'grid', placeItems: 'center' }}>
                {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
