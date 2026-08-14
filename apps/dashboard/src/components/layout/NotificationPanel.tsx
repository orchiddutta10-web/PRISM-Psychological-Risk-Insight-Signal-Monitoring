'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

export interface NotifAlert {
  id: string
  severity: 'low' | 'medium' | 'high'
  title: string
  summary: string
  factors?: string[]
  device?: string
  time: string
  read?: boolean
}

interface NotificationPanelProps {
  open: boolean
  alerts: NotifAlert[]
  onClose: () => void
  onRead: (id: string) => void
}

const sevMeta: Record<NotifAlert['severity'], { label: string; dot: string; glow: string }> = {
  low: { label: 'LOW', dot: 'bg-emerald-500', glow: 'shadow-[0_0_8px_rgba(16,185,129,0.8)]' },
  medium: { label: 'MODERATE', dot: 'bg-amber-500', glow: 'shadow-[0_0_8px_rgba(245,158,11,0.8)]' },
  high: { label: 'HIGH', dot: 'bg-rose-500', glow: 'shadow-[0_0_8px_rgba(244,63,94,0.8)]' },
}

export function NotificationPanel({ open, alerts, onClose, onRead }: NotificationPanelProps) {
  const unread = alerts.filter((a) => !a.read).length

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={onClose} 
            aria-hidden="true" 
          />

          {/* Panel */}
          <motion.div 
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
            className="relative z-10 flex h-full w-full max-w-[420px] flex-col border-l border-white/10 bg-zinc-950/90 backdrop-blur-3xl shadow-2xl"
          >
            <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none opacity-50" />
            
            <div className="flex items-center justify-between border-b border-white/10 px-8 py-6 bg-white/[0.02]">
              <div>
                <p className="text-xl font-extrabold text-white tracking-tight">Alert Inbox</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  {unread} unread · {alerts.length} total
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/5 text-zinc-400 hover:text-white transition-colors shadow-sm"
                aria-label="Close alerts"
              >
                <X size={18} />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {alerts.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center opacity-50">
                  <div className="h-16 w-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <p className="text-3xl text-emerald-500">✓</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-white tracking-wide">No alerts yet</p>
                    <p className="text-sm font-medium text-zinc-400 mt-1">You&apos;re all caught up.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 py-4 px-4">
                  <AnimatePresence mode="popLayout">
                    {alerts.map((a) => {
                      const meta = sevMeta[a.severity]
                      return (
                        <motion.button
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          key={a.id}
                          onClick={() => onRead(a.id)}
                          className={`block w-full rounded-2xl border p-5 text-left transition-all duration-300 hover:bg-white/10 hover:border-white/20 ${
                            !a.read ? 'border-white/10 bg-white/5 shadow-[0_0_15px_rgba(255,255,255,0.02)]' : 'border-transparent opacity-60'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full shadow-sm ${!a.read ? `${meta.dot} ${meta.glow}` : 'bg-zinc-700'}`} />
                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex items-start justify-between gap-3">
                                <span className={`text-sm font-bold tracking-wide ${!a.read ? 'text-white' : 'text-zinc-300'}`}>{a.title}</span>
                                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{a.time}</span>
                              </div>
                              <p className="mb-4 text-xs leading-relaxed text-zinc-400 font-medium">{a.summary}</p>
                              
                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-300 shadow-inner">
                                  {meta.label}
                                </span>
                                {a.device && (
                                  <span className="rounded-full border border-white/5 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500 shadow-inner">
                                    {a.device}
                                  </span>
                                )}
                              </div>

                              {a.factors && a.factors.length > 0 && (
                                <ul className="mt-4 space-y-2 border-t border-white/5 pt-4">
                                  {a.factors.map((f, fi) => (
                                    <li key={fi} className="flex items-start gap-2.5 text-[11px] text-zinc-400 font-medium">
                                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.8)]" />
                                      {f}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </motion.button>
                      )
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
