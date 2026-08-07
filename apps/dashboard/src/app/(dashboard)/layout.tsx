'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell, LogOut, Shield, Activity, Users, Settings, Database,
  Search, ShieldAlert, FileText, Code, Menu, X, AppWindow,
  Cpu, ActivitySquare, TerminalSquare, AlertTriangle
} from 'lucide-react'
import { CommandPalette } from '../../components/CommandPalette'
import { PresentationModeToggle, ScenarioSwitcher } from '../../components/DemoControls'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)

  const handleLogout = () => {
    localStorage.clear()
    router.push('/')
  }

  const NAVIGATION = [
    { name: 'Command Center', href: '/overview', icon: ActivitySquare },
    { name: 'Alert Triage', href: '/alerts', icon: AlertTriangle },
    { name: 'Devices & Identity', href: '/devices', icon: Cpu },
    { name: 'Signals & Telemetry', href: '/signals', icon: Activity },
    { name: 'AI Companion', href: '/companion', icon: TerminalSquare },
    { name: 'Chatbot', href: '/chatbot', icon: TerminalSquare },
    { name: 'Policies', href: '/guardian', icon: Shield },
  ]

  const Sidebar = () => (
    <nav className="flex flex-col h-full bg-[#0A0A0A] border-r border-[#1C1C1E] text-[#D9D8D4] presentation-hide-sidebar">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-[#1C1C1E]">
        <div className="flex items-center gap-3">
          <div className="relative w-7 h-7">
            <div className="absolute inset-0 rounded-full border-2 border-white" />
            <div className="absolute top-[5px] left-[5px] w-3 h-3 rounded-full border border-white opacity-40" />
          </div>
          <span className="font-mono font-bold tracking-[0.16em] text-white">PRISM</span>
        </div>
      </div>

      {/* Nav Links */}
      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        <p className="px-3 text-[10px] font-bold tracking-[0.12em] text-[#8E8E93] uppercase mb-4">Core Platform</p>
        
        {NAVIGATION.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                isActive 
                  ? 'bg-white text-black' 
                  : 'text-[#AEAEB2] hover:bg-[#1C1C1E] hover:text-white'
              }`}
            >
              <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
              {item.name}
            </Link>
          )
        })}
      </div>

      {/* Footer Profile & Logout */}
      <div className="p-4 border-t border-[#1C1C1E]">
        <button 
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-[#AEAEB2] hover:bg-[#1C1C1E] hover:text-white rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </nav>
  )

  return (
    <div className="flex h-screen bg-[#F5F5F5] dark:bg-[#000000] overflow-hidden font-sans">
      
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative flex w-full max-w-xs flex-col">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:pl-64 h-full presentation-main-content">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-[#E5E5EA] dark:border-[#2C2C2E] bg-white dark:bg-[#1C1C1E] sticky top-0 z-40 presentation-hide-header">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-md"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="hidden md:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium">{NAVIGATION.find(n => pathname.startsWith(n.href))?.name || 'Dashboard'}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
              <>
                <ScenarioSwitcher />
                <PresentationModeToggle />
                <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />
              </>
            )}

            {/* Command Palette Trigger */}
            <button 
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 dark:bg-[#2C2C2E] rounded-md border border-gray-200 dark:border-gray-700 hover:border-gray-300 transition-colors"
            >
              <Search size={14} />
              <span>Search PRISM...</span>
              <kbd className="ml-2 px-1.5 py-0.5 text-[10px] bg-white dark:bg-[#1C1C1E] rounded border border-gray-200 dark:border-gray-700 font-mono">⌘K</kbd>
            </button>

            <button className="relative p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-[#2C2C2E] rounded-full transition-colors">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-[#1C1C1E]" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1">
            {children}
          </div>
          
          {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
            <footer className="py-4 px-6 text-center text-xs text-gray-400 dark:text-gray-600 border-t border-gray-200 dark:border-[#1C1C1E] opacity-50 hover:opacity-100 transition-opacity presentation-hide-footer">
              PRISM is currently operating in Demonstration Mode. All displayed behavioral telemetry, AI insights, and user profiles are simulated for evaluation and presentation purposes. No real personal data is being processed.
            </footer>
          )}
        </main>
      </div>

      <CommandPalette />
    </div>
  )
}
