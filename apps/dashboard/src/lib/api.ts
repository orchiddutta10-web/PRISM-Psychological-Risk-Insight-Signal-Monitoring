/**
 * Centralized API endpoint resolution for the PRISM dashboard.
 *
 * In development the Next.js dev server proxies `/api/v1/*` to the backend
 * (see next.config.js rewrites), so pages can use same-origin relative URLs.
 * For deployments where the dashboard and API are served from different
 * origins, set NEXT_PUBLIC_API_URL to the backend base (e.g.
 * https://api.example.com/api/v1) and this module will use it instead.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '/api/v1'

/** Base URL for REST calls (relative by default → proxied by Next.js). */
export const API = API_BASE

/**
 * Backwards-compat alias for `API` — some pages import the older name.
 * Pages that read the API base directly should prefer `API`.
 */
export { API_BASE }

/**
 * Lightweight auth helpers — use these from pages that don't want to
 * subscribe to the React `AuthContext` (e.g. one-shot fetches outside of
 * the protected layout). For interactive flows, prefer `useAuth()` from
 * `app/lib/auth-context.tsx`.
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem('prism_token')
  } catch {
    return null
  }
}

export interface StoredGuardian {
  id: string
  full_name: string
  email: string
  role: string
}

export function getGuardian(): StoredGuardian | null {
  return readJsonLocalStorage<StoredGuardian | null>('prism_guardian', null)
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem('prism_token')
    window.localStorage.removeItem('prism_guardian')
    window.localStorage.removeItem('prism_selected_device')
  } catch {
    // ignore
  }
}

/**
 * Persist the currently-selected device id (the auth-context equivalent of
 * the same operation).
 */
export function setSelectedDevice(deviceId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem('prism_selected_device', deviceId)
  } catch {
    // ignore
  }
}

/**
 * Wrapped fetch that:
 *   - Prepends `API` to the path
 *   - Adds the `Authorization: Bearer <token>` header when a token is passed
 *   - Returns `fallback` on network error or non-2xx response
 * Use this from dashboard pages that don't want to throw inside render.
 */
export async function apiFetchSafe<T>(
  path: string,
  token: string | null,
  fallback: T,
  init: RequestInit = {},
): Promise<T> {
  if (!token) return fallback
  try {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    }
    const res = await fetch(`${API}${path}`, { ...init, headers })
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn(`[prism] apiFetchSafe(${path}) failed:`, err)
    }
    return fallback
  }
}

/* ── Domain types used across pages ───────────────────────────────────── */

export interface ChildDevice {
  id: string
  guardian_id?: string
  name: string
  platform: string
  device_token?: string
  last_seen?: string | null
  risk_score?: number
  risk_label?: string
  latest_alert?: {
    severity_tier: string
    summary?: string
    timestamp: string
  } | null
  consent_count?: number
}

export interface BackendAlert {
  id: string
  device_id: string
  severity_tier: string
  plain_language_summary: string
  contributing_factors: string[]
  is_viewed: boolean
  timestamp: string
}

export interface IngestionHealth {
  status: string
  modalities?: Record<string, { status: 'real' | 'synthetic' | 'inactive'; last_seen: string | null }>
  active_modalities?: Record<string, { status: 'real' | 'synthetic' | 'inactive'; last_seen: string | null }>
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60 * MS_PER_SECOND
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

/**
 * Human-readable "time ago" string for a timestamp. Falls back to the raw
 * timestamp when the input is unparseable.
 */
export function timeAgo(ts: string | number | Date | null | undefined): string {
  if (ts === null || ts === undefined || ts === '') return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  const ms = Date.now() - d.getTime()
  if (Number.isNaN(ms)) return String(ts)
  if (ms < 0) return 'just now'
  if (ms < MS_PER_MINUTE) return `${Math.max(1, Math.round(ms / MS_PER_SECOND))}s ago`
  if (ms < MS_PER_HOUR) return `${Math.round(ms / MS_PER_MINUTE)}m ago`
  if (ms < MS_PER_DAY) return `${Math.round(ms / MS_PER_HOUR)}h ago`
  return `${Math.round(ms / MS_PER_DAY)}d ago`
}

/**
 * Map a backend severity tier to the dashboard's "high/medium/low" shape.
 */
export function severityOf(
  tier: string | null | undefined,
): 'high' | 'medium' | 'low' {
  switch ((tier || '').toLowerCase()) {
    case 'red':
    case 'high':
    case 'urgent':
      return 'high'
    case 'amber':
    case 'medium':
    case 'moderate':
      return 'medium'
    default:
      return 'low'
  }
}

/**
 * Safe localStorage read for JSON-encoded values. Returns `fallback` if the
 * key is missing or the stored value is corrupt — protects every page from
 * crashing on mount when one dashboard key gets into a bad state.
 */
export function readJsonLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn(`[prism] Failed to parse localStorage[${key}]:`, err)
    }
    try {
      window.localStorage.removeItem(key)
    } catch {
      // ignore — quota / privacy mode may block writes
    }
    return fallback
  }
}

/**
 * fetch() wrapper that treats 401 as a session-expiry signal: it clears the
 * stored token and redirects to the login page. Access tokens expire after
 * ACCESS_TOKEN_EXPIRE_MINUTES (now 24h in dev), and without this the dashboard
 * would silently fall back to demo data once a session expires.
 */
export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, init)
  if (res.status === 401) {
    // Token expired — clear and redirect to login
    localStorage.removeItem('prism_token')
    localStorage.removeItem('prism_guardian')
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.href = '/'
    }
  }
  return res
}

/**
 * Derive a WebSocket URL from the configured API base.
 * http(s):// → ws(s):// and the API base already includes /api/v1.
 */
export function wsUrl(path: string): string {
  if (/^wss?:\/\//.test(API_BASE)) return `${API_BASE}${path}`
  const { protocol, host } = window.location
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProto}//${host}${API_BASE}${path}`
}

export interface PrismPrediction {
  status: 'ok'
  classifier: {
    index: number
    label: string
    probabilities: Record<string, number>
  }
  regressor: {
    score: number
    label: string
    name: string
    thresholds: { low_max: number; high_min: number }
  }
  data_sufficiency: Record<string, number>
  feature_status: Record<string, string>
  model_version: Record<string, string>
  generated_at: string
}

export async function fetchPrismPrediction(
  deviceId: string,
  token: string
): Promise<PrismPrediction | { error: string, reason?: string }> {
  try {
    const res = await authFetch(`/prism/predict/${deviceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) {
      return {
        error: data?.detail?.message || data?.message || 'Failed to fetch PRISM prediction',
        reason: data?.detail?.reason,
      }
    }
    return data as PrismPrediction
  } catch (err) {
    return { error: 'Network error or server unavailable' }
  }
}
