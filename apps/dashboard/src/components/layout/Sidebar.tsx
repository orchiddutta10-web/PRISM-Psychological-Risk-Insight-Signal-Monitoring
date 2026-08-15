'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Activity, Bell, MessageCircle, HeartPulse,
  LogOut, ChevronLeft, ChevronRight, Settings, Cpu, Shield,
  Users, FileText, TerminalSquare
} from 'lucide-react'
import { Logo } from '../ui/Logo'
import { clearAuth } from '../../lib/api'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  section?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Command Center', href: '/overview', icon: <LayoutDashboard size={20} />, section: 'Core Platform' },
  { label: 'Alert Triage', href: '/alerts', icon: <Bell size={20} /> },
  { label: 'Devices & Identity', href: '/devices', icon: <Cpu size={20} /> },
  { label: 'Signals & Telemetry', href: '/signals', icon: <Activity size={20} /> },
  { label: 'AI Companion', href: '/chatbot', icon: <MessageCircle size={20} /> },
  { label: 'Guardian Policies', href: '/guardian', icon: <Shield size={20} />, section: 'Governance' },
  { label: 'Audit Log', href: '/overview/audit', icon: <FileText size={20} /> },
  { label: 'PRISM Node', href: '/prism-node', icon: <HeartPulse size={20} />, section: 'System' },
]

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
  guardian: { name: string; role: string }
  onNavigate?: () => void
}

export function Sidebar({ collapsed, onToggle, guardian, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <aside className="flex h-full flex-col relative text-zinc-400">
      
      {/* Brand */}
      <div className={`flex h-20 items-center px-6 shrink-0 transition-all ${collapsed ? 'justify-center px-0' : 'justify-start'}`}>
        <Link href="/overview" onClick={onNavigate} aria-label="PRISM Dashboard" className="flex items-center gap-3.5 group">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-md group-hover:bg-indigo-500/40 transition-colors" />
            <Logo size={28} className="relative text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
          </div>
          {!collapsed && (
            <span className="font-sans text-lg font-extrabold tracking-[0.15em] text-white">
              PRISM
            </span>
          )}
        </Link>
      </div>

      {/* Toggle Button (Desktop Only) */}
      {onToggle && (
        <button
          onClick={onToggle}
          className="hidden lg:flex absolute -right-3.5 top-24 h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-zinc-400 hover:text-white hover:border-indigo-500/50 hover:bg-zinc-800 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all z-20"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronLeft size={14} strokeWidth={2.5} />}
        </button>
      )}

      {/* Main Navigation */}
      <nav aria-label="Main Navigation" className="flex-1 overflow-y-auto px-4 py-6 space-y-1.5 custom-scrollbar">
        {NAV_ITEMS.map((item, idx) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const showSection = item.section && !collapsed && (idx === 0 || NAV_ITEMS[idx - 1].section !== item.section)

          return (
            <React.Fragment key={item.href}>
              {showSection && (
                <div className="pt-6 pb-2 px-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {item.section}
                  </p>
                </div>
              )}
              <Link
                href={item.href}
                onClick={onNavigate}
                className={`group relative flex items-center gap-3.5 rounded-xl px-3 py-3 text-[14px] font-semibold transition-all duration-300 ${
                  collapsed ? 'justify-center' : 'justify-start'
                } ${
                  active
                    ? 'text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
                title={collapsed ? item.label : undefined}
              >
                {/* Active Indicator Background */}
                {active && (
                  <motion.div 
                    layoutId="active-sidebar-pill"
                    className="absolute inset-0 rounded-xl bg-indigo-500/10 border border-indigo-500/20 shadow-[inset_0_0_20px_rgba(99,102,241,0.05)]" 
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                
                {/* Active Left Line */}
                {active && !collapsed && (
                  <motion.div 
                    layoutId="active-sidebar-line"
                    className="absolute left-0 top-1/4 bottom-1/4 w-[3px] rounded-r-full bg-indigo-500 drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                  />
                )}
                
                <span className={`relative z-10 shrink-0 transition-transform duration-300 ${active ? 'text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]' : 'group-hover:scale-110'}`}>
                  {item.icon}
                </span>
                
                {!collapsed && (
                  <span className="relative z-10 truncate">{item.label}</span>
                )}
              </Link>
            </React.Fragment>
          )
        })}
      </nav>

      {/* Footer Area */}
      <div className="p-4 space-y-1.5 border-t border-white/5 bg-zinc-950/30">
        <button
          className={`w-full flex items-center gap-3.5 rounded-xl px-3 py-3 text-[14px] font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all ${
            collapsed ? 'justify-center' : 'justify-start'
          }`}
          title="Settings"
        >
          <Settings size={20} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>

        <button
          onClick={() => {
            clearAuth()
            router.push('/')
          }}
          className={`w-full flex items-center gap-3.5 rounded-xl px-3 py-3 text-[14px] font-semibold text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border hover:border-rose-500/20 transition-all ${
            collapsed ? 'justify-center' : 'justify-start'
          }`}
          title="Sign out"
        >
          <LogOut size={20} className="shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
