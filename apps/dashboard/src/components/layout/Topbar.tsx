'use client'

import React from 'react'
import { Bell, Menu, WifiOff, Search, HelpCircle, ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useShell } from './shell-context'
import { motion } from 'framer-motion'

interface TopbarProps {
  onMenuClick: () => void
  wsStatus: 'connecting' | 'connected' | 'disconnected'
  unreadAlerts: number
}

const TITLES: Record<string, { eyebrow: string; title: string }> = {
  '/overview': { eyebrow: 'Dashboard', title: 'Command Center' },
  '/signals': { eyebrow: 'Telemetry', title: 'Signals' },
  '/alerts': { eyebrow: 'Notifications', title: 'Alert Inbox' },
  '/companion': { eyebrow: 'AI Ecosystem', title: 'Companion AI' },
  '/devices': { eyebrow: 'Management', title: 'Devices & Identity' },
  '/guardian': { eyebrow: 'Governance', title: 'Guardian Policies' },
  '/overview/audit': { eyebrow: 'Governance', title: 'Audit Log' },
  '/prism-node': { eyebrow: 'Hardware', title: 'PRISM Node' },
  '/codebase': { eyebrow: 'System', title: 'Codebase' },
}

export function Topbar({ onMenuClick, wsStatus, unreadAlerts }: TopbarProps) {
  const pathname = usePathname()
  const { openAlerts, guardian } = useShell()
  const meta = TITLES[pathname] ?? { eyebrow: 'PRISM', title: 'Dashboard' }

  return (
    <header className="sticky top-0 z-40 flex h-20 items-center gap-4 border-b border-white/5 bg-zinc-950/60 px-6 backdrop-blur-2xl shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
      
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuClick}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-zinc-400 transition-all hover:bg-white/5 hover:text-white lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>

      {/* Page Title & Breadcrumb */}
      <div className="min-w-0 hidden sm:block">
        <div className="flex items-center gap-2.5 text-sm">
          <span className="font-semibold text-zinc-500 uppercase tracking-widest text-[10px]">{meta.eyebrow}</span>
          <span className="text-zinc-700">/</span>
          <span className="font-bold text-white text-base tracking-tight">{meta.title}</span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Command palette trigger */}
      <button
        type="button"
        onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        className="group hidden w-72 items-center gap-3 rounded-xl border border-white/5 bg-zinc-900/50 px-4 py-2 text-left text-sm text-zinc-400 shadow-inner transition-all hover:border-white/10 hover:bg-zinc-900 lg:flex"
        aria-label="Open PRISM search"
      >
        <Search size={16} className="transition-colors group-hover:text-white" />
        <span className="flex-1 font-medium transition-colors group-hover:text-zinc-300">Search the ecosystem...</span>
        <kbd className="hidden items-center justify-center rounded border border-white/5 bg-zinc-800 px-2 py-1 font-sans text-[10px] font-bold text-zinc-500 shadow sm:flex">⌘K</kbd>
      </button>

      {/* Connection Status Badge */}
      <div
        className={`hidden items-center gap-2.5 rounded-full px-4 py-2 text-xs font-bold sm:flex transition-all border shadow-sm ${
          wsStatus === 'connected' 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
            : 'bg-zinc-900 text-zinc-500 border-white/5'
        }`}
        title="Live telemetry connection"
      >
        {wsStatus === 'connected' ? (
          <>
            <div className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            </div>
            <span className="tracking-wide">Live Sync</span>
          </>
        ) : (
          <>
            <WifiOff size={14} />
            <span className="tracking-wide">{wsStatus === 'connecting' ? 'Connecting...' : 'Offline'}</span>
          </>
        )}
      </div>

      {/* Action Icons */}
      <div className="flex items-center gap-3 ml-2">
        <button className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white transition-colors">
          <HelpCircle size={20} />
        </button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={openAlerts}
          className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/5 text-zinc-300 hover:bg-white/10 hover:text-white transition-colors shadow-sm"
          aria-label={`Open alerts${unreadAlerts ? ` (${unreadAlerts} unread)` : ''}`}
        >
          <Bell size={20} />
          {unreadAlerts > 0 && (
            <motion.span 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-500 px-1.5 text-[10px] font-bold text-white shadow-[0_0_10px_rgba(99,102,241,0.6)] border-2 border-zinc-950"
            >
              {unreadAlerts}
            </motion.span>
          )}
        </motion.button>

        {/* User Menu Trigger */}
        <div className="ml-4 pl-4 border-l border-white/10 flex items-center gap-3 cursor-pointer group">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-rose-500 flex items-center justify-center text-white text-sm font-extrabold shadow-[0_0_15px_rgba(99,102,241,0.4)] group-hover:shadow-[0_0_20px_rgba(99,102,241,0.6)] transition-all">
            {guardian?.name?.charAt(0).toUpperCase() || 'G'}
          </div>
          <ChevronDown size={16} className="text-zinc-500 group-hover:text-white transition-colors hidden sm:block" />
        </div>
      </div>
    </header>
  )
}
