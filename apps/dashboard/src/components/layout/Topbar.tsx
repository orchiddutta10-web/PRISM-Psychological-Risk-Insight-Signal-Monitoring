'use client'

import React from 'react'
import { Bell, Menu, Wifi, WifiOff } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useShell } from './shell-context'
import { cx } from '../../lib/cx'

interface TopbarProps {
  onMenuClick: () => void
  wsStatus: 'connecting' | 'connected' | 'disconnected'
  unreadAlerts: number
}

const TITLES: Record<string, { eyebrow: string; title: string }> = {
  '/overview': { eyebrow: 'Dashboard', title: 'Overview' },
  '/signals': { eyebrow: 'Telemetry', title: 'Signals' },
  '/alerts': { eyebrow: 'Notifications', title: 'Alerts' },
  '/companion': { eyebrow: 'AI Companion', title: 'Companion' },
  '/prism-node': { eyebrow: 'Wearable', title: 'PRISM Node' },
}

export function Topbar({ onMenuClick, wsStatus, unreadAlerts }: TopbarProps) {
  const pathname = usePathname()
  const { openAlerts } = useShell()
  const meta = TITLES[pathname] ?? { eyebrow: 'PRISM', title: 'Dashboard' }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-(--border) bg-(--bg-sidebar)/80 px-4 backdrop-blur-md sm:px-6">
      {/* Mobile menu */}
      <button
        onClick={onMenuClick}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-(--border) text-(--text-secondary) transition-colors hover:text-(--text-primary) lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={17} />
      </button>

      {/* Page title */}
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-(--text-muted)">{meta.eyebrow}</p>
        <h1 className="truncate text-[15px] font-extrabold text-(--text-primary)">{meta.title}</h1>
      </div>

      <div className="flex-1" />

      {/* WS status */}
      <div
        className={cx(
          'hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold sm:flex',
          wsStatus === 'connected' ? 'bg-(--bg-main) text-(--text-primary)' : 'bg-(--bg-main) text-(--text-muted)'
        )}
        title="Live telemetry connection"
      >
        {wsStatus === 'connected' ? (
          <>
            <Wifi size={12} />
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--status-ok) opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-(--status-ok)" />
            </span>
            <span>Live</span>
          </>
        ) : (
          <>
            <WifiOff size={12} />
            <span>{wsStatus === 'connecting' ? 'Connecting' : 'Offline'}</span>
          </>
        )}
      </div>

      {/* Alert bell */}
      <button
        onClick={openAlerts}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-(--border) text-(--text-secondary) transition-colors hover:border-(--text-primary) hover:text-(--text-primary)"
        aria-label={`Open alerts${unreadAlerts ? ` (${unreadAlerts} unread)` : ''}`}
      >
        <Bell size={16} />
        {unreadAlerts > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--accent-red) px-1 text-[9px] font-extrabold text-white">
            {unreadAlerts}
          </span>
        )}
      </button>
    </header>
  )
}
