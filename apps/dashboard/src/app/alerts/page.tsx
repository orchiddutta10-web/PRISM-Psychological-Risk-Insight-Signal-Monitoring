'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, ArrowLeft, Inbox, ShieldAlert, Cpu } from 'lucide-react'

export default function AlertsPage() {
  const router = useRouter()
  const [guardianName, setGuardianName] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    const guardianStr = localStorage.getItem('prism_guardian')
    if (!token || !guardianStr) {
      router.push('/')
      return
    }
    const guardian = JSON.parse(guardianStr)
    setGuardianName(guardian.full_name)
  }, [router])

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

        <div className="card" style={{ padding: 32, borderRadius: 24, boxShadow: '0 35px 100px rgba(15, 23, 42, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 20 }}>
            <div style={{ width: 58, height: 58, borderRadius: 18, background: 'rgba(59,130,246,0.1)', display: 'grid', placeItems: 'center' }}>
              <Inbox className="h-6 w-6" color="#0B70D1" strokeWidth={2} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-muted)' }}>Alert inbox</p>
              <h2 style={{ margin: '10px 0 0', fontSize: 28, fontWeight: 700 }}>Alert Inbox Empty</h2>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)', maxWidth: 760 }}>
            Your teen&apos;s behavioral baseline is currently stable. No alerts or deviations have been flagged.
          </p>

          <div style={{ marginTop: 32, display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'start', padding: 24, borderRadius: 22, background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)' }}>
              <div style={{ width: 38, height: 38, borderRadius: 14, background: 'rgba(16,185,129,0.12)', display: 'grid', placeItems: 'center' }}>
                <Cpu className="h-5 w-5" color="#10B981" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-muted)' }}>Phase 1 Integration Active</p>
                <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
                  This interface represents the empty-state template for behavioral alerts. Telemetry signals are being ingested and stored securely, but the ML scoring engine is not active yet.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'start', padding: 24, borderRadius: 22, background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)' }}>
              <div style={{ width: 38, height: 38, borderRadius: 14, background: 'rgba(59,130,246,0.12)', display: 'grid', placeItems: 'center' }}>
                <ShieldAlert className="h-5 w-5" color="#0B70D1" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-muted)' }}>Privacy & Security Disclosures</p>
                <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
                  All alerts will follow the strict PRISM privacy guidelines. When the ML Engine detects significant deviations in physical movement, app category shifts, or typing cadence, an alert will be displayed with human-readable contributing factors. No black-box diagnostic scores or raw communication content will ever be displayed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
