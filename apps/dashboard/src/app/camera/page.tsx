'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CameraPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    if (!token) {
      router.push('/')
    }
  }, [router])

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#fff', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ padding: '20px 28px', borderBottom: '1px solid #2C2C2E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid #fff' }} />
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '0.16em' }}>PRISM</span>
        </div>
        <h1 style={{ fontSize: 16, fontWeight: 700 }}>Live Camera</h1>
        <button
          onClick={() => router.push('/overview')}
          style={{ background: 'transparent', border: '1px solid #2C2C2E', color: '#fff', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}
        >
          Back to Dashboard
        </button>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 28px' }}>
        {error && (
          <div style={{ background: '#2C2C2E', border: '1px solid #F85149', borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <p style={{ margin: 0, color: '#F85149' }}>{error}</p>
          </div>
        )}

        <div style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 16, overflow: 'hidden', aspectRatio: '16/9', position: 'relative' }}>
          <img
            src="/camera/stream"
            alt="Live camera feed"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={() => setError('Camera stream unavailable. Ensure prism_edge is running and a camera is connected.')}
          />
        </div>

        <div style={{ marginTop: 24, padding: 20, background: '#161B22', border: '1px solid #30363D', borderRadius: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Privacy Notice</h2>
          <p style={{ fontSize: 13, color: '#8B949E', lineHeight: 1.6, margin: 0 }}>
            This live view is for real-time monitoring only. No video is recorded or stored on the server.
            Video frames are processed locally on the Raspberry Pi to extract metadata only.
          </p>
        </div>
      </main>
    </div>
  )
}
