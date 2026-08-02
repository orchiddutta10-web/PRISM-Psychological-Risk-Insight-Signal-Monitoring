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
 * Derive a WebSocket URL from the configured API base.
 * http(s):// → ws(s):// and the API base already includes /api/v1.
 */
export function wsUrl(path: string): string {
  if (/^wss?:\/\//.test(API_BASE)) return `${API_BASE}${path}`
  const { protocol, host } = window.location
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProto}//${host}${API_BASE}${path}`
}
