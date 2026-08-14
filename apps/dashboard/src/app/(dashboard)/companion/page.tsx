<<<<<<< HEAD
import { redirect } from 'next/navigation'

export default function CompanionPage() {
  redirect('/companion/chat')
=======
'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { 
  Sparkles, Activity, Moon, Clock, BrainCircuit, Heart, 
  ArrowUpRight, ArrowDownRight, ArrowRight, Zap, CheckCircle2, MessageSquarePlus
} from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'

const OBSERVATIONS = [
  { id: 1, icon: Clock, colorClass: 'text-amber-400', bgClass: 'bg-amber-500/10', borderClass: 'border-amber-500/20', title: 'Screen time increased by 18% this week.', severity: 'Warning', time: '2 hours ago' },
  { id: 2, icon: Moon, colorClass: 'text-rose-400', bgClass: 'bg-rose-500/10', borderClass: 'border-rose-500/20', title: 'Sleep became less consistent.', severity: 'Alert', time: 'Yesterday' },
  { id: 3, icon: Activity, colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/20', title: 'Daily activity improved by 1,200 steps.', severity: 'Positive', time: '5 hours ago' },
  { id: 4, icon: BrainCircuit, colorClass: 'text-indigo-400', bgClass: 'bg-indigo-500/10', borderClass: 'border-indigo-500/20', title: 'Stress indicators remain stable.', severity: 'Positive', time: 'Yesterday' },
]

const RECOMMENDATIONS = [
  { id: 1, icon: Moon, title: 'Improve Sleep', desc: 'Reduce Evening Screen Time' },
  { id: 2, icon: Activity, title: 'Take a Walk', desc: 'Boost physical activity naturally' },
  { id: 3, icon: Heart, title: 'Practice Breathing Exercise', desc: 'Regulate nervous system' },
  { id: 4, icon: CheckCircle2, title: 'Hydrate', desc: 'Drink 500ml water' },
]

const CONVERSATIONS = [
  { id: 1, topic: 'Sleep Analysis', date: 'Yesterday' },
  { id: 2, topic: 'Stress Check-in', date: '3 Days Ago' },
  { id: 3, topic: 'Headache Discussion', date: 'Last Week' },
]

export default function CompanionDashboard() {
  const router = useRouter()

  return (
    <PageContainer size="wide">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 mt-2">
        <PageHeader 
          eyebrow="Companion AI"
          title="Good Evening, Priya 👋"
          subtitle="I've analyzed your recent wellness data and found a few important insights."
          className="mb-0"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-12">
        
        {/* ── LEFT COLUMN: WELLNESS OVERVIEW ──────────────────────── */}
        <div className="xl:col-span-2 flex flex-col gap-8">
          
          {/* Overall Wellness Hero Card */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900/50 border border-white/5 p-8 lg:p-10 rounded-3xl shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center gap-10 backdrop-blur-md"
          >
            <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[150%] bg-indigo-500/10 blur-[100px] rounded-full mix-blend-screen pointer-events-none" />
            
            <div className="relative shrink-0 flex items-center justify-center">
              <svg className="w-40 h-40 transform -rotate-90 relative z-10" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="none" />
                <circle cx="50" cy="50" r="40" stroke="#6366f1" strokeWidth="8" fill="none" strokeDasharray="251.2" strokeDashoffset={251.2 * (1 - 0.82)} strokeLinecap="round" className="drop-shadow-[0_0_12px_rgba(99,102,241,0.5)]" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                <span className="text-4xl font-extrabold text-white tracking-tighter">82<span className="text-2xl text-white/50">%</span></span>
              </div>
            </div>

            <div className="relative z-10 flex-1 text-center md:text-left">
              <p className="text-[12px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Overall Wellness</p>
              <div className="flex items-center justify-center md:justify-start gap-4 mb-4">
                <h2 className="text-3xl font-extrabold text-white">GOOD</h2>
                <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-sm font-bold">
                  <ArrowUpRight size={16} /> +4 this week
                </div>
              </div>
              <p className="text-base text-zinc-400 font-medium leading-relaxed">
                &quot;Your overall wellness is stable. Improving sleep consistency could increase your score.&quot;
              </p>
            </div>
          </motion.div>

          {/* Health Summary Cards */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            {[
              { label: 'Sleep', val: '7h 15m', trend: -12, colorClass: 'text-indigo-400', bgClass: 'bg-indigo-500/10', icon: Moon, desc: 'Less consistent' },
              { label: 'Screen Time', val: '4h 30m', trend: +18, colorClass: 'text-amber-400', bgClass: 'bg-amber-500/10', icon: Clock, desc: 'Increased by 18%' },
              { label: 'Activity', val: '6,240', trend: +1200, colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10', icon: Activity, desc: '+1,200 steps' },
              { label: 'Mental', val: 'Stable', trend: 0, colorClass: 'text-indigo-400', bgClass: 'bg-indigo-500/10', icon: BrainCircuit, desc: 'No distress detected' },
            ].map((s, i) => (
              <div key={i} className="bg-zinc-900/40 border border-white/5 p-6 rounded-3xl flex flex-col hover:bg-white/[0.03] transition-colors shadow-lg backdrop-blur-sm">
                <div className="flex items-start justify-between mb-6">
                  <div className={`p-2.5 rounded-xl ${s.bgClass}`}>
                    <s.icon size={20} className={s.colorClass} />
                  </div>
                  {s.trend !== 0 && (
                    <div className={`flex items-center gap-1 text-[12px] font-bold ${s.trend > 0 ? (s.label==='Screen Time'? 'text-rose-400' : 'text-emerald-400') : 'text-amber-400'}`}>
                      {s.trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {s.trend > 0 && s.label !== 'Activity' ? `+${Math.abs(s.trend)}%` : Math.abs(s.trend)}
                    </div>
                  )}
                </div>
                <p className="text-2xl font-extrabold text-white mb-1">{s.val}</p>
                <p className="text-[12px] font-bold uppercase tracking-widest text-zinc-500 mb-2">{s.label}</p>
                <p className="text-sm text-zinc-400 font-medium leading-snug">{s.desc}</p>
              </div>
            ))}
          </motion.div>

          {/* AI Observations */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-zinc-900/40 border border-white/5 rounded-3xl p-8 shadow-lg backdrop-blur-sm"
          >
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-400" /> AI Insights
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {OBSERVATIONS.map((obs) => (
                <div key={obs.id} className="flex gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
                  <div className={`mt-0.5 shrink-0 flex items-center justify-center w-8 h-8 rounded-full ${obs.bgClass} ${obs.borderClass}`}>
                    <div className={`w-2 h-2 rounded-full ${obs.bgClass.replace('/10','')} shadow-sm`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white leading-relaxed mb-2">{obs.title}</p>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${obs.colorClass}`}>{obs.severity}</span>
                      <span className="text-[10px] font-medium text-zinc-500">{obs.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── RIGHT COLUMN: HERO CTA, RECOMMENDATIONS & HISTORY ─────────────── */}
        <div className="flex flex-col gap-8">
          
          {/* Hero CTA Card */}
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
            className="bg-zinc-900/40 border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-md"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/20 blur-[80px] rounded-full pointer-events-none" />
            <h2 className="text-xl font-extrabold text-white mb-2 relative z-10 flex items-center gap-2">
              🧠 Ready to Talk with PRISM?
            </h2>
            <p className="text-sm text-zinc-400 font-medium leading-relaxed mb-6 relative z-10">
              Get personalized health guidance, mental wellness support, and explanations of your latest telemetry.
            </p>
            
            <motion.button
              onClick={() => router.push('/companion/chat')}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.98 }}
              animate={{ y: [0, -4, 0] }}
              transition={{ y: { duration: 4, repeat: Infinity, ease: "easeInOut" } }}
              className="relative w-full overflow-hidden rounded-full group cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 opacity-90 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-30 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.8)_50%,transparent_75%)] bg-[length:250%_250%] animate-shimmer" />
              <div className="relative z-10 flex flex-col items-center justify-center px-8 py-5 h-[72px] shadow-[0_0_30px_rgba(56,189,248,0.4)] group-hover:shadow-[0_0_50px_rgba(56,189,248,0.6)] transition-shadow duration-300">
                <div className="flex items-center gap-2 text-white font-extrabold text-base">
                  <Sparkles size={18} /> Start AI Conversation
                </div>
                <div className="text-[11px] font-medium text-white/80 mt-0.5">
                  Ask PRISM anything about your health
                </div>
              </div>
            </motion.button>
          </motion.div>

          {/* Recommendations */}
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="bg-zinc-900/40 border border-white/5 rounded-3xl p-8 shadow-lg backdrop-blur-sm"
          >
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
              <Zap size={16} className="text-emerald-400" /> Recommended Actions
            </h2>
            <div className="space-y-3">
              {RECOMMENDATIONS.map((act) => (
                <button key={act.id} className="w-full flex items-center justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all group text-left">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                      <act.icon size={18} className="text-zinc-400 group-hover:text-white transition-colors" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white mb-0.5">{act.title}</p>
                      <p className="text-xs text-zinc-400 font-medium">{act.desc}</p>
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-zinc-400 group-hover:text-white opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </button>
              ))}
            </div>
          </motion.div>

          {/* Recent Conversations */}
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
            className="bg-zinc-900/40 border border-white/5 rounded-3xl p-8 shadow-lg flex-1 backdrop-blur-sm"
          >
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
              <BrainCircuit size={16} className="text-indigo-400" /> Recent Conversations
            </h2>
            <div className="space-y-4">
              {CONVERSATIONS.map((conv) => (
                <div key={conv.id} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    🧠 {conv.topic}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{conv.date}</p>
                    <button 
                      onClick={() => router.push('/companion/chat')}
                      className="text-[11px] font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
                    >
                      Continue <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
          
        </div>
      </div>
    </PageContainer>
  )
>>>>>>> feature/dashboard-ui
}
