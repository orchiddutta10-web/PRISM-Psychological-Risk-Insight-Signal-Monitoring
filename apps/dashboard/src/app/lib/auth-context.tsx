'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { API_BASE } from '@/lib/api'

const API = API_BASE

interface Guardian {
  id: string
  full_name: string
  email: string
  role: string
}

interface ChildDevice {
  id: string
  guardian_id: string
  name: string
  platform: string
  device_token: string
  last_seen: string
}

interface AuthContextType {
  token: string | null
  guardian: Guardian | null
  devices: ChildDevice[]
  selectedDeviceId: string | null
  setSelectedDeviceId: (id: string) => void
  refreshDevices: () => Promise<void>
  logout: () => void
  isAuthLoaded: boolean
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  guardian: null,
  devices: [],
  selectedDeviceId: null,
  setSelectedDeviceId: () => {},
  refreshDevices: async () => {},
  logout: () => {},
  isAuthLoaded: false,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [guardian, setGuardian] = useState<Guardian | null>(null)
  const [devices, setDevices] = useState<ChildDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [isAuthLoaded, setIsAuthLoaded] = useState(false)

  useEffect(() => {
    const storedToken = localStorage.getItem('prism_token')
    const storedGuardian = localStorage.getItem('prism_guardian')
    const storedDevice = localStorage.getItem('prism_selected_device')

    if (storedToken && storedGuardian) {
      setToken(storedToken)
      try {
        setGuardian(JSON.parse(storedGuardian))
      } catch {
        localStorage.clear()
        setToken(null)
      }
      if (storedDevice) {
        setSelectedDeviceId(storedDevice)
      }
    }
    setIsAuthLoaded(true)
  }, [])

  const refreshDevices = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API}/auth/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        console.warn('Failed to fetch devices: ', res.status)
        return
      }
      const data: ChildDevice[] = await res.json()
      setDevices(data)
      const saved = localStorage.getItem('prism_selected_device')
      if (data.length > 0 && !saved) {
        localStorage.setItem('prism_selected_device', data[0].id)
        setSelectedDeviceId(data[0].id)
      }
    } catch (err) {
      console.warn('Error fetching devices:', err)
    }
  }, [token])

  useEffect(() => {
    if (token) {
      refreshDevices()
    }
  }, [token, refreshDevices])

  const logout = useCallback(() => {
    localStorage.clear()
    setToken(null)
    setGuardian(null)
    setDevices([])
    setSelectedDeviceId(null)
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        token,
        guardian,
        devices,
        selectedDeviceId,
        setSelectedDeviceId: (id: string) => {
          setSelectedDeviceId(id)
          localStorage.setItem('prism_selected_device', id)
        },
        refreshDevices,
        logout,
        isAuthLoaded,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
