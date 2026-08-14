'use client'

import React, { createContext, useContext } from 'react'

interface ShellContextValue {
  /** Open the notifications slide-over. */
  openAlerts: () => void
  /** Guardian identity (from localStorage). */
  guardian: { name: string; role: string }
}

const ShellContext = createContext<ShellContextValue | null>(null)

export function ShellProvider({ value, children }: { value: ShellContextValue; children: React.ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used within a ShellProvider')
  return ctx
}
