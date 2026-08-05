'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Activity,
  Bell,
  MessageCircle,
  HeartPulse,
  LogOut,
  Moon,
  Sun,
  Contrast,
} from 'lucide-react'
import { Logo } from '../ui/Logo'
import { useTheme, type Theme } from '../../lib/theme'
import { cx } from '../../lib/cx'
import { clearAuth } from '../../lib/api'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  section?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', href: '/overview', icon: <LayoutDashboard size={17} /> },
  { label: 'Signals', href: '/signals', icon: <Activity size={17} /> },
  { label: 'Alerts', href: '/alerts', icon: <Bell size={17} /> },
  { label: 'Companion', href: '/companion', icon: <MessageCircle size={17} /> },
  { label: 'PRISM Node', href: '/prism-node', icon: <HeartPulse size={17} />, section: 'Wearable' },
]

const themeIcons: Record<Theme, React.ReactNode> = {
  light: <Moon size={15} />,
  dark: <Sun size={15} />,
  'high-contrast': <Contrast size={15} />,
}

interface SidebarProps {
  collapsed?: boolean
  guardian: { name: string; role: string }
  onNavigate?: () => void
}

export function Sidebar({ collapsed, guardian, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const themeOrder: Theme[] = ['light', 'dark', 'high-contrast']
  const cycleTheme = () => {
    const idx = themeOrder.indexOf(theme)
    setTheme(themeOrder[(idx + 1) % themeOrder.length])
  }

  const initials = guardian.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <aside
      className={cx(
        'flex h-full flex-col border-r border-(--border) bg-(--bg-sidebar) transition-[width] duration-200',
        collapsed ? 'w-[72px]' : 'w-[240px]'
      )}
    >
      {/* Brand */}
      <div className={cx('flex h-16 items-center border-b border-(--border) px-5', collapsed && 'justify-center px-0')}>
        <Link href="/overview" onClick={onNavigate} aria-label="PRISM Overview" className="flex items-center gap-2.5">
          <Logo size={26} />
          {!collapsed && <span className="font-mono text-[15px] font-extrabold tracking-[0.16em] text-(--text-primary)">PRISM</span>}
        </Link>
      </div>

      {/* Nav */}
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <React.Fragment key={item.href}>
              {item.section && !collapsed && (
                <p className="mb-1 mt-4 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-(--text-muted)">
                  {item.section}
                </p>
              )}
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cx(
                  'mb-0.5 flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors',
                  collapsed && 'justify-center px-0',
                  active
                    ? 'bg-(--accent) text-(--accent-text)'
                    : 'text-(--text-secondary) hover:bg-(--bg-main) hover:text-(--text-primary)'
                )}
                title={item.label}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            </React.Fragment>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-(--border) p-3">
        {/* Theme cycle */}
        <button
          onClick={cycleTheme}
          className={cx(
            'mb-2 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-(--text-secondary) transition-colors hover:bg-(--bg-main) hover:text-(--text-primary)',
            collapsed && 'justify-center px-0'
          )}
          title="Toggle theme"
        >
          <span className="shrink-0">{themeIcons[theme]}</span>
          {!collapsed && <span>{theme === 'light' ? 'Dark' : theme === 'dark' ? 'High contrast' : 'Light'}</span>}
        </button>

        {/* Guardian chip */}
        {!collapsed && (
          <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--accent) text-[11px] font-extrabold text-(--accent-text)">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-bold text-(--text-primary)">{guardian.name}</p>
              <p className="text-[10px] capitalize text-(--text-muted)">{guardian.role}</p>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            clearAuth()
            router.push('/')
          }}
          className={cx(
            'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-(--text-secondary) transition-colors hover:bg-(--bg-main) hover:text-(--text-primary)',
            collapsed && 'justify-center px-0'
          )}
          title="Sign out"
        >
          <LogOut size={15} className="shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
