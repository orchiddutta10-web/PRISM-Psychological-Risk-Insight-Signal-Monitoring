'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, User, Shield, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import { API } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('guardian')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<'Google' | 'Apple' | null>(null)

  useEffect(() => {
    if (localStorage.getItem('prism_token')) router.push('/overview')
  }, [router])

  const post = async (path: string, body: object) => {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(
      Array.isArray(data.detail)
        ? data.detail.map((d: any) => d.msg).join('. ')
        : data.detail || 'Something went wrong'
    )
    return data
  }

  const save = (data: any) => {
    localStorage.setItem('prism_token', data.access_token)
    localStorage.setItem('prism_guardian', JSON.stringify(data.user))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      if (mode === 'signup') {
        await post('/auth/register', { full_name: fullName, email, password, role })
        setSuccess('Account created! Signing you in…')
      }
      const data = await post('/auth/login', { email, password })
      save(data)
      router.push('/overview')
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleSocial = async (provider: 'Google' | 'Apple') => {
    setError(''); setSocialLoading(provider)
    const uid = Math.random().toString(36).slice(2, 8)
    const demoEmail = `${provider.toLowerCase()}.${uid}@gmail.com`
    const demoPass = 'PrismDemo2024!'
    try {
      await post('/auth/register', { full_name: `${provider} User`, email: demoEmail, password: demoPass, role: 'guardian' })
      const data = await post('/auth/login', { email: demoEmail, password: demoPass })
      save(data)
      router.push('/overview')
    } catch (err: any) { setError(err.message) }
    finally { setSocialLoading(null) }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", background: '#F9F9F8' }}>

      {/* ── LEFT BRAND PANEL ──────────────────────────────────── */}
      <div style={{
        width: 480, flexShrink: 0, background: '#0A0A0A', display: 'flex',
        flexDirection: 'column', justifyContent: 'space-between', padding: '48px 52px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background decoration — overlapping translucent circles */}
        {[
          { size: 320, top: -80, right: -80, opacity: 0.04 },
          { size: 200, top: 60, right: 20, opacity: 0.06 },
          { size: 160, top: 160, right: -40, opacity: 0.04 },
          { size: 400, bottom: -120, left: -100, opacity: 0.03 },
        ].map((c, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: c.size, height: c.size,
            top: c.top, bottom: c.bottom, left: c.left, right: c.right,
            borderRadius: '50%',
            border: '1.5px solid rgba(255,255,255,0.6)',
            opacity: c.opacity,
            pointerEvents: 'none',
          }} />
        ))}

        {/* Logo */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 72 }}>
            <div style={{ position: 'relative', width: 32, height: 32 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.9)' }} />
              <div style={{ position: 'absolute', top: 6, left: 6, width: 14, height: 14, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.4)' }} />
            </div>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 18, letterSpacing: '0.18em' }}>PRISM</span>
          </div>

          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 20 }}>
            Guardian Dashboard
          </p>
          <h1 style={{ color: '#fff', fontSize: 42, fontWeight: 800, lineHeight: 1.1, marginBottom: 24, letterSpacing: '-0.02em' }}>
            Your family&apos;s<br />wellbeing,<br />made clear.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, lineHeight: 1.75 }}>
            Behavior patterns, sleep signals, and real-time insights — explained simply. Privacy-first, always.
          </p>
        </div>

        {/* Trust points */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            'Metadata only — no message content ever read',
            'Teen can pause or review monitoring anytime',
            'All data encrypted end-to-end in transit',
            'WCAG 2.1 AA accessible interface',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }} />
              </div>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ─────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Heading */}
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#0A0A0A', letterSpacing: '-0.02em', marginBottom: 8 }}>
              {mode === 'signin' ? 'Welcome back' : 'Create account'}
            </h2>
            <p style={{ fontSize: 15, color: '#6B6B6B' }}>
              {mode === 'signin'
                ? 'Sign in to your guardian dashboard.'
                : 'Set up your PRISM guardian account in seconds.'}
            </p>
          </div>

          {/* Error / Success */}
          {error && (
            <div style={{ background: '#FFF5F5', border: '1px solid #E8C8C8', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>⚠</span>
              <span style={{ fontSize: 13, color: '#5A2020', lineHeight: 1.5 }}>{error}</span>
            </div>
          )}
          {success && (
            <div style={{ background: '#F2FAF5', border: '1px solid #B8DEC9', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 15 }}>✓</span>
              <span style={{ fontSize: 13, color: '#1A4A2E' }}>{success}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              {mode === 'signup' && (
                <Field icon={<User size={15} color="#AEAEB2" />} label="Full Name">
                  <input type="text" required placeholder="Your full name" value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    style={inputStyle} onFocus={e => e.target.style.borderColor = '#0A0A0A'}
                    onBlur={e => e.target.style.borderColor = '#E5E5E5'}
                    suppressHydrationWarning />
                </Field>
              )}

              <Field icon={<Mail size={15} color="#AEAEB2" />} label="Email">
                <input type="email" required placeholder="your@email.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={inputStyle} onFocus={e => e.target.style.borderColor = '#0A0A0A'}
                  onBlur={e => e.target.style.borderColor = '#E5E5E5'}
                  suppressHydrationWarning />
              </Field>

              <Field icon={<Lock size={15} color="#AEAEB2" />} label="Password"
                right={
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#AEAEB2', padding: 0 }}>
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }>
                <input type={showPass ? 'text' : 'password'} required placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={e => e.target.style.borderColor = '#0A0A0A'}
                  onBlur={e => e.target.style.borderColor = '#E5E5E5'}
                  suppressHydrationWarning />
              </Field>

              {mode === 'signup' && (
                <Field icon={<Shield size={15} color="#AEAEB2" />} label="Role">
                  <select value={role} onChange={e => setRole(e.target.value)}
                    style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                    <option value="guardian">Guardian (Standard)</option>
                    <option value="guardian-admin">Guardian-Admin (Audit Access)</option>
                  </select>
                </Field>
              )}
            </div>

            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '14px 20px', background: loading ? '#555' : '#0A0A0A',
                color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8, transition: 'all 0.15s', letterSpacing: '-0.01em',
              }}>
              {loading
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Authenticating…</>
                : <>{mode === 'signin' ? 'Sign In' : 'Create Account'} <ArrowRight size={16} /></>
              }
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#E8E8E8' }} />
            <span style={{ fontSize: 12, color: '#AEAEB2', whiteSpace: 'nowrap' }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: '#E8E8E8' }} />
          </div>

          {/* Social */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
            <SocialBtn provider="Google" loading={socialLoading === 'Google'} disabled={!!socialLoading || loading} onClick={() => handleSocial('Google')}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              }
            />
            <SocialBtn provider="Apple" loading={socialLoading === 'Apple'} disabled={!!socialLoading || loading} onClick={() => handleSocial('Apple')}
              icon={
                <svg width="20" height="20" viewBox="0 0 814 1000" fill="currentColor">
                  <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 436 45.8 281.3 51.3 226.5c9.4-86.8 68-132.5 122.1-149.6 34.4-10.6 83.9-22.5 136.5-22.5 42 0 95 9.4 136.5 39.7C486.7 124.3 535 134 583.9 134c27.8 0 119.2-14.7 163.4-60.6 26.8-28.3 53.6-38.2 100.1-38.2l-59.3 305.7z"/>
                </svg>
              }
            />
          </div>

          {/* Toggle */}
          <p style={{ textAlign: 'center', fontSize: 14, color: '#6B6B6B' }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#0A0A0A', fontSize: 14, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>

      {/* moved global styles and fonts to globals.css to avoid hydration mismatches */}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 16px 13px 44px',
  border: '1.5px solid #E5E5E5', borderRadius: 10,
  fontSize: 14, color: '#0A0A0A', background: '#fff',
  outline: 'none', transition: 'border-color 0.15s',
  fontFamily: 'inherit',
}

function Field({ icon, label, children, right }: { icon: React.ReactNode; label: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#3A3A3A', display: 'block', marginBottom: 6, letterSpacing: '0.01em' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>{icon}</div>
        {children}
        {right}
      </div>
    </div>
  )
}

function SocialBtn({ provider, loading, disabled, onClick, icon }: { provider: string; loading: boolean; disabled: boolean; onClick: () => void; icon: React.ReactNode }) {
  const isApple = provider === 'Apple'
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      width: '100%', minHeight: 50, padding: '12px 16px', border: `1.5px solid ${isApple ? '#111' : '#E5E5E5'}`,
      borderRadius: 10,
      background: isApple ? '#111' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14,
      fontWeight: 600, color: isApple ? '#fff' : '#0A0A0A', transition: 'all 0.15s',
      opacity: disabled ? 0.6 : 1, fontFamily: 'inherit',
    }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.borderColor = isApple ? '#fff' : '#0A0A0A' }}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = isApple ? '#111' : '#E5E5E5'}
    >
      {loading
        ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
        : <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, minHeight: 20 }}>{icon}</span>
      }
      <span style={{ lineHeight: 1 }}>{provider}</span>
    </button>
  )
}
