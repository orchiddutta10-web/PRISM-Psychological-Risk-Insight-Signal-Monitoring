'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { NotificationPanel, type NotifAlert } from './NotificationPanel'
import { ShellProvider } from './shell-context'
import { getGuardian, getToken } from '../../lib/api'
import { CommandPalette } from '../CommandPalette'
import { PresentationModeToggle, ScenarioSwitcher } from '../DemoControls'

interface AppShellProps {
  children: React.ReactNode
  initialAlerts?: NotifAlert[]
  wsStatus?: 'connecting' | 'connected' | 'disconnected'
}

export function AppShell({ children, initialAlerts = [], wsStatus = 'disconnected' }: AppShellProps) {
  const router = useRouter()
  const [guardian, setGuardian] = useState({ name: 'Guardian', role: 'guardian' })
  const [alerts, setAlerts] = useState<NotifAlert[]>(initialAlerts)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const token = getToken()
    const g = getGuardian()
    if (!token || !g) {
      router.push('/')
      return
    }
    setGuardian({ name: g.full_name || 'Guardian', role: g.role || 'guardian' })
  }, [router])

  const openAlerts = useCallback(() => setAlertsOpen(true), [])
  const markRead = useCallback((id: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)))
  }, [])
  const unread = alerts.filter((a) => !a.read).length
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

  return (
    <ShellProvider value={{ openAlerts, guardian }}>
      <div className="flex h-screen bg-zinc-950 text-white font-sans selection:bg-indigo-500/30 overflow-hidden relative">
        
        {/* Ambient Animated Mesh Background */}
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-600/10 blur-[120px] mix-blend-screen animate-pulse duration-[8000ms]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-rose-500/10 blur-[150px] mix-blend-screen" />
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.15] mix-blend-overlay" />
        </div>

        {/* Desktop sidebar */}
        <motion.div 
          layout
          initial={false}
          animate={{ width: sidebarCollapsed ? 80 : 260 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          className="hidden lg:block h-full shrink-0 relative z-10 border-r border-white/5 bg-zinc-950/50 backdrop-blur-3xl shadow-[4px_0_24px_rgba(0,0,0,0.2)]"
        >
          <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} guardian={guardian} />
        </motion.div>

        {/* Mobile drawer overlay */}
        <AnimatePresence>
          {mobileNavOpen && (
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                onClick={() => setMobileNavOpen(false)} 
                aria-hidden="true" 
              />
              <motion.div 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                className="absolute left-0 top-0 h-full w-[280px] bg-zinc-950/90 backdrop-blur-3xl border-r border-white/5 shadow-2xl"
              >
                <Sidebar collapsed={false} guardian={guardian} onNavigate={() => setMobileNavOpen(false)} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col relative z-0">
          <Topbar
            onMenuClick={() => setMobileNavOpen(true)}
            wsStatus={wsStatus}
            unreadAlerts={unread}
          />
          {demoMode && (
            <div className="hidden items-center justify-end gap-3 border-b border-white/5 bg-zinc-950/40 px-6 py-2 lg:flex">
              <ScenarioSwitcher />
              <PresentationModeToggle />
            </div>
          )}
          <main className="flex-1 overflow-y-auto relative z-0 scroll-smooth">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
              className="max-w-[1440px] mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8"
            >
              {children}
            </motion.div>
            {demoMode && (
              <footer className="border-t border-white/5 px-6 py-4 text-center text-xs text-zinc-500">
                PRISM is operating in demonstration mode. Displayed telemetry is simulated for evaluation.
              </footer>
            )}
          </main>
        </div>

        {/* Alerts Panel */}
        <NotificationPanel
          open={alertsOpen}
          alerts={alerts}
          onClose={() => setAlertsOpen(false)}
          onRead={markRead}
        />
        <CommandPalette />
      </div>
    </ShellProvider>
  )
}
