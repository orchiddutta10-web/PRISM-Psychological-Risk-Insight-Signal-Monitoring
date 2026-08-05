'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { NotificationPanel, type NotifAlert } from './NotificationPanel'
import { ShellProvider } from './shell-context'
import { cx } from '../../lib/cx'
import { getGuardian, getToken } from '../../lib/api'

interface AppShellProps {
  children: React.ReactNode
  /** Initial alerts — pages may pass their own state via children instead. */
  initialAlerts?: NotifAlert[]
  /** WebSocket status — pages owning a WS pass it here for the topbar. */
  wsStatus?: 'connecting' | 'connected' | 'disconnected'
}

/**
 * App-wide chrome for authed dashboard pages: sidebar + topbar + notifications.
 * Renders {children} inside a scrollable main. Handles auth guard + guardian
 * identity from localStorage (preserves existing behavior).
 */
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

  return (
    <ShellProvider value={{ openAlerts, guardian }}>
      <div className="flex h-screen bg-(--bg-main) text-(--text-primary)">
        {/* Desktop sidebar */}
        <div className={cx('hidden h-full shrink-0 lg:block', sidebarCollapsed ? 'w-[72px]' : 'w-[240px]')}>
          <Sidebar collapsed={sidebarCollapsed} guardian={guardian} />
        </div>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
            <div className="anim-drawer absolute left-0 top-0 h-full w-[260px]">
              <Sidebar collapsed={false} guardian={guardian} onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            onMenuClick={() => setMobileNavOpen(true)}
            wsStatus={wsStatus}
            unreadAlerts={unread}
          />
          <main className="flex-1 overflow-y-auto">
            <div className="py-6 sm:py-8">{children}</div>
          </main>
        </div>

        <NotificationPanel
          open={alertsOpen}
          alerts={alerts}
          onClose={() => setAlertsOpen(false)}
          onRead={markRead}
        />
      </div>
    </ShellProvider>
  )
}
