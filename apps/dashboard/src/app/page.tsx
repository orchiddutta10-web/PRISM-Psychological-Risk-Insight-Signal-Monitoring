'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Mail, Lock, User, Shield, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'

function resolveApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL
  if (!raw || raw.trim() === '') return '/api/v1'
  const trimmed = raw.replace(/\/$/, '')
  if (trimmed.endsWith('/api/v1')) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return `${trimmed}/api/v1`
  return trimmed
}

const API = resolveApiBase()

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
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')

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
    if (!data?.access_token || !data?.user) {
      throw new Error('Login did not return a session token. Complete MFA if prompted.')
    }
    localStorage.setItem('prism_token', data.access_token)
    localStorage.setItem('prism_guardian', JSON.stringify(data.user))
  }

  const completeLogin = async (data: any) => {
    if (data?.mfa_required) {
      if (!data.mfa_token) throw new Error('MFA required but no challenge token was issued.')
      setMfaToken(data.mfa_token)
      setSuccess('Enter the 6-digit MFA code to finish signing in.')
      return null
    }
    save(data)
    return data.access_token as string
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      if (mfaToken) {
        const data = await post('/auth/mfa/verify', { mfa_token: mfaToken, otp_code: mfaCode })
        save(data)
        setMfaToken(null)
        setMfaCode('')
        router.push('/overview')
        return
      }
      if (mode === 'signup') {
        await post('/auth/register', { full_name: fullName, email, password, role })
        setSuccess('Account created! Signing you in…')
      }
      const data = await post('/auth/login', { email, password })
      const token = await completeLogin(data)
      if (token) router.push('/overview')
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
      const tk = await completeLogin(data)
      if (!tk) return
      const devRes = await fetch(`${API}/auth/device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tk}` },
        body: JSON.stringify({ name: "Demo Teen (Simulator)", platform: "android", device_token: `mock-fcm-${uid}` })
      })
      
      if (devRes.ok) {
        const devData = await devRes.json();
        const devId = devData.device.id;
        localStorage.setItem('prism_selected_device', devId);
        
        // Setup initial consent
        await fetch(`${API}/consent/grants/${devId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tk}` },
          body: JSON.stringify({ modality: "location", is_granted: true })
        });
        
        // Trigger a demo scenario to generate initial data
        await fetch(`${API}/events/demo-trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tk}` },
          body: JSON.stringify({ device_id: devId, scenario: 'A' })
        });
      }

      router.push('/overview')
    } catch (err: any) { setError(err.message) }
    finally { setSocialLoading(null) }
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-zinc-950 font-sans text-white selection:bg-indigo-500/30">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[20%] h-[70%] w-[70%] rounded-full bg-indigo-600/20 blur-[120px] mix-blend-screen animate-pulse duration-[8000ms]" />
        <div className="absolute -bottom-[20%] -right-[10%] h-[60%] w-[60%] rounded-full bg-rose-500/10 blur-[150px] mix-blend-screen" />
        <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <section className="relative z-10 hidden w-[55%] flex-col justify-between border-r border-white/5 p-12 lg:flex xl:p-16">
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            animate={{ rotate: 360, y: [0, -18, 0] }}
            transition={{ rotate: { duration: 24, repeat: Infinity, ease: 'linear' }, y: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }}
            className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-indigo-300/30 bg-indigo-500/10 shadow-[0_0_100px_rgba(99,102,241,0.35)] backdrop-blur-sm"
            aria-hidden="true"
          >
            <div className="absolute inset-8 border border-white/20" />
            <div className="absolute inset-16 rounded-full border border-rose-300/20" />
          </motion.div>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.15, 0.45, 0.15], scale: [1, 1.08, 1] }}
              transition={{ duration: 5 + i, repeat: Infinity, delay: i * 0.7 }}
              className="absolute left-1/2 top-1/2 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10"
              style={{ transform: `translate(-50%, -50%) scale(${1 + i * 0.22})` }}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className="relative">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-16 flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/80 shadow-[0_0_18px_rgba(255,255,255,0.25)]">
              <div className="h-4 w-4 rounded-full border border-white/50" />
            </div>
            <span className="text-xl font-extrabold tracking-[0.25em]">PRISM</span>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <p className="mb-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-300">
              <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.9)]" /> Intelligent command center
            </p>
            <h1 className="mb-8 text-5xl font-extrabold leading-[1.02] tracking-[-0.06em] xl:text-7xl">
              Protecting<br />their future,<br /><span className="bg-gradient-to-r from-indigo-200 via-white to-rose-200 bg-clip-text text-transparent">transparently.</span>
            </h1>
            <p className="max-w-md text-lg font-medium leading-relaxed text-white/55">Behavior patterns, encrypted sleep signals, and real-time insights, delivered with absolute privacy.</p>
          </motion.div>
        </div>

        <div className="relative flex flex-col gap-4 text-sm font-medium text-white/45">
          {['Metadata only, zero message content ever read.', 'Teen can pause monitoring at any time.', 'End-to-end encrypted data transmission.'].map((item) => (
            <div key={item} className="flex items-center gap-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5"><span className="h-1.5 w-1.5 rounded-full bg-indigo-300" /></span>
              {item}
            </div>
          ))}
        </div>
      </section>

      <main className="relative z-10 flex flex-1 items-center justify-center bg-zinc-950/70 p-6 sm:p-12">
        <div className="w-full max-w-[420px]">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-300">Guardian access</p>
            <h2 className="mb-2 text-3xl font-extrabold tracking-tight text-white">{mode === 'signin' ? 'Welcome back' : 'Create an account'}</h2>
            <p className="text-sm font-medium text-zinc-400">{mode === 'signin' ? 'Sign in to access your secure guardian dashboard.' : 'Set up your PRISM guardian account in seconds.'}</p>
          </motion.div>

          <AnimatePresence mode="popLayout">
            {error && <motion.div key="error" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-6 flex gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-medium text-red-200"><Shield className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />{error}</motion.div>}
            {success && <motion.div key="success" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-200"><div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"><ArrowRight className="h-3 w-3" /></div>{success}</motion.div>}
          </AnimatePresence>

          <motion.form layout onSubmit={handleSubmit} className="mb-8 space-y-4">
            <AnimatePresence mode="popLayout">
              {mode === 'signup' && <motion.div key="fullname" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><Field icon={<User className="h-4 w-4 text-zinc-500" />} label="Full name"><input type="text" required placeholder="Your full name" value={fullName} onChange={e => setFullName(e.target.value)} className={darkInput} /></Field></motion.div>}
            </AnimatePresence>
            <Field icon={<Mail className="h-4 w-4 text-zinc-500" />} label="Email address"><input type="email" required placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} className={darkInput} /></Field>
            <Field icon={<Lock className="h-4 w-4 text-zinc-500" />} label="Password" right={<button type="button" aria-label={showPass ? 'Hide password' : 'Show password'} onClick={() => setShowPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-zinc-500 hover:text-white">{showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}><input type={showPass ? 'text' : 'password'} required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className={`${darkInput} pr-12`} /></Field>
            <AnimatePresence mode="popLayout">
              {mode === 'signup' && <motion.div key="role" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><Field icon={<Shield className="h-4 w-4 text-zinc-500" />} label="Role"><select value={role} onChange={e => setRole(e.target.value)} className={darkInput}><option value="guardian">Guardian (Standard)</option><option value="guardian-admin">Guardian-Admin (Audit Access)</option></select></Field></motion.div>}
            </AnimatePresence>
            {mfaToken && <Field icon={<Shield className="h-4 w-4 text-zinc-500" />} label="MFA code"><input type="text" inputMode="numeric" pattern="\d{6}" maxLength={6} required placeholder="6-digit code" value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={darkInput} /></Field>}
            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 text-sm font-bold text-zinc-900 shadow-[0_0_24px_rgba(255,255,255,0.1)] transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Authenticating…</> : <>{mfaToken ? 'Verify MFA' : mode === 'signin' ? 'Sign In' : 'Create Account'} <ArrowRight className="h-4 w-4" /></>}</motion.button>
          </motion.form>

          <div className="my-8 flex items-center gap-4 opacity-50"><div className="h-px flex-1 bg-white/10" /><span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">or continue with</span><div className="h-px flex-1 bg-white/10" /></div>
          <div className="mb-8 grid grid-cols-2 gap-4"><SocialBtn provider="Google" loading={socialLoading === 'Google'} disabled={!!socialLoading || loading} onClick={() => handleSocial('Google')} icon={<span className="text-sm">G</span>} /><SocialBtn provider="Apple" loading={socialLoading === 'Apple'} disabled={!!socialLoading || loading} onClick={() => handleSocial('Apple')} icon={<span className="text-sm">●</span>} /></div>
          <motion.p layout className="mt-4 text-center text-sm font-medium text-zinc-500">{mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}<button onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess('') }} className="font-bold text-white hover:text-indigo-300">{mode === 'signin' ? 'Sign Up' : 'Sign In'}</button></motion.p>
        </div>
      </main>
    </div>
  )
}

const darkInput = 'w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3.5 pl-11 text-sm text-white shadow-inner backdrop-blur-md transition-all placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40'

function Field({ icon, label, children, right }: { icon: React.ReactNode; label: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="ml-1 block text-[11px] font-bold uppercase tracking-wider text-zinc-400">{label}</label>
      <div className="relative">
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">{icon}</div>
        {children}
        {right}
      </div>
    </div>
  )
}

function SocialBtn({ provider, loading, disabled, onClick, icon }: { provider: string; loading: boolean; disabled: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onClick} disabled={disabled || loading}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-zinc-900/60 text-sm font-semibold text-white shadow-inner backdrop-blur-md transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : icon}
      <span>{provider}</span>
    </motion.button>
  )
}
