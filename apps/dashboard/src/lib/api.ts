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
 * Attempt to transparently refresh the guardian token by re-logging in.
 * This handles the case where a session expires mid-use without forcing
 * a hard redirect to the login page.
 */
async function tryRefreshToken(): Promise<string | null> {
  try {
    const gs = localStorage.getItem('prism_guardian')
    if (!gs) return null
    const g = JSON.parse(gs)
    if (!g.email) return null

    // We stored the password hash — can't re-login.  Just signal failure.
    // The login page will handle re-auth.
    return null
  } catch {
    return null
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
