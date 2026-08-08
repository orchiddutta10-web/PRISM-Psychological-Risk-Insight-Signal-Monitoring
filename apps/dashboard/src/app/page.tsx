'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, User, Shield, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Float, MeshDistortMaterial } from '@react-three/drei'

const API = 'http://localhost:8000/api/v1'

// --- 3D PRISM CRYSTAL COMPONENT ---
function PrismCrystal() {
  const meshRef = useRef<any>(null)
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.2
      meshRef.current.rotation.z += delta * 0.1
    }
  })

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={2}>
      <mesh ref={meshRef}>
        <octahedronGeometry args={[2, 0]} />
        <MeshDistortMaterial
          color="#6366f1"
          envMapIntensity={2}
          clearcoat={1}
          clearcoatRoughness={0.1}
          metalness={0.9}
          roughness={0.1}
          distort={0.2}
          speed={2}
          transparent
          opacity={0.85}
        />
      </mesh>
    </Float>
  )
}

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
    if (typeof window !== 'undefined' && localStorage.getItem('prism_token')) {
      router.push('/overview')
    }
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
    <div className="flex min-h-screen bg-zinc-950 font-sans text-white selection:bg-indigo-500/30 overflow-hidden">
      
      {/* ── LEFT HERO PANEL (3D) ──────────────────────────────── */}
      <div className="hidden lg:flex w-[55%] relative flex-col justify-between p-16 border-r border-white/5">
        
        {/* Deep Space Animated Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-indigo-600/20 blur-[120px] mix-blend-screen animate-pulse duration-[8000ms]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-rose-500/10 blur-[150px] mix-blend-screen" />
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
        </div>

        {/* 3D Canvas Layer */}
        <div className="absolute inset-0 z-10 opacity-80 pointer-events-none">
          <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            <Environment preset="city" />
            <PrismCrystal />
          </Canvas>
        </div>

        {/* Branding Overlay */}
        <div className="relative z-20">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3 mb-16"
          >
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-white/90 shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
              <div className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
            </div>
            <span className="font-extrabold text-xl tracking-[0.25em] text-white">PRISM</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-indigo-400 text-[11px] tracking-[0.2em] uppercase font-bold mb-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              Intelligent Command Center
            </p>
            <h1 className="text-[4rem] font-extrabold leading-[1.05] tracking-tighter mb-8">
              Protecting<br />their future,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-rose-300">transparently.</span>
            </h1>
            <p className="text-white/60 text-lg leading-relaxed max-w-md font-medium">
              Behavior patterns, encrypted sleep signals, and real-time insights — delivered with absolute privacy.
            </p>
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="relative z-20 flex flex-col gap-5 mt-12"
        >
          {[
            'Metadata only — zero message content ever read.',
            'Teen can pause monitoring at any time.',
            'End-to-end encrypted data transmission.',
          ].map((t, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center shrink-0 bg-white/5 backdrop-blur-md shadow-[0_0_10px_rgba(255,255,255,0.05)]">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              </div>
              <span className="text-white/50 text-sm font-medium tracking-wide">{t}</span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* ── RIGHT FORM PANEL ─────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative bg-zinc-950">
        
        {/* Ambient Glow behind the form */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-indigo-900/10 blur-[100px] pointer-events-none" />

        <div className="w-full max-w-[420px] relative z-10">
          
          <motion.div 
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-10 text-center lg:text-left"
          >
            <h2 className="text-3xl font-extrabold text-white tracking-tight mb-2">
              {mode === 'signin' ? 'Welcome back' : 'Create an account'}
            </h2>
            <p className="text-sm text-zinc-400 font-medium">
              {mode === 'signin'
                ? 'Sign in to access your secure guardian dashboard.'
                : 'Set up your PRISM guardian account in seconds.'}
            </p>
          </motion.div>

          {/* Alerts */}
          <AnimatePresence mode="popLayout">
            {error && (
              <motion.div 
                key="error"
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex gap-3 items-start backdrop-blur-sm"
              >
                <Shield className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                <span className="text-sm text-red-200 leading-relaxed font-medium">{error}</span>
              </motion.div>
            )}
            {success && (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-6 flex gap-3 items-center backdrop-blur-sm"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <ArrowRight className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm text-emerald-200 font-medium">{success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <motion.form layout onSubmit={handleSubmit} className="space-y-4 mb-8">
            <AnimatePresence mode="popLayout">
              {mode === 'signup' && (
                <motion.div
                  key="fullname"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <Field icon={<User className="w-4 h-4 text-zinc-500" />} label="Full Name">
                    <input type="text" required placeholder="John Doe" value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-zinc-900/50 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner backdrop-blur-md" />
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>

            <Field icon={<Mail className="w-4 h-4 text-zinc-500" />} label="Email address">
              <input type="email" required placeholder="name@example.com" value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-zinc-900/50 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner backdrop-blur-md" />
            </Field>

            <Field icon={<Lock className="w-4 h-4 text-zinc-500" />} label="Password"
              right={
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }>
              <input type={showPass ? 'text' : 'password'} required placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-11 pr-10 py-3.5 bg-zinc-900/50 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner backdrop-blur-md" />
            </Field>

            <AnimatePresence mode="popLayout">
              {mode === 'signup' && (
                <motion.div
                  key="role"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <Field icon={<Shield className="w-4 h-4 text-zinc-500" />} label="Role">
                    <select value={role} onChange={e => setRole(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-zinc-900/50 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner backdrop-blur-md appearance-none cursor-pointer">
                      <option value="guardian">Guardian (Standard)</option>
                      <option value="guardian-admin">Guardian-Admin (Audit Access)</option>
                    </select>
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button 
              layout
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="submit" disabled={loading}
              className="w-full mt-2 py-3.5 px-4 bg-white hover:bg-zinc-200 text-zinc-900 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Authenticating…</>
                : <>{mode === 'signin' ? 'Sign In' : 'Create Account'} <ArrowRight className="w-4 h-4" /></>
              }
            </motion.button>
          </motion.form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-8 opacity-50">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">or continue with</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Social */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <SocialBtn provider="Google" loading={socialLoading === 'Google'} disabled={!!socialLoading || loading} onClick={() => handleSocial('Google')}
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              }
            />
            <SocialBtn provider="Apple" loading={socialLoading === 'Apple'} disabled={!!socialLoading || loading} onClick={() => handleSocial('Apple')}
              icon={
                <svg className="w-4 h-4 text-white" viewBox="0 0 814 1000" fill="currentColor">
                  <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 436 45.8 281.3 51.3 226.5c9.4-86.8 68-132.5 122.1-149.6 34.4-10.6 83.9-22.5 136.5-22.5 42 0 95 9.4 136.5 39.7C486.7 124.3 535 134 583.9 134c27.8 0 119.2-14.7 163.4-60.6 26.8-28.3 53.6-38.2 100.1-38.2l-59.3 305.7z"/>
                </svg>
              }
            />
          </div>

          {/* Toggle */}
          <motion.p layout className="text-center text-sm text-zinc-500 font-medium mt-4">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess('') }}
              className="font-bold text-white hover:text-indigo-300 transition-colors">
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </motion.p>
        </div>
      </div>
    </div>
  )
}

function Field({ icon, label, children, right }: { icon: React.ReactNode; label: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wider font-bold text-zinc-400 ml-1">{label}</label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          {icon}
        </div>
        {children}
        {right}
      </div>
    </div>
  )
}

function SocialBtn({ provider, loading, disabled, onClick, icon }: { provider: string; loading: boolean; disabled: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <motion.button 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick} disabled={disabled || loading} 
      className="flex items-center justify-center gap-3 w-full h-12 bg-zinc-900/50 border border-white/10 backdrop-blur-md rounded-xl text-sm font-semibold text-white transition-colors hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed shadow-inner"
    >
      {loading
        ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
        : icon
      }
      <span>{provider}</span>
    </motion.button>
  )
}
