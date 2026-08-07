'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, MessageCircle, ShieldCheck, Sparkles, BrainCircuit, Network, Fingerprint, Cpu, ArrowRight } from 'lucide-react'

interface Persona {
  id: string
  name: string
  display_name: string
  description: string
}

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

const PERSONA_THEMES: Record<string, { from: string, to: string, icon: React.ReactNode, glow: string }> = {
  coach: { from: '#6366F1', to: '#8B5CF6', icon: <BrainCircuit />, glow: 'rgba(99,102,241,0.5)' },
  listener: { from: '#EC4899', to: '#F43F5E', icon: <Fingerprint />, glow: 'rgba(236,72,153,0.5)' },
  strategist: { from: '#F59E0B', to: '#D97706', icon: <Network />, glow: 'rgba(245,158,11,0.5)' },
  clinician: { from: '#10B981', to: '#059669', icon: <Cpu />, glow: 'rgba(16,185,129,0.5)' },
  mentor: { from: '#3B82F6', to: '#2563EB', icon: <Sparkles />, glow: 'rgba(59,130,246,0.5)' },
}

// Background animated grid
function FuturisticGrid() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_70%,transparent_100%)]" />
      <motion.div
        animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.1, 1] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-indigo-500/10 blur-[120px]"
      />
      <motion.div
        animate={{ opacity: [0.2, 0.4, 0.2], scale: [1, 1.2, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear", delay: 2 }}
        className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-500/10 blur-[120px]"
      />
    </div>
  )
}

export default function CompanionPage() {
  const router = useRouter()
  const [guardianName, setGuardianName] = useState('Guardian')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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
        if (!res.ok) throw new Error('Failed to load companion architectures.')
        const data = await res.json()
        setPersonas(data)
        setSelectedPersona(data[0] || null)
      } catch (err: any) {
        setError(err.message || 'Unable to connect to Neural Engine.')
      } finally {
        setLoading(false)
      }
    }

    fetchPersonas()
  }, [router])

  return (
    <div className="min-h-full bg-[#030303] text-white font-sans selection:bg-indigo-500/30 overflow-x-hidden relative z-0">
      <FuturisticGrid />

      {/* Glassmorphic Navbar */}
      <header className="relative z-50 px-8 h-20 border-b border-white/5 bg-black/30 backdrop-blur-2xl flex items-center justify-between">
        <div className="flex flex-col">
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/40 mb-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Neural Engine Active
          </p>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/50 tracking-tight">
            Companion Hub
          </h1>
        </div>
        <button 
          onClick={() => router.push('/overview')} 
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 transition-all hover:scale-105 active:scale-95"
        >
          <ArrowLeft size={14} /> System Overview
        </button>
      </header>

      <main className="max-w-[1400px] mx-auto px-8 py-16">
        
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-3xl mb-24"
        >
          <h1 className="text-6xl font-extrabold tracking-tighter leading-[1.1] mb-8">
            Adaptive intelligence.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              Uncompromising safety.
            </span>
          </h1>
          <p className="text-lg text-white/50 leading-relaxed font-medium">
            Explore the five cognitive architectures powering the PRISM companion. Each neural model is sandboxed with mandatory crisis-detection protocols and E2E encryption.
          </p>
        </motion.div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-32">
          {[
            { title: "Dynamic Architecture", desc: "Five distinct conversational modalities.", icon: <Sparkles size={24} />, color: "from-blue-500/20 to-indigo-500/20", border: "border-indigo-500/20", text: "text-indigo-400" },
            { title: "Safety Sandbox", desc: "Zero-tolerance crisis detection wrapper.", icon: <ShieldCheck size={24} />, color: "from-emerald-500/20 to-teal-500/20", border: "border-emerald-500/20", text: "text-emerald-400" },
            { title: "Dashboard Sync", desc: `Anchored to ${guardianName}'s registry.`, icon: <BrainCircuit size={24} />, color: "from-purple-500/20 to-pink-500/20", border: "border-purple-500/20", text: "text-purple-400" }
          ].map((card, i) => (
            <motion.div 
              key={card.title}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + (i * 0.1) }}
              className={`p-8 rounded-[32px] bg-gradient-to-br ${card.color} border ${card.border} backdrop-blur-xl relative overflow-hidden group`}
            >
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className={`w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6 ${card.text} shadow-2xl`}>
                {card.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{card.title}</h3>
              <p className="text-sm text-white/60 font-medium">{card.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Persona Selector Section */}
        <div className="relative">
          <div className="flex items-center gap-4 mb-10">
            <h2 className="text-3xl font-bold tracking-tight">Cognitive Models</h2>
            <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
          </div>

          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 border border-white/5 rounded-[40px] bg-white/5 backdrop-blur-sm">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-white/40 uppercase tracking-widest font-bold">Initializing Models...</p>
            </div>
          ) : error ? (
            <div className="h-64 flex items-center justify-center border border-red-500/20 rounded-[40px] bg-red-500/5 backdrop-blur-sm">
              <p className="text-red-400 font-medium">{error}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left side: Interactive Grid */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                {personas.map((persona, idx) => {
                  const theme = PERSONA_THEMES[persona.id] || PERSONA_THEMES['coach']
                  const isSelected = selectedPersona?.id === persona.id
                  const isHovered = hoveredId === persona.id

                  return (
                    <motion.button
                      key={persona.id}
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + (idx * 0.05) }}
                      onMouseEnter={() => setHoveredId(persona.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => setSelectedPersona(persona)}
                      className={`relative w-full text-left p-6 rounded-[28px] transition-all duration-500 flex items-center justify-between border group ${
                        isSelected 
                          ? 'bg-white/10 border-white/20' 
                          : 'bg-white/5 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      {/* Active glow background */}
                      {isSelected && (
                        <motion.div layoutId="activeBackground" className="absolute inset-0 rounded-[28px] opacity-20" style={{ background: `linear-gradient(90deg, ${theme.from}, ${theme.to})` }} />
                      )}

                      <div className="flex items-center gap-5 relative z-10">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${isSelected ? 'scale-110 shadow-2xl' : 'scale-100 group-hover:scale-105'}`}
                          style={{ 
                            background: isSelected ? `linear-gradient(135deg, ${theme.from}, ${theme.to})` : 'rgba(255,255,255,0.05)',
                            boxShadow: isSelected ? `0 0 20px ${theme.glow}` : 'none'
                          }}
                        >
                          <div className={isSelected ? 'text-white' : 'text-white/40 group-hover:text-white/80 transition-colors'}>
                            {theme.icon}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-1">{persona.id}</p>
                          <h3 className={`text-lg font-bold transition-colors ${isSelected ? 'text-white' : 'text-white/70 group-hover:text-white'}`}>
                            {persona.display_name}
                          </h3>
                        </div>
                      </div>
                      
                      <div className={`relative z-10 w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 ${isSelected ? 'border-white/20 bg-white/10 translate-x-0 opacity-100' : 'border-transparent -translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0'}`}>
                        <ArrowRight size={14} className={isSelected ? 'text-white' : 'text-white/40'} />
                      </div>
                    </motion.button>
                  )
                })}
              </div>

              {/* Right side: Deep Dive Panel */}
              <div className="lg:col-span-7">
                <AnimatePresence mode="wait">
                  {selectedPersona && (
                    <motion.div
                      key={selectedPersona.id}
                      initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4, type: "spring", bounce: 0 }}
                      className="h-full rounded-[40px] border border-white/10 bg-black/40 backdrop-blur-2xl p-10 relative overflow-hidden flex flex-col justify-between"
                    >
                      {/* Ambient Persona Glow */}
                      <div 
                        className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[100px] opacity-20 pointer-events-none"
                        style={{ 
                          background: `radial-gradient(circle, ${(PERSONA_THEMES[selectedPersona.id] || PERSONA_THEMES['coach']).from}, transparent 70%)` 
                        }} 
                      />

                      <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 mb-8">
                          <MessageCircle size={12} className="text-white/50" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Active Preview</span>
                        </div>
                        
                        <h2 className="text-4xl font-extrabold tracking-tight mb-4">
                          {selectedPersona.description}
                        </h2>
                        
                        <p className="text-lg text-white/60 leading-relaxed font-medium max-w-xl">
                          {selectedPersona.display_name} uses a highly specialized supportive framework inside the PRISM ecosystem. When the teen activates this persona, the engine restructures responses to match the model&apos;s psychological tone while strictly adhering to core safety boundaries.
                        </p>
                      </div>

                      {/* Mock Chat Preview */}
                      <div className="relative z-10 mt-12 bg-white/5 border border-white/5 rounded-[32px] p-6 space-y-4">
                        <div className="flex gap-4 self-end flex-row-reverse">
                          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                            <span className="text-xs">You</span>
                          </div>
                          <div className="px-4 py-3 rounded-2xl bg-white/10 text-sm">
                            I&apos;m feeling really overwhelmed today.
                          </div>
                        </div>
                        
                        <div className="flex gap-4">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
                            style={{ background: `linear-gradient(135deg, ${(PERSONA_THEMES[selectedPersona.id] || PERSONA_THEMES['coach']).from}, ${(PERSONA_THEMES[selectedPersona.id] || PERSONA_THEMES['coach']).to})` }}
                          >
                            <span className="text-white">{(PERSONA_THEMES[selectedPersona.id] || PERSONA_THEMES['coach']).icon}</span>
                          </div>
                          <div className="px-4 py-3 rounded-2xl bg-black/40 border border-white/5 text-sm text-white/90 shadow-2xl">
                            <div className="flex gap-1.5 mb-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: '300ms' }} />
                            </div>
                            <span className="text-white/40 text-[10px] uppercase tracking-widest font-bold">Synthesizing response...</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
