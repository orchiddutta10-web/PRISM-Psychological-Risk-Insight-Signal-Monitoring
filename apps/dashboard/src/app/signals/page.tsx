'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3, Bell, ShieldCheck } from 'lucide-react'

const SIGNALS = [
  { label: 'Screen Time', value: '210 min/day', status: 'Normal', icon: BarChart3 },
  { label: 'Bedtime', value: '22.5 hr', status: 'Normal', icon: ShieldCheck },
  { label: 'Daily Steps', value: '5,900 steps', status: 'Needs review', icon: BarChart3 },
  { label: 'Typing Pace', value: '97 WPM', status: 'Normal', icon: BarChart3 },
]

export default function SignalsPage() {
  const router = useRouter()
  const [guardian, setGuardian] = useState('Guardian')

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    if (!token) return router.push('/')
    const stored = localStorage.getItem('prism_guardian')
    if (stored) {
      try { setGuardian(JSON.parse(stored).full_name || 'Guardian') } catch {} 
    }
  }, [router])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 24 }}>
          <div>
            <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, color: 'var(--text-muted)' }}>Signals</p>
            <h1 style={{ margin: '10px 0 0', fontSize: 32, lineHeight: 1.1 }}>Telemetry signal overview</h1>
          </div>
          <div style={{ textAlign: 'right', minWidth: 160 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Guardian</p>
            <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 700 }}>{guardian}</p>
          </div>
        </header>

        <button type="button" onClick={() => router.push('/overview')} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <ArrowLeft className="h-4 w-4" /> Back to Overview
        </button>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {SIGNALS.map(signal => (
            <div key={signal.label} className="card" style={{ padding: 24, minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 12, color: 'var(--text-muted)' }}>{signal.label}</p>
                <p style={{ margin: '18px 0 0', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{signal.value}</p>
              </div>
              <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderRadius: 16, background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Status</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: signal.status === 'Normal' ? '#16A34A' : '#F59E0B' }}>{signal.status}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="card" style={{ marginTop: 32, padding: 24, display: 'flex', gap: 20, alignItems: 'flex-start', borderRadius: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(59,130,246,0.1)', display: 'grid', placeItems: 'center' }}>
            <Bell size={24} color='#0B70D1' />
          </div>
          <div>
            <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, color: 'var(--text-muted)' }}>What happens next</p>
            <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              As soon as PRISM detects signal deviations, alerts will populate in the Alerts tab. These alerts are generated from changes in app usage, sleep window, movement, or typing metadata — never message or audio content.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
