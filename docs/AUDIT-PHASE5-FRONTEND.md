# Phase 5 — Frontend Dashboard Audit Report

**Scope:** `apps/dashboard` Next.js guardian dashboard
**Audited on:** 2026-08-04
**Branch:** `iot`

## 1. Build verification

```bash
cd apps/dashboard
NODE_ENV=development npm install
npm run build
```

**Result:** ✅ Build succeeded — 13 pages, 0 errors, TypeScript clean.

| Route | Size | First Load JS |
|---|---|---|
| `/` (login) | 5.75 kB | 108 kB |
| `/overview` | 11.5 kB | 114 kB |
| `/prism-node` | 6.21 kB | 109 kB |
| `/alerts`, `/signals`, `/companion`, `/medical`, `/typing-analytics` | ~4–5 kB each | ~107 kB |

## 2. Architecture summary

```text
┌──────────────────────────────────────┐
│       Next.js 15 Dashboard           │
│  ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │ Login   │ │Overview │ │PRISM   │ │
│  │   /     │ │/overview│ │ Node   │ │
│  └────┬────┘ └────┬────┘ └───┬────┘ │
│       │           │          │      │
│       └───────────┴──────────┘      │
│              authFetch / fetch       │
│                   │                  │
│            Next.js rewrites          │
│                   │                  │
│            API :8000                 │
└──────────────────────────────────────┘
```

- All pages are client components (`'use client'`).
- State is held in React hooks; localStorage persists token/guardian/theme/selected device.
- API base path resolves via `NEXT_PUBLIC_API_URL` or Next.js rewrite to `127.0.0.1:8000`.

## 3. Page inventory

| Page | File | Purpose | Data source |
|---|---|---|---|
| Login | `page.tsx` | Guardian sign-in/sign-up | `/auth/login`, `/auth/register` |
| Overview | `overview/page.tsx` | Device cards, alerts, live log, risk gauge | `/auth/devices` + WebSocket `/events/ws` |
| PRISM Node | `prism-node/page.tsx` | ESP32 pulse vitals, sleep, status | `/physio/pulse/readings`, `/physio/readings`, `/physio/sleep`, `/physio/status` |
| Alerts | `alerts/page.tsx` | Alert list | `/events/alerts/{device_id}` |
| Signals | `signals/page.tsx` | Signal overview | `/events/scores`, `/events/baselines` |
| Companion | `companion/page.tsx` | Aria chat | WebSocket `/events/ws` |
| Medical | `medical/page.tsx` | Medical AI assistant | `/medical/*` |
| Typing Analytics | `typing-analytics/page.tsx` | Typing insights | `/typing/behavioral/{device_id}` |

## 4. Live data flow

### 4.1 Overview page

1. Reads `prism_token` and `prism_guardian` from localStorage.
2. Calls `authFetch('/auth/devices')`.
3. On success, maps devices into `DeviceView` objects and sets `isLive = true`.
4. Opens WebSocket to `/events/ws?token={token}`.
5. WebSocket `onmessage` appends events to the live log.

### 4.2 PRISM Node page

1. Reads token and `prism_selected_device`.
2. Every 5 seconds:
   - fetches `/physio/pulse/readings/{device_id}?limit=60`
   - fetches `/physio/readings/{device_id}?sensor_type=ppg&limit=60`
   - fetches `/physio/sleep/{device_id}?limit=30`
   - fetches `/physio/status/{device_id}`
3. If no real data, falls back to synthetic demo data.

## 5. Issues found

| # | Severity | Finding | Evidence | Root cause | Recommended fix |
|---|---|---|---|---|---|
| 5.1 | **HIGH** | WebSocket has no automatic reconnect | `overview/page.tsx` lines 240-249: `ws.onclose` only sets status to `disconnected` | Minimal implementation | Add exponential-backoff reconnect loop |
| 5.2 | **HIGH** | All pages ship demo/synthetic fallback without clear disclosure | `overview/page.tsx` `DEVICES`, `prism-node/page.tsx` `generateSyntheticPulseReadings` | Phase 1 placeholder | Add prominent "demo data" banner when API unavailable |
| 5.3 | **MEDIUM** | API URL hardcoded in Next.js rewrite | `next.config.js` line 8: `destination: 'http://127.0.0.1:8000/api/v1/:path*'` | Dev convenience | Make backend URL configurable via env |
| 5.4 | **MEDIUM** | No error boundary | No `error.tsx` or `ErrorBoundary` in `src/app` | Not implemented | Add root and per-page error boundaries |
| 5.5 | **MEDIUM** | `localStorage` accessed during SSR risk | All pages are `'use client'`, but `layout.tsx` uses `next/font` | Safe for now because pages are client-only | Keep pages client-only; avoid localStorage in layout |
| 5.6 | **LOW** | Dependency install fails in production `NODE_ENV` | `npm install` omits devDependencies when `NODE_ENV=production` | npm behavior | Document that dashboard build requires `NODE_ENV=development` or install prod deps separately |
| 5.7 | **LOW** | No loading state during login submit | Login button only shows spinner on `loading` | Already handled | N/A — acceptable |

## 6. Security & privacy observations

- JWT stored in `localStorage` — standard SPA pattern, but XSS-sensitive.
- `authFetch` clears token and redirects on 401. ✅
- No raw content displayed; only metadata. ✅
- Consent and privacy disclosures present on overview and PRISM Node pages. ✅

## 7. Camera / video

- **No live camera feed UI exists.** The dashboard displays physiological pulse data from the ESP32, but there is no video stream component. This aligns with Phase 4 finding that `prism_edge` does not expose a video stream.

## 8. Recommendations

1. Implement WebSocket auto-reconnect with exponential backoff.
2. Add a global banner that clearly indicates "Demo data" when the API is unreachable.
3. Make the backend proxy target in `next.config.js` configurable via environment.
4. Add React error boundaries for graceful failure handling.
5. Co-ordinate with backend to add an MJPEG/WebRTC stream component for the camera pipeline.

## 9. Verification commands

```bash
cd apps/dashboard
NODE_ENV=development npm install
npm run build
# Start API on :8000, then:
npm run dev
# Open http://localhost:3000 and sign in.
```
