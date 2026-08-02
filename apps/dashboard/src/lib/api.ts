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
 * fetch() wrapper that treats 401 as a session-expiry signal: it clears the
 * stored token and redirects to the login page. Access tokens expire after
 * ACCESS_TOKEN_EXPIRE_MINUTES (60 min), and without this the dashboard would
 * silently fall back to demo data once a session expires.
 */
export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, init)
  if (res.status === 401) {
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
