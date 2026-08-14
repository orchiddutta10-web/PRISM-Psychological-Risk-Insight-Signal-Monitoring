/** Shared API client and auth helpers for the PRISM Guardian Dashboard. */

function normalizeApiBase(raw?: string | null): string {
  if (!raw || raw.trim() === '') return '/api/v1'
  const trimmed = raw.replace(/\/$/, '')
  if (trimmed.endsWith('/api/v1')) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return `${trimmed}/api/v1`
  return trimmed
}

export const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL)

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

export function clearAuth(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem('prism_token')
  window.localStorage.removeItem('prism_guardian')
  window.localStorage.removeItem('prism_selected_device')
}

/** Builds an absolute ws(s):// URL for the live events socket. */
export function buildWsUrl(path: string, token: string): string {
  const api = process.env.NEXT_PUBLIC_API_URL
  let base: string
  if (api && /^https?:\/\//i.test(api)) {
    base = normalizeApiBase(api).replace(/^http/, 'ws')
  } else {
    base = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8000/api/v1`
  }
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}${suffix.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

export function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export async function apiFetch<T = any>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...init,
    headers: { ...authHeaders(token), 'Cache-Control': 'no-cache', ...(init.headers || {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = Array.isArray(body.detail)
      ? body.detail.map((d: any) => d.msg).join('. ')
      : body.detail || `Request failed (${res.status})`
    const err: any = new Error(detail)
    err.status = res.status
    throw err
  }
  return res.json()
}

export async function apiFetchSafe<T>(path: string, token: string, fallback: T, init: RequestInit = {}): Promise<T> {
  try {
    return await apiFetch<T>(path, token, init)
  } catch {
    return fallback
  }
}

export interface ChildDevice {
  id: string
  guardian_id: string
  name: string
  platform: string
  device_token: string
  last_seen: string
}

export interface BackendAlert {
  id: string
  device_id: string
  severity_tier: 'sage' | 'amber' | 'red' | string
  plain_language_summary: string
  contributing_factors: string[]
  is_viewed: boolean
  timestamp: string
}

export interface RiskScore {
  id: string
  device_id: string
  model_name: string
  score: number
  threshold: number
  flagged: boolean
  contributing_factors: string[]
  timestamp: string
}

export interface InsightScoreResponse {
  subject_id: string
  insight_score: number
  tier_label: string
  tier_summary: string
  anomaly_score: number
  modality_scores: Record<string, number>
  fusion_score: number
  contributing_factors: string[]
  confidence: number
  colab_ml_risk_level?: string | null
  colab_ml_score?: number | null
}

export type BaselineMap = Record<string, { mean: number; variance: number }>

export interface IngestionHealth {
  status: string
  active_modalities: Record<string, 'real' | 'synthetic' | 'inactive' | string>
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'unknown'
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString()
}

export function severityOf(tier: string): 'high' | 'medium' | 'low' {
  if (tier === 'red') return 'high'
  if (tier === 'amber') return 'medium'
  return 'low'
}

export function riskLabel(score: number): string {
  if (score >= 70) return 'Elevated Concern'
  if (score >= 40) return 'Mild Deviation'
  return 'Normal Range'
}
