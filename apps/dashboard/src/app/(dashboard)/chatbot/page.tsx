'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ShieldCheck, Search, Smile, Frown, Send, User,
  CircleDot, Activity, Layers, Sparkles, Wand2, Terminal, Cpu, Database
} from 'lucide-react'
import { clearAuth } from '@/lib/api'

function resolveApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL
  if (!raw || raw.trim() === '') return '/api/v1'
  const trimmed = raw.replace(/\/$/, '')
  if (trimmed.endsWith('/api/v1')) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return `${trimmed}/api/v1`
  return trimmed
}

const API = resolveApiBase()

function logCompanionApiError(endpoint: string, status?: number, detail?: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    const message = detail instanceof Error ? detail.message : typeof detail === 'string' ? detail : JSON.stringify(detail)
    console.error(`[PRISM Companion API] ${endpoint} failed${status ? ` (${status})` : ''}: ${message}`)
  }
}

function handleCompanionUnauthorized(status: number, router: ReturnType<typeof useRouter>) {
  if (status !== 401) return false
  clearAuth()
  router.push('/')
  return true
}
// ── Types ──────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

type NovaAction = 'risk_report' | 'mood_patterns' | 'system_status' | 'privacy_protocol'
interface NovaChatResponse {
  conversation_id: string
  message: { id: string; role: 'assistant'; content: string; timestamp: string }
  crisis_flag: boolean
}

interface QuickAction {
  label: string
  message: string
  action: NovaAction
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

// ── Persona config (Premium Dark Mode Colors) ──────────────────────

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
    tagline: 'CBT-style • Structured',
    accent: '#818CF8', 
    gradient: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
    bgLight: 'rgba(99, 102, 241, 0.1)',
    emoji: '🎯',
    colorHex: '#818CF8',
  },
  listener: {
    display: 'The Listener',
    tagline: 'Reflective • Warm',
    accent: '#F472B6', 
    gradient: 'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)',
    bgLight: 'rgba(236, 72, 153, 0.1)',
    emoji: '💜',
    colorHex: '#F472B6',
  },
  strategist: {
    display: 'The Strategist',
    tagline: 'Solution-focused',
    accent: '#FBBF24', 
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
    bgLight: 'rgba(245, 158, 11, 0.1)',
    emoji: '⚡',
    colorHex: '#FBBF24',
  },
  clinician: {
    display: 'The Clinician',
    tagline: 'Measured • Precise',
    accent: '#34D399', 
    gradient: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
    bgLight: 'rgba(16, 185, 129, 0.1)',
    emoji: '📋',
    colorHex: '#34D399',
  },
  mentor: {
    display: 'The Mentor',
    tagline: 'MI-style • Growth',
    accent: '#60A5FA', 
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)',
    bgLight: 'rgba(59, 130, 246, 0.1)',
    emoji: '🌟',
    colorHex: '#60A5FA',
  },
}

const DEFAULT_PERSONAS: Persona[] = [
  { id: 'coach', name: 'The Direct Coach', display_name: 'The Direct Coach', description: 'CBT-style, structured, action-oriented.' },
  { id: 'listener', name: 'The Listener', display_name: 'The Listener', description: 'Person-centered, reflective, low-advice.' },
  { id: 'strategist', name: 'The Strategist', display_name: 'The Strategist', description: 'Solution-focused, goal-oriented.' },
  { id: 'clinician', name: 'The Clinician', display_name: 'The Clinician', description: 'Measured, clinical intake-style.' },
  { id: 'mentor', name: 'The Mentor', display_name: 'The Mentor', description: 'Motivational interviewing style.' },
]

const INTRO_MESSAGE = `Welcome to the **PRISM AI Workspace**. 

I'm connected to the PRISM multimodal neural engine. I can synthesize behavioural metadata, mood trends, and physiological anomalies in real-time.

**Capabilities online:**
• **Pattern Recognition** — Signal analysis & risk scores
• **Adaptive Personas** — Dynamic conversational styling
• **Memory Retrieval** — RAG-powered historical context
• **Sentiment Analysis** — Timeline mood aggregation

How shall we proceed?`

// ── Components ─────────────────────────────────────────────────────

function NeuralBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {/* Ambient animated gradient mesh */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.15, 0.1],
          rotate: [0, 90, 0]
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.15)_0%,rgba(0,0,0,0)_50%)]"
      />
      
      {/* Noise overlay for premium feel */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
    </div>
  )
}

function LivingAICore({ activeColor, isThinking }: { activeColor: string, isThinking: boolean }) {
  return (
    <div className="relative flex items-center justify-center w-12 h-12">
      {/* Outer aura */}
      <motion.div
        animate={{ 
          scale: isThinking ? [1, 1.5, 1] : [1, 1.1, 1],
          opacity: isThinking ? [0.4, 0.8, 0.4] : [0.2, 0.4, 0.2]
        }}
        transition={{ duration: isThinking ? 1.5 : 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 rounded-full blur-md"
        style={{ backgroundColor: activeColor }}
      />
      {/* Inner core */}
      <motion.div
        animate={{ 
          rotate: isThinking ? 360 : 0,
          scale: isThinking ? 0.9 : 1
        }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="relative z-10 w-8 h-8 rounded-full border border-white/20 flex items-center justify-center overflow-hidden"
        style={{ 
          background: `radial-gradient(circle at 30% 30%, ${activeColor}, #000)`,
          boxShadow: `inset 0 0 10px ${activeColor}, 0 0 15px ${activeColor}40`
        }}
      >
        <div className="w-2 h-2 bg-white rounded-full opacity-80" />
      </motion.div>
    </div>
  )
}

function TypingIndicator({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-3 px-1 py-1" aria-label="NOVA is thinking">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            className="w-1.5 h-1.5 rounded-full motion-reduce:animate-none"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <span className="text-xs text-white/45">NOVA is thinking through your request…</span>
    </div>
  )
}

// ── Mood Sparkline (Framer Motion SVG) ─────────────────────────────

function AnimatedSparkline({ data, color }: { data: MoodEntry[], color: string }) {
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
  
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block overflow-visible">
      <motion.path 
        d={path} 
        fill="none" 
        stroke={color} 
        strokeWidth={2} 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />
      {vals.map((v, i) => (
        <motion.circle 
          key={i} cx={sx(i)} cy={sy(v)} r={i === vals.length - 1 ? 4 : 2.5}
          fill={i === vals.length - 1 ? color : '#121212'}
          stroke={color} strokeWidth={1.5}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1 + (i * 0.1), type: "spring" }}
        />
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
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [ragResults, setRagResults] = useState<RAGResult | null>(null)
  const [moodData, setMoodData] = useState<MoodEntry[] | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const activeCfg = PERSONA_CONFIG[activePersona] || PERSONA_CONFIG['coach']

  useEffect(() => {
    const storedToken = localStorage.getItem('prism_token')
    if (!storedToken) { router.push('/'); return }
    setToken(storedToken)
    fetchPersonas()
    const storedConversation = localStorage.getItem('nova_conversation_id')
    if (storedConversation) {
      fetch(`${API}/nova/conversations/${storedConversation}`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      }).then(async res => {
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        setConversationId(data.conversation_id)
        setMessages(data.messages.map((message: { id: string; role: 'user' | 'assistant'; content: string; timestamp: string }) => ({
          ...message,
          timestamp: new Date(message.timestamp),
        })))
      }).catch(() => {
        localStorage.removeItem('nova_conversation_id')
        setMessages([{ id: 'intro', role: 'assistant', content: INTRO_MESSAGE, timestamp: new Date() }])
      })
    } else {
      setTimeout(() => {
        setMessages([{ id: 'intro', role: 'assistant', content: INTRO_MESSAGE, timestamp: new Date() }])
      }, 400)
    }
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
      const res = await fetch(`${API}/companion/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, top_k: 5 }),
      })
      if (res.ok) {
        const data = await res.json()
        setRagResults(data)
        return data
      }
      const detail = await res.json().catch(() => ({}))
      if (handleCompanionUnauthorized(res.status, router)) return null
      logCompanionApiError('/companion/rag/search', res.status, detail)
    } catch (error) {
      logCompanionApiError('/companion/rag/search', undefined, error instanceof Error ? error.message : error)
    }
    return null
  }, [router, token])

  const fetchMoodTimeline = useCallback(async () => {
    if (!token) return null
    try {
      const res = await fetch(`${API}/companion/mood/timeline?days=7`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMoodData(data.daily_mood || [])
        return data.daily_mood || []
      }
      const detail = await res.json().catch(() => ({}))
      if (handleCompanionUnauthorized(res.status, router)) return null
      logCompanionApiError('/companion/mood/timeline', res.status, detail)
    } catch (error) {
      logCompanionApiError('/companion/mood/timeline', undefined, error instanceof Error ? error.message : error)
    }
    return null
  }, [router, token])

  const switchPersona = (id: string) => {
    setActivePersona(id)
  }

  const quickActions: QuickAction[] = [
    { label: 'Synthesize risk report', message: 'Synthesize my current PRISM risk report.', action: 'risk_report' },
    { label: 'Extract mood patterns', message: 'Extract mood patterns from my authorized PRISM signals.', action: 'mood_patterns' },
    { label: 'System status', message: 'Report the current PRISM system status.', action: 'system_status' },
    { label: 'Privacy protocol', message: 'Explain the NOVA privacy protocol for this account.', action: 'privacy_protocol' },
  ]

  const handleSend = async (messageOverride?: string, action?: NovaAction) => {
    const trimmed = (messageOverride ?? input).trim()
    const authToken = token ?? localStorage.getItem('prism_token')
    if (!trimmed || isLoading || !authToken) return

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: trimmed, timestamp: new Date() }
    const typingId = `typing-${Date.now()}`
    setMessages(prev => [...prev, userMsg, { id: typingId, role: 'assistant', content: '…', timestamp: new Date() }])
    setInput('')
    setIsLoading(true)
    setErrorMessage(null)
    void Promise.all([fetchRAGSearch(trimmed), fetchMoodTimeline()])

    try {
      const res = await fetch(`${API}/nova/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ conversation_id: conversationId, message: trimmed, persona_id: activePersona, ...(action ? { action } : {}) }),
      })
      if (res.status === 401) {
        localStorage.removeItem('prism_token')
        router.push('/')
        return
      }
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}))
        const detail = typeof errorBody.detail === 'string' ? errorBody.detail : null
        if (res.status === 404) throw new Error(detail || 'No linked PRISM device is available for this request.')
        if (res.status === 422) throw new Error(detail || 'NOVA could not validate that request.')
        if (res.status === 429) throw new Error(detail || 'NOVA is receiving many requests. Please try again shortly.')
        if (res.status === 503) throw new Error(detail || 'NOVA AI is not configured on the backend yet.')
        if (res.status >= 500) throw new Error(detail || 'NOVA is temporarily unavailable. Please try again.')
        throw new Error(detail || 'NOVA could not process that message.')
      }
      const data: NovaChatResponse = await res.json()
      const assistantContent = data.message?.content?.trim()
      if (!data.conversation_id || !data.message?.id || !assistantContent) {
        throw new Error('NOVA returned an empty response. Please try again.')
      }
      setConversationId(data.conversation_id)
      localStorage.setItem('nova_conversation_id', data.conversation_id)
      setMessages(prev => prev.map(message => message.id === typingId ? {
        id: data.message.id,
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(data.message.timestamp),
      } : message))
    } catch (error) {
      const message = error instanceof TypeError
        ? 'The PRISM backend is unavailable. Check your connection and try again.'
        : error instanceof Error ? error.message : 'NOVA could not respond right now.'
      setErrorMessage(message)
      setMessages(prev => prev.filter(item => item.id !== typingId))
    } finally {
      setIsLoading(false)
    }
  }

  const personaList = personas.length > 0 ? personas : DEFAULT_PERSONAS

  return (
    <div className="h-full bg-[#050505] flex flex-col relative text-[#EDEDED] font-sans overflow-hidden selection:bg-indigo-500/30 z-0">
      <NeuralBackground />

      {/* ═══ HEADER ═══ */}
      <header className="h-[72px] border-b border-white/5 bg-black/30 backdrop-blur-2xl flex items-center px-6 gap-4 shrink-0 relative z-50">
        <button 
          onClick={() => router.push('/overview')} 
          className="flex items-center gap-2 text-sm font-medium text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Overview
        </button>

        <div className="flex-1 flex items-center justify-center gap-4">
          <LivingAICore activeColor={activeCfg.colorHex} isThinking={isLoading} />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white">PRISM AI</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/70 uppercase tracking-widest">
                System Online
              </span>
            </div>
            <p className="text-xs text-white/40 m-0">Powered by RAG • Monitoring active</p>
          </div>
        </div>

        <button 
          onClick={() => setSidebarOpen(o => !o)} 
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white/70 transition-all"
        >
          <Layers size={14} /> {sidebarOpen ? 'Hide Matrix' : 'View Matrix'}
        </button>
      </header>

      {/* ═══ BODY ═══ */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        
        {/* Chat column */}
        <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-b from-transparent to-black/40">
          
          {/* Messages */}
          <style dangerouslySetInnerHTML={{ __html: `
            .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            .hide-scrollbar::-webkit-scrollbar { display: none; }
            .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          `}} />
          <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-8 scroll-smooth custom-scrollbar">
            {messages.length <= 1 && !isLoading && (
              <div className="max-w-3xl mx-auto w-full rounded-3xl border border-white/10 bg-white/[0.035] px-5 py-4 shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm" aria-hidden="true">✦</div>
                  <div>
                    <p className="m-0 text-sm font-semibold text-white">A calmer way to understand your patterns</p>
                    <p className="mt-1.5 m-0 max-w-2xl text-xs leading-relaxed text-white/45">
                      Ask about your wellbeing, or request an explanation of authorized PRISM observations. NOVA keeps data-backed observations separate from general guidance.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user'
                const isTyping = msg.content === '…'
                
                return (
                  <motion.div 
                    key={msg.id} 
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className={`flex gap-4 max-w-3xl motion-reduce:transition-none ${isUser ? 'self-end flex-row-reverse' : 'self-start'}`}
                  >
                    <div className="shrink-0 mt-1">
                      {isUser ? (
                        <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center backdrop-blur-md">
                          <User size={18} className="text-white/70" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]" style={{ background: activeCfg.bgLight }}>
                          <Terminal size={18} style={{ color: activeCfg.colorHex }} />
                        </div>
                      )}
                    </div>
                    
                    <div className={`px-5 py-4 rounded-3xl text-sm leading-relaxed backdrop-blur-md ${
                      isUser 
                        ? 'bg-white/10 text-white border border-white/10 rounded-tr-sm' 
                        : 'bg-black/40 text-white/90 border border-white/5 rounded-tl-sm'
                    }`}>
                      {isTyping ? (
                        <TypingIndicator color={activeCfg.colorHex} />
                      ) : (
                        <div className="space-y-4">
                          {msg.content.split('\n').map((line, i) => {
                            const parts = line.split(/(\*\*[^*]+\*\*)/g)
                            if (parts.length === 1) return <p key={i} className="m-0">{line}</p>
                            return (
                              <p key={i} className="m-0">
                                {parts.map((part, j) =>
                                  part.startsWith('**') && part.endsWith('**')
                                    ? <strong key={j} className="font-semibold" style={{ color: isUser ? '#fff' : activeCfg.colorHex }}>{part.slice(2, -2)}</strong>
                                    : <span key={j}>{part}</span>
                                )}
                              </p>
                            )
                          })}
                        </div>
                      )}
                      
                      {!isTyping && (
                        <div className="mt-3 flex items-center gap-2 text-[10px] font-medium tracking-wide opacity-40">
                          {!isUser && <span className="rounded-full border border-white/15 px-2 py-0.5 uppercase tracking-[0.14em]">NOVA response</span>}
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {!isUser && ` · ${activeCfg.display}`}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
            <div ref={messagesEndRef} className="h-4" />
          </div>

          {/* Input Area */}
          <div className="p-6 bg-gradient-to-t from-black via-black/90 to-transparent shrink-0">
            <div className="max-w-4xl mx-auto">
              {/* Smart chips */}
              <div className="flex gap-3 mb-4 overflow-x-auto pb-2 hide-scrollbar">
                {quickActions.map((quickAction, i) => (
                  <motion.button 
                    key={quickAction.action}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    onClick={() => { setInput(quickAction.message); void handleSend(quickAction.message, quickAction.action) }}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-white/70 font-medium whitespace-nowrap transition-colors backdrop-blur-md"
                  >
                    {quickAction.label}
                  </motion.button>
                ))}
              </div>

              {errorMessage && (
                <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
                  {errorMessage}
                </div>
              )}

              {/* Glass Input */}
              <div className="relative group">
                <div className="absolute -inset-1 rounded-[24px] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" style={{ background: activeCfg.gradient }} />
                <div className="relative flex items-center bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-[20px] p-2 pr-2">
                  <div className="pl-4 pr-3 text-white/40 group-focus-within:text-white/80 transition-colors">
                    <Wand2 size={20} />
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder="Initialize query..."
                    disabled={isLoading}
                    className="flex-1 bg-transparent border-none text-white placeholder-white/30 text-[15px] outline-none py-3 focus:ring-0"
                  />
                  <button
                    onClick={() => { void handleSend() }}
                    disabled={isLoading || !input.trim()}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ 
                      background: input.trim() ? activeCfg.gradient : 'rgba(255,255,255,0.05)',
                      boxShadow: input.trim() ? `0 0 20px ${activeCfg.colorHex}50` : 'none'
                    }}
                  >
                    <Send size={18} className="text-white ml-0.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SIDEBAR COMMAND CENTER ═══ */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="shrink-0 border-l border-white/5 bg-black/40 backdrop-blur-3xl overflow-y-auto p-6 flex flex-col gap-6"
            >
              {/* Persona Engine */}
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 transition-all duration-700 group-hover:opacity-40" style={{ background: activeCfg.colorHex }} />
                
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-4 flex items-center gap-2">
                  <Cpu size={12} /> Neural Persona
                </h3>
                
                <div className="flex flex-col gap-2 relative z-10">
                  {personaList.map(p => {
                    const cfg = PERSONA_CONFIG[p.id] || PERSONA_CONFIG['coach']
                    const isActive = activePersona === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => switchPersona(p.id)}
                        className={`flex items-center gap-3 p-3 rounded-2xl transition-all border ${
                          isActive ? 'bg-white/10 border-white/20' : 'border-transparent hover:bg-white/5'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-transform ${isActive ? 'scale-110 shadow-lg' : ''}`} style={{ background: isActive ? cfg.gradient : 'rgba(255,255,255,0.05)', boxShadow: isActive ? `0 0 15px ${cfg.colorHex}40` : 'none' }}>
                          {cfg.emoji}
                        </div>
                        <div className="text-left">
                          <p className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-white/60'}`}>{cfg.display}</p>
                          <p className="text-[10px] text-white/40 mt-0.5">{cfg.tagline}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* RAG Memory Databank */}
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-4 flex items-center gap-2">
                  <Database size={12} /> Memory Matrix
                </h3>
                {ragResults && ragResults.results.length > 0 ? (
                  <div className="space-y-3">
                    {ragResults.results.slice(0, 3).map((r, i) => (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                        key={i} className="p-3 rounded-2xl bg-black/40 border border-white/5 text-xs text-white/70 leading-relaxed"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[9px] uppercase tracking-widest text-white/40">{r.role}</span>
                          <span className={`w-2 h-2 rounded-full ${r.sentiment === 'positive' ? 'bg-emerald-400' : r.sentiment === 'negative' ? 'bg-rose-400' : 'bg-white/20'}`} />
                        </div>
                        <p className="m-0">{r.message.slice(0, 80)}...</p>
                      </motion.div>
                    ))}
                    <div className="text-center text-[10px] text-white/30 pt-2 border-t border-white/5">
                      {ragResults.results_count} nodes retrieved
                    </div>
                  </div>
                ) : (
                  <div className="h-24 flex items-center justify-center text-xs text-white/30 border border-dashed border-white/10 rounded-2xl">
                    No active retrieval
                  </div>
                )}
              </div>

              {/* Mood Telemetry */}
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-4 flex items-center gap-2">
                  <Activity size={12} /> Sentiment Telemetry
                </h3>
                {moodData && moodData.length > 0 ? (
                  <div>
                    <AnimatedSparkline data={moodData} color={activeCfg.colorHex} />
                    <div className="flex justify-between mt-3 px-1">
                      {moodData.slice(-7).map((d, i) => (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            d.dominant_sentiment === 'positive' ? 'bg-emerald-400' :
                            d.dominant_sentiment === 'negative' ? 'bg-rose-400' : 'bg-white/20'
                          }`} />
                          <span className="text-[8px] text-white/30">{d.date.split('-').pop()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-20 flex items-center justify-center text-xs text-white/30 border border-dashed border-white/10 rounded-2xl">
                    Telemetry offline
                  </div>
                )}
              </div>

              {/* Security Badge */}
              <div className="mt-auto rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex gap-3 items-start">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <ShieldCheck size={14} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">Encrypted Protocol</p>
                  <p className="text-[10px] text-emerald-400/60 leading-relaxed m-0">
                    Crisis detection active. Sandbox mode enabled. Metadata strictly isolated.
                  </p>
                </div>
              </div>

            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
