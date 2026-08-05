/**
 * Shared API client for the PRISM Guardian Dashboard.
 *
 * All pages should route through this module so the API origin,
 * auth headers, and response mapping live in exactly one place.
 *
 * The dashboard talks to the FastAPI backend either:
 *   - through the Next.js rewrite proxy at /api/v1 (default, same-origin), or
 *   - directly when NEXT_PUBLIC_API_URL is set (e.g. http://localhost:8000/api/v1)
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

/** Builds an absolute ws(s):// URL for the live events socket. */
export function buildWsUrl(path: string, token: string): string {
  const api = process.env.NEXT_PUBLIC_API_URL
  const base = api
    ? api.replace(/^http/, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8000/api/v1`
  return `${base}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

export function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** Fetch JSON with the guardian JWT attached. Throws on non-2xx. */
export async function apiFetch<T = any>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(token), ...(init.headers || {}) },
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

/** Same as apiFetch but tolerates failure — returns the fallback instead of throwing. */
export async function apiFetchSafe<T>(path: string, token: string, fallback: T, init: RequestInit = {}): Promise<T> {
  try {
    return await apiFetch<T>(path, token, init)
  } catch {
    return fallback
  }
}

/* ── Shared domain types (match FastAPI response schemas) ────────────── */

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

export type BaselineMap = Record<string, { mean: number; variance: number }>

export interface IngestionHealth {
  status: string
  active_modalities: Record<string, 'real' | 'synthetic' | 'inactive' | string>
}

/* ── Presentation helpers ────────────────────────────────────────────── */

/** "3 min ago" style relative time. */
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

/** Map backend severity tiers to the dashboard's high/medium/low vocabulary. */
export function severityOf(tier: string): 'high' | 'medium' | 'low' {
  if (tier === 'red') return 'high'
  if (tier === 'amber') return 'medium'
  return 'low'
}

/** Human risk label for a 0–100 aggregate score. */
export function riskLabel(score: number): string {
  if (score >= 70) return 'Elevated Concern'
  if (score >= 40) return 'Mild Deviation'
  return 'Normal Range'
}
