'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, Sparkles, Send, Mic, Paperclip, User, BrainCircuit
} from 'lucide-react'

const SUGGESTIONS = [
  'Explain my sleep',
  'Analyze my screen time',
  'Why am I stressed?',
  'Improve my routine',
  'I have a headache',
  'Help me sleep better',
  'Nutrition Advice',
  'Mental Wellness'
]

type Message = { id: string; role: 'user' | 'ai'; text: string; isTyping?: boolean }

export default function CompanionChatPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([
    { id: 'msg-1', role: 'ai', text: "Hello Priya 👋\n\nI've reviewed your latest wellness trends. How can I support you today?" }
  ])
  const [input, setInput] = useState('')
  const [isAiTyping, setIsAiTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = (textOverride?: string) => {
    const text = textOverride || input
    if (!text.trim()) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsAiTyping(true)

    // Simulate AI response logic
    setTimeout(() => {
      setIsAiTyping(false)
      const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'ai', text: '' }
      
      // Basic symptom triage
      if (text.toLowerCase().includes('headache') || text.toLowerCase().includes('pain') || text.toLowerCase().includes('sick')) {
        aiMsg.text = "I'd like to understand your symptoms better.\n\nCan I ask a few questions?\n\n• When did it start?\n• Where is the pain?\n• Pain level (1–10)?\n• Fever?\n• Nausea?\n• Have you taken any medication?"
      } else {
        aiMsg.text = "Based on your telemetry, your overall wellness is stable. I'm analyzing the patterns you mentioned. Let's work on adjusting your routine to optimize your baseline."
      }
      
      setMessages(prev => [...prev, aiMsg])
    }, 1500)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] w-full">
      
      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div className="flex-none flex items-center justify-between py-6 px-4 sm:px-8 border-b border-white/5 bg-zinc-950">
        <button 
          onClick={() => router.push('/companion')}
          className="flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back to Companion AI
        </button>
        <div className="flex items-center gap-3">
          <BrainCircuit size={18} className="text-indigo-400" />
          <span className="text-[12px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
            PRISM AI <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </span>
        </div>
      </div>

      {/* ── CHAT AREA ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-8 custom-scrollbar" ref={scrollRef}>
        <div className="max-w-4xl mx-auto flex flex-col gap-8 pb-32">
          
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div 
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 sm:gap-6 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl flex items-center justify-center shadow-lg ${
                  m.role === 'user' 
                    ? 'bg-white/10 border border-white/20' 
                    : 'bg-indigo-500/20 border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)]'
                }`}>
                  {m.role === 'user' ? <User size={20} className="text-white" /> : <Sparkles size={20} className="text-indigo-400" />}
                </div>

                {/* Bubble */}
                <div className={`max-w-[85%] lg:max-w-[75%] rounded-3xl p-5 sm:p-6 text-sm sm:text-base font-medium leading-relaxed shadow-xl ${
                  m.role === 'user'
                    ? 'bg-indigo-500 text-white rounded-tr-sm'
                    : 'bg-zinc-900/50 border border-white/5 text-zinc-200 rounded-tl-sm'
                }`}>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </motion.div>
            ))}

            {isAiTyping && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                className="flex gap-4 sm:gap-6"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                  <Sparkles size={20} className="text-indigo-400" />
                </div>
                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl rounded-tl-sm p-6 flex items-center gap-2 w-24 shadow-xl">
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4 }} className="w-2 h-2 rounded-full bg-indigo-400" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0.2 }} className="w-2 h-2 rounded-full bg-indigo-400" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0.4 }} className="w-2 h-2 rounded-full bg-indigo-400" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* ── INPUT AREA ──────────────────────────────────────────── */}
      <div className="flex-none p-4 sm:p-6 lg:p-8 bg-zinc-950/90 backdrop-blur-md border-t border-white/5">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          
          {/* Quick Suggestions */}
          <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar hide-scrollbar">
            {SUGGESTIONS.map(s => (
              <button 
                key={s} 
                onClick={() => handleSend(s)}
                className="whitespace-nowrap px-4 py-2 rounded-full bg-zinc-900/80 border border-white/5 text-xs font-bold text-zinc-400 hover:bg-white/10 hover:text-white transition-colors shrink-0 shadow-lg"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Chat Bar */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
            className="flex items-center gap-3 bg-zinc-900 border border-white/10 p-2 sm:p-3 rounded-3xl shadow-2xl relative"
          >
            <button type="button" className="p-3 rounded-xl bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 hidden sm:block">
              <Paperclip size={20} />
            </button>
            <input 
              type="text" 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything about your health..."
              className="flex-1 bg-transparent border-none focus:outline-none text-base text-white placeholder-zinc-500 px-2"
            />
            <button type="button" className="p-3 rounded-xl bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0">
              <Mic size={20} />
            </button>
            <button 
              type="submit" 
              disabled={!input.trim()} 
              className="p-3 sm:px-6 rounded-xl bg-white text-zinc-900 font-bold hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center justify-center"
            >
              <Send size={20} className="sm:hidden" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
          <p className="text-center text-[10px] font-medium text-zinc-500 mt-1">
            PRISM AI can make mistakes. Consider verifying critical health information.
          </p>

        </div>
      </div>

    </div>
  )
}
