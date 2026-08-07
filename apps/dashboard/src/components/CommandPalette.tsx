'use client'

import React, { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { 
  Search, ShieldAlert, Cpu, Activity, User, Settings, 
  TerminalSquare, BookOpen, AlertTriangle
} from 'lucide-react'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const runCommand = (command: () => void) => {
    setOpen(false)
    command()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] sm:pt-[15vh]">
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={() => setOpen(false)}
      />
      <div className="relative w-[90vw] max-w-[600px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1C1C1E] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <Command
          className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-white dark:bg-[#1C1C1E]"
          shouldFilter={true}
        >
          <div className="flex items-center border-b border-gray-100 dark:border-gray-800 px-4">
            <Search className="mr-3 h-5 w-5 shrink-0 text-gray-400" />
            <Command.Input
              className="flex h-14 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50 text-gray-900 dark:text-gray-100"
              placeholder="Type a command or search..."
              autoFocus
            />
            <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 font-mono text-[10px] font-medium text-gray-500 opacity-100">
              ESC
            </kbd>
          </div>
          
          <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2 text-sm text-gray-700 dark:text-gray-300">
            <Command.Empty className="py-6 text-center text-sm text-gray-500">
              No results found.
            </Command.Empty>

            <Command.Group heading="Dashboards" className="text-xs font-semibold text-gray-500 px-2 py-1.5 mt-2 mb-1">
              <Command.Item 
                onSelect={() => runCommand(() => router.push('/overview'))}
                className="flex items-center px-3 py-2.5 rounded-lg cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 aria-selected:text-gray-900 dark:aria-selected:text-white"
              >
                <Activity className="mr-3 h-4 w-4" />
                <span>Command Center</span>
              </Command.Item>
              <Command.Item 
                onSelect={() => runCommand(() => router.push('/alerts'))}
                className="flex items-center px-3 py-2.5 rounded-lg cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 aria-selected:text-gray-900 dark:aria-selected:text-white"
              >
                <ShieldAlert className="mr-3 h-4 w-4" />
                <span>Alert Triage</span>
              </Command.Item>
              <Command.Item 
                onSelect={() => runCommand(() => router.push('/signals'))}
                className="flex items-center px-3 py-2.5 rounded-lg cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 aria-selected:text-gray-900 dark:aria-selected:text-white"
              >
                <Activity className="mr-3 h-4 w-4" />
                <span>Signals & Telemetry</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Management" className="text-xs font-semibold text-gray-500 px-2 py-1.5 mt-2 mb-1">
              <Command.Item 
                onSelect={() => runCommand(() => router.push('/devices'))}
                className="flex items-center px-3 py-2.5 rounded-lg cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 aria-selected:text-gray-900 dark:aria-selected:text-white"
              >
                <Cpu className="mr-3 h-4 w-4" />
                <span>Paired Devices</span>
              </Command.Item>
              <Command.Item 
                onSelect={() => runCommand(() => router.push('/guardian'))}
                className="flex items-center px-3 py-2.5 rounded-lg cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 aria-selected:text-gray-900 dark:aria-selected:text-white"
              >
                <User className="mr-3 h-4 w-4" />
                <span>Guardian Identity</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Quick Actions" className="text-xs font-semibold text-gray-500 px-2 py-1.5 mt-2 mb-1">
              <Command.Item 
                onSelect={() => runCommand(() => router.push('/companion'))}
                className="flex items-center px-3 py-2.5 rounded-lg cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 aria-selected:text-gray-900 dark:aria-selected:text-white text-indigo-600 dark:text-indigo-400"
              >
                <TerminalSquare className="mr-3 h-4 w-4" />
                <span>Ask AI Companion</span>
              </Command.Item>
              <Command.Item 
                onSelect={() => runCommand(() => router.push('/alerts'))}
                className="flex items-center px-3 py-2.5 rounded-lg cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 aria-selected:text-gray-900 dark:aria-selected:text-white text-amber-600 dark:text-amber-400"
              >
                <AlertTriangle className="mr-3 h-4 w-4" />
                <span>Review Active Alerts</span>
              </Command.Item>
              <Command.Item 
                onSelect={() => runCommand(() => {
                  const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
                  document.documentElement.setAttribute('data-theme', t)
                  localStorage.setItem('prism_theme', t)
                })}
                className="flex items-center px-3 py-2.5 rounded-lg cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 aria-selected:text-gray-900 dark:aria-selected:text-white"
              >
                <Settings className="mr-3 h-4 w-4" />
                <span>Toggle Theme</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
