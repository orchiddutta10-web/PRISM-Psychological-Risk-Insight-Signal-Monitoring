'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react'

interface Persona {
  id: string
  name: string
  display_name: string
  description: string
}

const API = 'http://localhost:8000/api/v1'

export default function CompanionPage() {
  const router = useRouter()
  const [guardianName, setGuardianName] = useState('Guardian')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    if (!token) {
      router.push('/')
      return
    }

    const guardian = localStorage.getItem('prism_guardian')
    if (guardian) {
      try {
        const parsed = JSON.parse(guardian)
        setGuardianName(parsed.full_name || 'Guardian')
      } catch {
        setGuardianName('Guardian')
      }
    }

    const fetchPersonas = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API}/companion/personas`)
        if (!res.ok) {
          throw new Error('Failed to load companion personas.')
        }
        const data = await res.json()
        setPersonas(data)
        setSelectedPersona(data[0] || null)
      } catch (err: any) {
        setError(err.message || 'Unable to load companion personas.')
      } finally {
        setLoading(false)
      }
    }

    fetchPersonas()
  }, [router])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1260, margin: '0 auto' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-muted)' }}>AI Companion</p>
            <h1 style={{ margin: '10px 0 0', fontSize: 36, lineHeight: 1.05 }}>Companion personas for supportive conversations</h1>
            <p style={{ margin: '12px 0 0', fontSize: 15, color: 'var(--text-secondary)', maxWidth: 760 }}>
              Review the five persona styles your teen can choose from in the PRISM app. These companion prompts are designed to keep support safe, consent-aware, and aligned with the teen&apos;s comfort.
            </p>
          </div>
          <button onClick={() => router.push('/overview')} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px' }}>
            <ArrowLeft size={16} /> Back to Overview
          </button>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, marginBottom: 28 }}>
          <div style={{ display: 'grid', gap: 18 }}>
            <div className="card" style={{ padding: 28, borderRadius: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 16, background: 'rgba(96,165,250,0.15)', display: 'grid', placeItems: 'center' }}>
                  <Sparkles size={22} color="#2563EB" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>How it works</p>
                  <h2 style={{ margin: '8px 0 0', fontSize: 22, lineHeight: 1.2 }}>Five distinct companion styles, one shared safety core.</h2>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                PRISM companion personas share a common safety wrapper, but each one uses a different supportive tone and structure. The teen&apos;s device uses these personas during in-app chat, while the guardian dashboard lets you review the available styles and the consent state that enables them.
              </p>
            </div>

            <div className="card" style={{ padding: 28, borderRadius: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 16, background: 'rgba(16,185,129,0.15)', display: 'grid', placeItems: 'center' }}>
                  <ShieldCheck size={22} color="#047857" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>Safety first</p>
                  <h2 style={{ margin: '8px 0 0', fontSize: 22, lineHeight: 1.2 }}>Shared safety rules are embedded across all personas.</h2>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                Every companion persona is built on the same safety wrapper, with explicit disclosure that the AI is not a licensed therapist and crisis detection baked into the flow. This page shows the personality styles while the actual chat remains teen-facing.
              </p>
            </div>
          </div>

          <div className="card" style={{ padding: 28, borderRadius: 24, gap: 14, display: 'grid' }}>
            <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>Your session library</p>
            <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.2 }}>Child device companion sessions</h2>
            <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              The guardian dashboard can review persona setup and consent, but companion chat sessions are anchored to the registered child device itself.
            </p>
            <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: 16, background: 'rgba(248,250,252,1)', border: '1px solid var(--border)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Guardian</p>
                  <p style={{ margin: '6px 0 0', fontWeight: 700, color: 'var(--text-primary)' }}>{guardianName}</p>
                </div>
                <span style={{ fontSize: 12, padding: '6px 10px', borderRadius: 999, background: 'var(--gray-200)', color: 'var(--gray-700)', fontWeight: 700 }}>Dashboard view</span>
              </div>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>Companion personas</p>
              <h2 style={{ margin: '8px 0 0', fontSize: 28, lineHeight: 1.1 }}>Choose the style you want to review</h2>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <MessageCircle size={18} />
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loaded from PRISM companion API</span>
            </div>
          </div>

          {loading ? (
            <div className="card" style={{ padding: 28, borderRadius: 24, minHeight: 220, display: 'grid', placeItems: 'center' }}>
              <p style={{ margin: 0, fontSize: 15, color: 'var(--text-muted)' }}>Loading personas…</p>
            </div>
          ) : error ? (
            <div className="card" style={{ padding: 28, borderRadius: 24, background: 'rgba(254,226,226,1)', border: '1px solid #FECACA' }}>
              <p style={{ margin: 0, fontSize: 15, color: '#B91C1C' }}>{error}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18 }}>
                {personas.map(persona => (
                  <button
                    key={persona.id}
                    onClick={() => setSelectedPersona(persona)}
                    style={{
                      textAlign: 'left', borderRadius: 20, border: persona.id === selectedPersona?.id ? '2px solid #2563EB' : '1px solid var(--border)',
                      padding: 22, background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text-primary)',
                      boxShadow: persona.id === selectedPersona?.id ? '0 18px 45px rgba(37,99,235,0.12)' : 'none', transition: 'all 0.2s ease',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>{persona.display_name}</p>
                    <h3 style={{ margin: '12px 0 0', fontSize: 18, lineHeight: 1.2 }}>{persona.description}</h3>
                    <p style={{ margin: '16px 0 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                      Review this persona&apos;s approach and tone in the companion chat flow.
                    </p>
                  </button>
                ))}
              </div>

              {selectedPersona && (
                <div className="card" style={{ padding: 28, borderRadius: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 16, background: 'rgba(59,130,246,0.12)', display: 'grid', placeItems: 'center' }}>
                      <MessageCircle size={20} color="#0B61D1" />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{selectedPersona.display_name}</p>
                      <h3 style={{ margin: '8px 0 0', fontSize: 24 }}>{selectedPersona.description}</h3>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {selectedPersona.display_name} uses a unique supportive style within the PRISM companion ecosystem. The teen chooses this persona in-app, and the companion chat keeps the same shared safety boundaries no matter which persona is active.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
