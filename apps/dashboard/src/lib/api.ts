/** Centralized API + auth-storage helpers for the PRISM dashboard. */

export const API = 'http://localhost:8000/api/v1'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem('prism_token')
}

export function getGuardian(): { full_name?: string; role?: string; id?: string } | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem('prism_guardian')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getSelectedDevice(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem('prism_selected_device')
}

export function setSelectedDevice(id: string) {
  window.localStorage.setItem('prism_selected_device', id)
}

export function clearAuth() {
  window.localStorage.removeItem('prism_token')
  window.localStorage.removeItem('prism_guardian')
  window.localStorage.removeItem('prism_selected_device')
}
