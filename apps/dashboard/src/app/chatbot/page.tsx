'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Bot, MessageCircle, ShieldCheck, Sparkles,
  Search, Brain, Smile, Frown, Zap, Send, User,
  Heart, Lightbulb, BookOpen, Target, Wand2, Stars,
  ChevronRight, CircleDot, Gauge, Activity, Layers
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

// ── Types ──────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface Persona {
  id: string
  name: string
  display_name: string
  description: string
}

interface RAGResult {
  results_count: number
  results: Array<{ id: string; role: string; message: string; sentiment: string | null; timestamp: string }>
  method: string
}

interface MoodEntry {
  date: string
  dominant_sentiment: string
  message_count: number
  breakdown: Record<string, number>
}

// ── Persona config ─────────────────────────────────────────────────

const PERSONA_CONFIG: Record<string, {
  display: string
  tagline: string
  accent: string
  gradient: string
  bgLight: string
  emoji: string
  colorHex: string
}> = {
  coach: {
    display: 'The Direct Coach',
    tagline: 'CBT-style • Structured • Action-oriented',
    accent: '#6366F1',
    gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A78BFA 100%)',
    bgLight: '#EEF2FF',
    emoji: '🎯',
    colorHex: '#4F46E5',
  },
  listener: {
    display: 'The Listener',
    tagline: 'Person-centered • Reflective • Warm',
    accent: '#EC4899',
    gradient: 'linear-gradient(135deg, #EC4899 0%, #F472B6 50%, #F9A8D4 100%)',
    bgLight: '#FDF2F8',
    emoji: '💜',
    colorHex: '#DB2777',
  },
  strategist: {
    display: 'The Strategist',
    tagline: 'Solution-focused • Goal-oriented • Practical',
    accent: '#F59E0B',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 50%, #FCD34D 100%)',
    bgLight: '#FFFBEB',
    emoji: '⚡',
    colorHex: '#D97706',
  },
  clinician: {
    display: 'The Clinician',
    tagline: 'Measured • Structured intake • Precise',
    accent: '#10B981',
    gradient: 'linear-gradient(135deg, #10B981 0%, #34D399 50%, #6EE7B7 100%)',
    bgLight: '#ECFDF5',
    emoji: '📋',
    colorHex: '#059669',
  },
  mentor: {
    display: 'The Mentor',
    tagline: 'MI-style • Warm • Growth-focused',
    accent: '#3B82F6',
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 50%, #93C5FD 100%)',
    bgLight: '#EFF6FF',
    emoji: '🌟',
    colorHex: '#2563EB',
  },
}

const DEFAULT_PERSONAS: Persona[] = [
  { id: 'coach', name: 'The Direct Coach', display_name: 'The Direct Coach', description: 'CBT-style, structured, action-oriented.' },
  { id: 'listener', name: 'The Listener', display_name: 'The Listener', description: 'Person-centered, reflective, low-advice.' },
  { id: 'strategist', name: 'The Strategist', display_name: 'The Strategist', description: 'Solution-focused, goal-oriented.' },
  { id: 'clinician', name: 'The Clinician', display_name: 'The Clinician', description: 'Measured, clinical intake-style.' },
  { id: 'mentor', name: 'The Mentor', display_name: 'The Mentor', description: 'Motivational interviewing style.' },
]

const INTRO_MESSAGE = `Welcome! I'm your **PRISM AI Assistant**, powered by RAG (Retrieval-Augmented Generation). I'm connected to PRISM's multimodal data pipeline — phone behaviour, vision features, physiological signals, audio patterns, and safety registry.

**I can help you with:**
• **Behavioural insights** — understand signal patterns and risk scores
• **Companion personas** — explore which persona fits your teen's needs
• **Mood trends** — see sentiment timelines from past conversations
• **Knowledge search** — search across conversation memory using RAG

How can I support you today?`

// PERSONA_RESPONSES have been moved to the backend and are handled via /companion/simulate

function generateRAGResponse(query: string, ragResults: RAGResult | null, moodData: MoodEntry[] | null): string {
  const lower = query.toLowerCase()
  if (ragResults && ragResults.results.length > 0 && (lower.includes('history') || lower.includes('past') || lower.includes('previous'))) {
    return `Based on conversation memory, I found **${ragResults.results_count}** relevant messages. The most recent one was: "${ragResults.results[0].message.slice(0, 150)}..." Would you like me to explore more of these memories?`
  }
  if (moodData && moodData.length > 0 && (lower.includes('mood') || lower.includes('sentiment') || lower.includes('how is'))) {
    const last = moodData[moodData.length - 1]
    return `Looking at recent mood trends, the dominant sentiment today is **${last.dominant_sentiment}** (based on ${last.message_count} data points). Over the last ${moodData.length} days, I can see patterns forming. Would you like me to dive deeper into any specific day?`
  }
  if (lower.includes('persona') || lower.includes('companion') || lower.includes('which')) {
    return `PRISM offers **5 companion personas**: The Direct Coach (CBT-style), The Listener (person-centered), The Strategist (solution-focused), The Clinician (structured intake), and The Mentor (motivational interviewing). Each shares the same safety wrapper — crisis detection, non-diagnostic disclosure, and consent-first design. Try switching personas in the sidebar to see how each responds differently!`
  }
  if (lower.includes('risk') || lower.includes('score') || lower.includes('signal')) {
    return `PRISM Insight Scores combine **5 modalities** into a single 0–100 heuristic: Phone Behaviour (35%), Visual Engagement (25%), Physiological (20%), Vocal Patterns (10%), and Safety Registry (10%). Every score includes human-readable contributing factors so you always know why a score changed.`
  }
  if (lower.includes('privacy') || lower.includes('data') || lower.includes('consent')) {
    return `PRISM is **metadata-only**. We never capture message content, audio, video, or screenshots. What we monitor: screen time duration, typing pace, step count, app install metadata, blink rate, speech segments, BPM. All data is encrypted in transit and at rest.`
  }
  return ''
}

// ── Animated Persona Character (pure CSS) ─────────────────────────

function PersonaCharacter({ id, active, onClick }: { id: string; active: boolean; onClick: () => void }) {
  const cfg = PERSONA_CONFIG[id]
  if (!cfg) return null

  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        width: '100%',
        padding: '16px 14px',
        borderRadius: 16,
        border: active ? `2px solid ${cfg.accent}` : '1px solid transparent',
        background: active ? cfg.bgLight : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)',
        overflow: 'hidden',
        marginBottom: 4,
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLElement).style.background = '#F9F9F8'
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {/* Active glow ring */}
      {active && (
        <div style={{
          position: 'absolute', inset: -2, borderRadius: 18,
          background: cfg.gradient, opacity: 0.12,
          animation: 'personaGlow 3s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
        {/* Animated avatar */}
        <div style={{
          width: 52, height: 52, borderRadius: 16,
          background: active ? cfg.gradient : '#F0F0F0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24,
          transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: active ? `0 4px 20px ${cfg.accent}33` : 'none',
          position: 'relative',
          flexShrink: 0,
        }}>
          {/* Pulsing ring behind active avatar */}
          {active && (
            <>
              <div style={{
                position: 'absolute', inset: -4, borderRadius: 20,
                border: `2px solid ${cfg.accent}`, opacity: 0.3,
                animation: 'ringPulse 2s ease-out infinite',
              }} />
              <div style={{
                position: 'absolute', inset: -8, borderRadius: 24,
                border: `2px solid ${cfg.accent}`, opacity: 0.15,
                animation: 'ringPulse 2s ease-out 0.5s infinite',
              }} />
            </>
          )}
          <span style={{
            transition: 'transform 0.3s ease',
            transform: active ? 'scale(1.15)' : 'scale(1)',
            animation: active ? 'personaFloat 2.5s ease-in-out infinite' : 'none',
          }}>
            {cfg.emoji}
          </span>

          {/* Sparkle dots on active */}
          {active && (
            <>
              <div style={{
                position: 'absolute', top: -6, right: -6,
                width: 12, height: 12, borderRadius: '50%',
                background: cfg.accent, opacity: 0.6,
                animation: 'sparkleDot 1.5s ease-in-out infinite',
              }} />
              <div style={{
                position: 'absolute', bottom: -4, left: -4,
                width: 8, height: 8, borderRadius: '50%',
                background: cfg.accent, opacity: 0.4,
                animation: 'sparkleDot 1.5s ease-in-out 0.7s infinite',
              }} />
            </>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 14, fontWeight: 700,
            color: active ? cfg.colorHex : '#1A1A1A',
            transition: 'color 0.3s',
          }}>
            {cfg.display}
          </p>
          <p style={{
            margin: '3px 0 0', fontSize: 11, color: '#8E8E93',
            lineHeight: 1.4,
          }}>
            {cfg.tagline}
          </p>

          {/* Active indicator bar */}
          {active && (
            <div style={{
              marginTop: 8, height: 3, borderRadius: 2, width: '100%',
              background: '#E8E8EC', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: cfg.gradient,
                animation: 'barFill 0.6s ease-out forwards',
              }} />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Floating particles background ──────────────────────────────────

function ParticleField() {
  const [mounted, setMounted] = useState(false)
  const [particles, setParticles] = useState<any[]>([])

  useEffect(() => {
    setMounted(true)
    setParticles(Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      size: 2 + Math.random() * 4,
      x: Math.random() * 100,
      y: Math.random() * 100,
      dur: 8 + Math.random() * 20,
      delay: Math.random() * 10,
      opacity: 0.08 + Math.random() * 0.12
    })))
  }, [])

  if (!mounted) return null

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {particles.map((p, i) => (
        <div key={p.id} style={{
          position: 'absolute',
          left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size, borderRadius: '50%',
          background: i % 5 === 0 ? '#6366F1' : i % 5 === 1 ? '#EC4899' : i % 5 === 2 ? '#F59E0B' : i % 5 === 3 ? '#10B981' : '#3B82F6',
          opacity: p.opacity,
          animation: `particleFloat ${p.dur}s linear ${p.delay}s infinite`,
        }} />
      ))}
      {/* Floating decorative rings */}
      {[
        { size: 120, x: 5, y: 15, color: '#6366F1', delay: 0 },
        { size: 80, x: 92, y: 25, color: '#EC4899', delay: 3 },
        { size: 60, x: 48, y: 80, color: '#10B981', delay: 6 },
        { size: 100, x: 78, y: 60, color: '#F59E0B', delay: 1.5 },
      ].map((r, i) => (
        <div key={`ring-${i}`} style={{
          position: 'absolute',
          left: `${r.x}%`, top: `${r.y}%`,
          width: r.size, height: r.size,
          borderRadius: '50%',
          border: `1.5px solid ${r.color}`,
          opacity: 0.04,
          animation: `ringFloat 12s ease-in-out ${r.delay}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ── Animated Orb for loading ───────────────────────────────────────

function LoadingOrb() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '4px 0' }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(99,102,241,0.25)',
        animation: 'orbPulse 1.5s ease-in-out infinite',
      }}>
        <span style={{ fontSize: 16, animation: 'orbBounce 0.6s ease-in-out infinite' }}>🤖</span>
      </div>
      <div style={{
        padding: '14px 20px', borderRadius: 18,
        background: '#fff', border: '1px solid #E8E8EC',
        display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 0.15, 0.3].map(d => (
          <div key={d} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#6366F1',
            animation: `typingBounce 1.2s ease-in-out ${d}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

// ── Mood Sparkline (mini SVG chart) ────────────────────────────────

function MoodSparkline({ data }: { data: MoodEntry[] }) {
  if (data.length < 2) return null
  const w = 260; const h = 40
  const vals = data.map(d => {
    if (d.dominant_sentiment === 'positive') return 1
    if (d.dominant_sentiment === 'negative') return 0
    return 0.5
  })
  const min = 0; const max = 1
  const sx = (i: number) => 4 + (i / (vals.length - 1)) * (w - 8)
  const sy = (v: number) => 4 + (1 - (v - min) / (max - min)) * (h - 8)
  const path = vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ')
  const fillPath = `${path} L ${sx(vals.length - 1).toFixed(1)} ${h} L ${sx(0).toFixed(1)} ${h} Z`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#moodGrad)" />
      <path d={path} fill="none" stroke="#6366F1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {vals.map((v, i) => (
        <circle key={i} cx={sx(i)} cy={sy(v)} r={i === vals.length - 1 ? 3 : 2}
          fill={i === vals.length - 1 ? '#6366F1' : '#fff'}
          stroke="#6366F1" strokeWidth={i === vals.length - 1 ? 0 : 1.5} />
      ))}
    </svg>
  )
}

// ── Main Page ──────────────────────────────────────────────────────

export default function ChatbotPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [activePersona, setActivePersona] = useState('coach')
  const [isLoading, setIsLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [ragResults, setRagResults] = useState<RAGResult | null>(null)
  const [moodData, setMoodData] = useState<MoodEntry[] | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [personaAnimating, setPersonaAnimating] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const activeCfg = PERSONA_CONFIG[activePersona]

  useEffect(() => {
    const storedToken = localStorage.getItem('prism_token')
    if (!storedToken) { router.push('/'); return }
    setToken(storedToken)
    fetchPersonas()
    setMessages([{ id: 'intro', role: 'assistant', content: INTRO_MESSAGE, timestamp: new Date() }])
  }, [router])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchPersonas = async () => {
    try {
      const res = await fetch(`${API}/companion/personas`)
      if (res.ok) setPersonas(await res.json())
    } catch {}
  }

  const fetchRAGSearch = useCallback(async (query: string) => {
    if (!token) return null
    try {
      const res = await fetch(`${API}/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, top_k: 5 }),
      })
      if (res.ok) {
        const data = await res.json()
        setRagResults(data)
        return data
      }
    } catch {}
    return null
  }, [token])

  const fetchMoodTimeline = useCallback(async () => {
    if (!token) return null
    try {
      const res = await fetch(`${API}/mood/timeline?days=7`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMoodData(data.daily_mood || [])
        return data.daily_mood || []
      }
    } catch {}
    return null
  }, [token])

  const switchPersona = (id: string) => {
    setPersonaAnimating(id)
    setTimeout(() => {
      setActivePersona(id)
      setPersonaAnimating(null)
    }, 300)
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: trimmed, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    // Fetch RAG + mood in parallel and use the FRESH results directly —
    // reading state right after setState would use stale, pre-fetch values.
    const [rag, mood] = await Promise.all([fetchRAGSearch(trimmed), fetchMoodTimeline()])

    await new Promise(r => setTimeout(r, 700 + Math.random() * 700))

    let response = generateRAGResponse(trimmed, rag, mood)
    if (!response) {
      try {
        const res = await fetch(`${API}/companion/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ persona_id: activePersona, message: trimmed }),
        })
        if (res.ok) {
          const data = await res.json()
          response = data.response
        }
      } catch (err) {
        console.error("Simulation failed:", err)
      }
      
      if (!response) {
        response = `Thanks for asking. I can help with PRISM's multimodal signals, companion personas, risk scoring, and privacy design. What specifically would you like to explore?`
      }
    }

    setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: response + '\n\n---\n*Responding as ' + activeCfg?.display + '*', timestamp: new Date() }])
    setIsLoading(false)
  }

  const personaList = personas.length > 0 ? personas : DEFAULT_PERSONAS
  const personaCount = personaList.length

  return (
    <div style={{
      minHeight: '100vh', background: '#FAFAFA', color: '#1A1A1A',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      <ParticleField />

      {/* ═══ HEADER ═══ */}
      <header style={{
        height: 60, background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex',
        alignItems: 'center', padding: '0 24px', gap: 16, flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <button onClick={() => router.push('/overview')} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6B6B6B',
          padding: '6px 10px', borderRadius: 8, transition: 'background 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F4F4F2'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <ArrowLeft size={16} /> Overview
        </button>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: activeCfg?.gradient || 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 16px ${(activeCfg?.accent || '#6366F1')}33`,
            fontSize: 18,
            animation: 'orbPulse 2.5s ease-in-out infinite',
          }}>
            {activeCfg?.emoji || '🤖'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', color: '#1A1A1A' }}>
                PRISM AI Assistant
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))',
                color: '#6366F1', letterSpacing: '0.05em',
              }}>
                MEMORY-AWARE
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#8E8E93' }}>
              {personaCount} personas available · {activeCfg?.display} active
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Quick persona dots */}
          <div style={{ display: 'flex', gap: 4, padding: '4px 10px', borderRadius: 20, background: '#F4F4F2' }}>
            {personaList.map(p => {
              const cfg = PERSONA_CONFIG[p.id]
              return (
                <div key={p.id}
                  onClick={() => switchPersona(p.id)}
                  title={cfg?.display || p.display_name}
                  style={{
                    width: activePersona === p.id ? 28 : 10,
                    height: 10, borderRadius: 5,
                    background: activePersona === p.id ? (cfg?.gradient || '#6366F1') : (cfg?.accent || '#D1D1D6'),
                    cursor: 'pointer',
                    transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)',
                    boxShadow: activePersona === p.id ? `0 2px 8px ${(cfg?.accent || '#6366F1')}44` : 'none',
                  }}
                />
              )
            })}
          </div>

          <button onClick={() => setSidebarOpen(o => !o)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
            borderRadius: 10, border: '1px solid #E8E8EC', background: '#fff',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#6B6B6B',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#6366F1'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#E8E8EC'}
          >
            <Layers size={14} /> {sidebarOpen ? 'Hide Panel' : 'Show Panel'}
          </button>
        </div>
      </header>

      {/* ═══ BODY ═══ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        {/* Chat column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 18,
          }}>
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user'
              return (
                <div key={msg.id} style={{
                  display: 'flex', gap: 12, maxWidth: 720,
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  animation: `msgSlide${isUser ? 'Right' : 'Left'} 0.4s ${idx * 0.02}s ease-out both`,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                    background: isUser ? '#1A1A1A' : (activeCfg?.gradient || 'linear-gradient(135deg, #6366F1, #8B5CF6)'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isUser ? '0 2px 8px rgba(0,0,0,0.12)' : `0 2px 12px ${(activeCfg?.accent || '#6366F1')}33`,
                    fontSize: 16,
                  }}>
                    {isUser ? <User size={16} color="#fff" /> : activeCfg?.emoji || '🤖'}
                  </div>
                  <div style={{
                    padding: '14px 20px', borderRadius: 18,
                    background: isUser ? '#1A1A1A' : '#fff',
                    color: isUser ? '#fff' : '#1A1A1A',
                    border: isUser ? 'none' : '1px solid #E8E8EC',
                    fontSize: 14, lineHeight: 1.75, maxWidth: '100%',
                    boxShadow: isUser ? '0 2px 12px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.03)',
                  }}>
                    {msg.content.split('\n').map((line, i) => {
                      if (line.startsWith('---') && line.endsWith('---')) {
                        return <div key={i} style={{ opacity: 0.5, fontSize: 11, fontStyle: 'italic', marginTop: 6 }}>{line.replace(/---/g, '').replace(/\*/g, '')}</div>
                      }
                      const parts = line.split(/(\*\*[^*]+\*\*)/g)
                      if (parts.length === 1) return <div key={i}>{line || '\u00A0'}</div>
                      return (
                        <div key={i}>
                          {parts.map((part, j) =>
                            part.startsWith('**') && part.endsWith('**')
                              ? <strong key={j} style={{ color: isUser ? '#fff' : activeCfg?.colorHex }}>{part.slice(2, -2)}</strong>
                              : <span key={j}>{part}</span>
                          )}
                          {line === '' ? '\u00A0' : ''}
                        </div>
                      )
                    })}
                    <div style={{ fontSize: 10, opacity: 0.4, marginTop: 8 }}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              )
            })}

            {isLoading && <LoadingOrb />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div style={{
            padding: '16px 24px 24px', borderTop: '1px solid rgba(0,0,0,0.05)',
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#fff', borderRadius: 18,
              padding: '4px 4px 4px 20px',
              border: '1px solid #E8E8EC',
              boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
              transition: 'box-shadow 0.2s',
            }}>
              <Wand2 size={16} color={activeCfg?.accent || '#6366F1'} style={{ flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder={`Message ${activeCfg?.display || 'PRISM Assistant'}...`}
                disabled={isLoading}
                style={{
                  flex: 1, border: 'none', background: 'transparent',
                  fontSize: 14, color: '#1A1A1A', outline: 'none',
                  padding: '12px 0', fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                style={{
                  width: 44, height: 44, borderRadius: 14, border: 'none',
                  background: input.trim()
                    ? (activeCfg?.gradient || 'linear-gradient(135deg, #6366F1, #8B5CF6)')
                    : '#F0F0F0',
                  color: '#fff',
                  cursor: input.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.25s',
                  boxShadow: input.trim() ? `0 4px 16px ${(activeCfg?.accent || '#6366F1')}44` : 'none',
                  transform: input.trim() ? 'scale(1.05)' : 'scale(1)',
                  flexShrink: 0,
                }}
              >
                <Send size={17} />
              </button>
            </div>

            {/* Suggestion chips */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {['Explain the insight score', 'Show mood trends', 'Which persona is right?', 'Privacy & data safety'].map(s => (
                <button key={s} onClick={() => { setInput(s); setTimeout(() => handleSend(), 100) }} disabled={isLoading} style={{
                  padding: '6px 14px', borderRadius: 20, border: '1px solid #E8E8EC',
                  background: '#fff', cursor: 'pointer', fontSize: 11, color: '#6B6B6B',
                  fontWeight: 500, transition: 'all 0.15s', fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#6366F1'; (e.currentTarget as HTMLElement).style.color = '#6366F1' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E8E8EC'; (e.currentTarget as HTMLElement).style.color = '#6B6B6B' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ SIDEBAR ═══ */}
        {sidebarOpen && (
          <aside style={{
            width: 320, flexShrink: 0, borderLeft: '1px solid rgba(0,0,0,0.06)',
            background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)',
            overflowY: 'auto', padding: '24px 18px',
            display: 'flex', flexDirection: 'column', gap: 20,
          }}>
            {/* Active Persona Hero */}
            <div style={{
              padding: 20, borderRadius: 20,
              background: activeCfg?.bgLight || '#EEF2FF',
              border: `1.5px solid ${activeCfg?.accent || '#6366F1'}22`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: -30, right: -30,
                width: 100, height: 100, borderRadius: '50%',
                background: activeCfg?.gradient || 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                opacity: 0.06,
              }} />
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: activeCfg?.colorHex, textTransform: 'uppercase', marginBottom: 12, position: 'relative' }}>
                <CircleDot size={9} style={{ display: 'inline', marginRight: 4 }} />
                Active Persona
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 18,
                  background: activeCfg?.gradient || 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, boxShadow: `0 6px 24px ${(activeCfg?.accent || '#6366F1')}33`,
                  animation: 'personaFloat 2.5s ease-in-out infinite',
                }}>
                  {activeCfg?.emoji || '🤖'}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1A1A1A' }}>
                    {activeCfg?.display || 'Assistant'}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6B6B6B', lineHeight: 1.4 }}>
                    {activeCfg?.tagline || 'AI companion'}
                  </p>
                </div>
              </div>

              {/* Activity rings */}
              <div style={{ display: 'flex', gap: 16, marginTop: 16, position: 'relative' }}>
                {[
                  { label: 'Response style', val: 'Active' },
                  { label: 'Safety', val: 'Engaged' },
                  { label: 'Context', val: 'Primed' },
                ].map(stat => (
                  <div key={stat.label}>
                    <p style={{ fontSize: 9, color: '#8E8E93', margin: '0 0 3px' }}>{stat.label}</p>
                    <p style={{ fontSize: 11, fontWeight: 700, color: activeCfg?.colorHex, margin: 0 }}>{stat.val}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Persona Switcher with animated characters */}
            <div>
              <p style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
                color: '#8E8E93', textTransform: 'uppercase', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Layers size={12} /> Switch Persona
              </p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {personaList.map(p => (
                  <PersonaCharacter
                    key={p.id}
                    id={p.id}
                    active={activePersona === p.id}
                    onClick={() => switchPersona(p.id)}
                  />
                ))}
              </div>
            </div>

            {/* RAG context */}
            <div style={{
              padding: 16, borderRadius: 16,
              background: '#F9F9F8', border: '1px solid #EBEBEB',
            }}>
              <p style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
                color: '#8E8E93', textTransform: 'uppercase', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Search size={12} /> RAG Knowledge Base
              </p>
              {ragResults && ragResults.results.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ragResults.results.slice(0, 3).map((r, i) => (
                    <div key={i} style={{
                      padding: '10px 12px', borderRadius: 10, background: '#fff',
                      border: '1px solid #EBEBEB', fontSize: 11, color: '#6B6B6B',
                      lineHeight: 1.5, animation: `fadeUp 0.3s ${i * 0.08}s ease-out both`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                        {r.sentiment === 'positive' ? <Smile size={10} color="#059669" /> :
                         r.sentiment === 'negative' ? <Frown size={10} color="#B91C1C" /> :
                         <CircleDot size={10} color="#8E8E93" />}
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#AEAEB2' }}>
                          {r.role} · {r.sentiment || 'neutral'}
                        </span>
                      </div>
                      <span>{r.message.slice(0, 100)}{r.message.length > 100 ? '…' : ''}</span>
                    </div>
                  ))}
                  <p style={{ fontSize: 10, color: '#AEAEB2', margin: 0, textAlign: 'center' }}>
                    {ragResults.results_count} results · {ragResults.method}
                  </p>
                </div>
              ) : (
                <p style={{ fontSize: 11, color: '#AEAEB2', lineHeight: 1.6, margin: 0 }}>
                  Ask a question to trigger RAG retrieval across conversation memory.
                </p>
              )}
            </div>

            {/* Mood timeline with sparkline */}
            <div style={{
              padding: 16, borderRadius: 16,
              background: '#F9F9F8', border: '1px solid #EBEBEB',
            }}>
              <p style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
                color: '#8E8E93', textTransform: 'uppercase', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Activity size={12} /> Mood Timeline
              </p>
              {moodData && moodData.length > 0 ? (
                <>
                  <MoodSparkline data={moodData} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    {moodData.slice(-7).map((d, i) => (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', margin: '0 auto 3px',
                          background: d.dominant_sentiment === 'positive' ? '#10B981' :
                                      d.dominant_sentiment === 'negative' ? '#EF4444' : '#D1D5DB',
                        }} />
                        <span style={{ fontSize: 8, color: '#AEAEB2' }}>
                          {d.date.split('-').pop()}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 11, color: '#AEAEB2', lineHeight: 1.6, margin: 0 }}>
                  Pair a device to populate the mood timeline.
                </p>
              )}
            </div>

            {/* Safety */}
            <div style={{
              padding: 16, borderRadius: 16,
              background: 'linear-gradient(135deg, #ECFDF5, #F0FDF4)',
              border: '1px solid #A7F3D0',
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: '#10B981', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0,
                }}>
                  <ShieldCheck size={14} color="#fff" />
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#065F46', margin: '0 0 4px' }}>
                    Safety & Privacy
                  </p>
                  <p style={{ fontSize: 10, color: '#065F46', lineHeight: 1.5, margin: 0 }}>
                    AI companion — not a therapist. Crisis detection active on every message.
                    Metadata only. If you need immediate support, text HOME to 741741.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ═══ KEYFRAME STYLES ═══ */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes personaFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-4px) scale(1.05); }
        }
        @keyframes personaGlow {
          0%, 100% { opacity: 0.08; }
          50% { opacity: 0.18; }
        }
        @keyframes ringPulse {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes sparkleDot {
          0%, 100% { transform: scale(0.6); opacity: 0.4; }
          50% { transform: scale(1.3); opacity: 0.9; }
        }
        @keyframes barFill {
          from { width: 0%; }
          to { width: 100%; }
        }
        @keyframes typingBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes orbPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @keyframes orbBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes particleFloat {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-400px) translateX(20px); opacity: 0; }
        }
        @keyframes ringFloat {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.05; }
          50% { transform: translateY(-30px) scale(1.1); opacity: 0.1; }
        }
        @keyframes msgSlideLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes msgSlideRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #E0E0E0; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #C0C0C0; }
      `}} />
    </div>
  )
}
