# PRISM Frontend Architecture — Three Experiences, One Design System

**Version**: 1.0  
**Status**: Active Development  
**Updated**: 2026-07-23

---

## Overview

PRISM requires three distinct frontend experiences, each with different UX goals, but all sharing a unified design system and data model:

```
┌─────────────────────────────────────────────────────────────┐
│                    PRISM Design System                       │
│        (Colors, Typography, Icons, Accessibility)           │
└─────────────────────────────────────────────────────────────┘
                              ▲
                ┌─────────────┼─────────────┐
                │             │             │
       ┌────────▼────────┐ ┌──▼──────────┐ ┌──▼──────────┐
       │ Teen Mobile App │ │   Guardian   │ │  PRISM Node │
       │  (React Native) │ │  Dashboard   │ │  IoT Status │
       │                 │ │  (Next.js)   │ │ (React/Web) │
       │ Primary Goal:   │ │              │ │             │
       │ Disclosure +    │ │ Primary Goal:│ │Primary Goal:│
       │ Permission Req. │ │ Awareness +  │ │Connectivity│
       │ + Real-time     │ │ Check-in     │ │+ Health    │
       │ Status          │ │ Alerts       │ │            │
       └─────────────────┘ └──────────────┘ └────────────┘
```

---

## I. Teen Mobile App — Permission Lifecycle & Signals Status

### UX Goal
**Transparency + Agency**: Show what's being collected, ask permission thoughtfully, and keep the teen informed about collection status in real time.

### Core Flows

#### 1. Onboarding → Permission Lifecycle (Days 1–3)

```
┌─────────────────────────────────────┐
│     Install App (First Launch)      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Age Verification / Account Flow    │
│  (Email, Phone, Parent Email)       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Teen Consent Screen (Required)    │
│  "PRISM lets a trusted adult see    │
│   patterns in your activity..."     │
│  [Read More] [I Understand, Go Back]│
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Modality Selection (Granular)      │
│  ☑ Location (GPS)                   │
│  ☑ App Usage                        │
│  ☑ Device Activity (Sleep)          │
│  ☐ Voice (opt-in, unchecked)        │
│  ☑ Typing Dynamics (future)         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Sensor Capability Check            │
│  ✓ Location: Available              │
│  ✓ App Usage: Available             │
│  ✓ Accelerometer: Available         │
│  ✗ Typing: Not available on device  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Android Permission Request (1/3)   │
│  "Allow PRISM to access location?"  │
│  [Allow] [Don't Allow]              │
│                                     │
│  ⚠ "You can change this anytime    │
│   in Settings > Permissions"        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Android Permission Request (2/3)   │
│  "Allow PRISM to access apps?"      │
│  [Allow] [Don't Allow]              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Review & Confirmation              │
│  You've selected:                   │
│  ✓ Location (GPS)                   │
│  ✓ App Usage                        │
│  ✓ Device Activity                  │
│                                     │
│  Status:                            │
│  ✓ Location: Ready                  │
│  ✓ App Usage: Ready                 │
│  ✓ Activity: Ready                  │
│                                     │
│  Guardian approval pending...       │
│  [Continue with Pending]            │
│  [Cancel]                           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Dashboard (Waiting for Guardian)   │
│  Signals will start when guardian   │
│  approves in email.                 │
│                                     │
│  Resend approval link? [Send Email] │
└─────────────────────────────────────┘
```

#### 2. Active Collection: "YOUR ACTIVE SIGNALS" Dashboard

After both teen and guardian consent, the app shows real-time signal status:

```
YOUR ACTIVE SIGNALS
═══════════════════════════════════════

Location patterns
● Active
  Last update: 42 seconds ago
  Current: Downtown area, moving
  
Activity level
● Active
  Last update: 1 minute ago
  Current: Walking (moderate activity)
  
App usage
● Active
  Last update: 12 seconds ago
  Current: Social Media app (15 min used)


PERMISSION STATUS
═══════════════════════════════════════

Device Activity
⚠ Permission Removed (since 3:42 PM)
  
  Why: You may have disabled this 
  in System Settings > Permissions
  
  Impact: Sleep detection temporarily 
  offline
  
  [RE-ENABLE] [LEARN MORE]


PRISM Node
○ Not Connected
  
  PRISM needs to connect to your home 
  node to access physiological data.
  See "Devices" tab to connect.
```

#### 3. Permission Change Events

Real-time UI response to permission changes:

**Scenario A: Android System Settings disabled GPS**

```
BEFORE:
Location patterns
● Active

AFTER (Real-time):
Location patterns
⚠ PERMISSION LOST
  
  At: 2026-07-23 15:42:00
  Reason: Permission disabled in 
  System Settings
  
  Impact: Location-based alerts 
  cannot be sent
  
  Actions:
  [RE-ENABLE] [SETTINGS] [IGNORE]
```

**Scenario B: User manually toggles off typing dynamics**

```
BEFORE:
Typing Dynamics
● Active

AFTER (User toggles):
Typing Dynamics
○ Turned off

  You disabled typing analysis.
  Guardian has been notified.
  
  You can turn this back on anytime.
  [TURN ON]
```

### Permission Model

#### a) Permission Tiers

| Tier | Permission Type | Android/iOS | Renewal | Notes |
|------|---|---|---|---|
| **System Permission** | OS-level (GPS, Bluetooth, Notification) | `android.permission.ACCESS_FINE_LOCATION` | Until user revokes | Managed by OS |
| **In-App Permission** | PRISM-level toggle (per signal) | Internal flag | Anytime | Managed by PRISM |
| **Consent Permission** | Guardian + Teen approval | Stored in DB | Yearly (COPPA) | Signed & audited |
| **Background Permission** | Android 12+ background work | `SCHEDULE_EXACT_ALARM`, `android.permission.POST_NOTIFICATIONS` | OS update dependent | Required for timely collection |

#### b) Permission Flow (Technical)

```
┌─ System Permission Requested
│  (Android: runtime permission dialog)
│
├─ If DENIED by user:
│  └─ Store in DB: signal_permission_status = "DENIED"
│  └─ Notify guardian: "Location permission denied"
│  └─ Hide from real-time dashboard (show warning instead)
│
├─ If ALLOWED:
│  └─ Store in DB: signal_permission_status = "GRANTED"
│  └─ Start background collection
│  └─ Monitor for OS-level changes
│
└─ If OS REVOKES (detected via BroadcastReceiver):
   └─ React immediately: stop collection
   └─ Update UI: show "Permission lost at X time"
   └─ Notify guardian
   └─ Log immutable event in audit trail
```

#### c) Signal-Specific Permission Requirements

| Signal | Android Permission | iOS Permission | Fallback | Teen Can Toggle |
|--------|---|---|---|---|
| **GPS Location** | `ACCESS_FINE_LOCATION` | NSLocationWhenInUseUsageDescription | Disable signal | ✅ Yes |
| **App Usage** | `PACKAGE_USAGE_STATS` (special) | Not available in iOS | Note in UI | ✅ Yes |
| **Accelerometer** | None (built-in) | None (built-in) | Disable signal | ✅ Yes |
| **Bluetooth (Node)** | `BLUETOOTH_CONNECT` | NSBluetoothCentralUsageDescription | Await node | ✅ Yes |

### Screen Structure

```
tabs/
├── Dashboard
│   ├── ActiveSignalsCard
│   │   ├── SignalRow
│   │   │   ├── SignalIcon (active/warning/disabled)
│   │   │   ├── SignalName (Location, App Usage, etc.)
│   │   │   ├── StatusBadge (● Active / ⚠ Permission Lost / ○ Disabled)
│   │   │   ├── LastUpdateTime (e.g., "42 seconds ago")
│   │   │   └── CurrentValue (e.g., "Downtown area, moving")
│   │   └── [More Details] (expand to details card)
│   │
│   ├── PermissionStatusCard
│   │   ├── LostPermissionAlert (if any)
│   │   │   ├── SignalName
│   │   │   ├── LostTime
│   │   │   ├── Reason
│   │   │   ├── Impact
│   │   │   └── [RE-ENABLE] button
│   │   └── ConnectedDevices (PRISM Node status)
│   │
│   └── PendingGuardianApproval (if waiting)
│
├── Signals
│   ├── DetailView (per signal)
│   │   ├── Signal metadata
│   │   ├── Permission status
│   │   ├── Last value + timestamp
│   │   ├── Contributing factors (if alert)
│   │   ├── Settings gear (toggle on/off)
│   │   └── [FAQ] [Report Issue]
│   │
│   └── SignalSettings (granular toggles)
│
├── Devices
│   ├── PRISM Node Connection
│   │   ├── Status (connected/disconnected)
│   │   ├── Bluetooth signal
│   │   ├── Last sync
│   │   └── [Pair New Device]
│   │
│   └── Permission Summary
│
├── Privacy
│   ├── Consent History (immutable log)
│   ├── Modality Toggles (can revoke)
│   ├── Data Retention Info
│   └── [Request Data Download/Delete]
│
└── Settings
    ├── Guardian Contact
    ├── Theme (dark/light/high-contrast)
    ├── Notification Preferences
    └── [About] [Help] [Report Bug]
```

---

## II. Guardian Dashboard — Alerts, Baseline, Check-in Prompts

### UX Goal
**Awareness + Agency**: Show meaningful behavioral changes, provide explainable context, and facilitate check-ins without creating false alarms.

### Core Screens

#### 1. Alert Dashboard

```
ALERTS
═════════════════════════════════════

[Filter: All] [7 days] [This week] [This month]

─────────────────────────────────────
CURRENT STATUS
─────────────────────────────────────
● Baseline (Normal)
  Last update: 2 minutes ago

─────────────────────────────────────
ALERT HISTORY
─────────────────────────────────────

Tue, Jul 23 — 14:32
🟠 Amber Alert: Activity Pattern Shift

  Contributing Factors:
  • Sleep ↓ 38% below baseline
    (Baseline: 8h per night → Current: 5h)
  • App usage ↑ 1.5x (Gaming category)
  • Daytime activity ↓ 45%

  What this means:
  "Staying up late and less active during day"

  When:
  Mon-Tue, 11 PM — 6 AM

  [Start Check-in] [See Details] [Dismiss]

─────────────────────────────────────

Mon, Jul 22 — 09:15
🟢 Sage Alert: Minor Variation

  Contributing Factors:
  • Location stayed in home area (routine)
  • App usage slightly elevated (Social)
  • Sleep normal

  What this means:
  "Day was similar to usual. Slightly more 
  social app usage than average."

  [Archived]
```

#### 2. Baseline & Trends View

```
BASELINE & TRENDS (Last 30 days)
═════════════════════════════════════

SLEEP PATTERN
├─ Baseline: 7.5 hours/night (average)
├─ Trend: ↓ 0.3 hours/night over 7 days
├─ Latest: 5.2 hours (Last night)
├─ Status: Below baseline ⚠
└─ Chart: [7-day sparkline]

ACTIVITY LEVEL
├─ Baseline: 8,500 steps/day
├─ Trend: ↓ 2,200 steps over 7 days
├─ Latest: 4,100 steps (Yesterday)
├─ Status: Decreased ⚠
└─ Chart: [7-day sparkline]

APP USAGE
├─ Baseline:
│  ├─ Social: 2h/day
│  ├─ Gaming: 1.5h/day
│  ├─ Productivity: 0.5h/day
├─ Latest:
│  ├─ Social: 1.8h/day (↓ within baseline)
│  ├─ Gaming: 2.2h/day (↑ 47% above baseline)
│  ├─ Productivity: 0.2h/day (↓ 60%)
├─ Status: Gaming elevated ⚠
└─ Chart: [7-day stacked bar]
```

#### 3. Check-in Messaging

```
CHECK-IN PROMPT
═════════════════════════════════════

Your teen's sleep has been below average
for 3 days. This is uncommon for them.

Would you like to check in about what's
going on?

START CHECK-IN
"Hey, I noticed you've been getting
less sleep than usual. Everything okay?"

[Send]  [Edit]  [Skip]  [Don't ask again]
```

### Data Model for Guardian Dashboard

```typescript
interface AlertEvent {
  id: string;
  created_at: ISO8601;
  alert_level: "sage" | "amber" | "red";
  signals: {
    sleep?: {
      baseline: number;
      current: number;
      pct_change: number;
    };
    activity?: {
      baseline: number;
      current: number;
      pct_change: number;
    };
    app_usage?: Array<{
      category: string;
      baseline: number;
      current: number;
      pct_change: number;
    }>;
  };
  contributing_factors: Array<{
    name: string;
    weight: number;  // 0-1
    description: string;
  }>;
  explainable_summary: string;
  teen_age_bracket: "13-15" | "16-17"; // generalize age
  audit_id: string;
}
```

---

## III. PRISM Node / IoT Status

### UX Goal
**Connectivity + Diagnostics**: Show node health, connection status, and sensor readiness.

### Screens

#### 1. Node Dashboard

```
PRISM NODE
═════════════════════════════════════

Status: 🟢 Connected
Last sync: 2 minutes ago
Firmware: v2.1.4 (Latest)

─────────────────────────────────────
BLUETOOTH CONNECTION
─────────────────────────────────────
Signal: ▓▓▓▓░ Strong
Latency: 45ms
Uptime: 8 days, 3 hours

─────────────────────────────────────
SENSORS
─────────────────────────────────────
GSR (Galvanic Skin Response)
🟢 Active | Last: 2 min ago | 45 µS

PPG (Heart Rate / SpO₂)
🟢 Active | Last: 1 min ago | 72 BPM / 98% SpO₂

Temperature
🟢 Active | Last: 3 min ago | 36.8°C

Accelerometer
🟢 Active | Last: 30 sec ago | Still

─────────────────────────────────────
BATTERY
─────────────────────────────────────
Level: 87%
Last charged: 2 days ago
Time remaining: ~12 hours

[Charge Now] [Settings]

─────────────────────────────────────
RECENT EVENTS
─────────────────────────────────────
✓ Sync completed: 2 min ago
✓ Firmware up-to-date
⚠ Battery low reminder (set for 10%)
```

#### 2. Pairing Flow

```
PAIR NEW PRISM NODE
═════════════════════════════════════

1. Power on PRISM Node
   (LED will blink blue)

2. Make sure Bluetooth is ON
   [Check Settings]

3. Tap to scan
   [SCAN FOR DEVICES]
   
   Scanning...
   
   PRISM-Node-ABC123 [00:1A:7D:DA:71:13]
   [TAP TO CONNECT]

4. Enter PIN
   (on the back of device)
   
   ••••
   [NEXT]

5. Success!
   PRISM Node is connected
   [DONE]
```

---

## IV. Design System Tokens (Shared)

### Colors

```css
/* Signals Status */
--color-active: #10B981 (Sage Green) — Active collection
--color-pending: #D97706 (Warm Amber) — Needs user action
--color-error: #DC2626 (Saturated Red) — Critical issue
--color-disabled: #6B7280 (Neutral Gray) — Turned off

/* Alert Levels */
--alert-sage: #10B981 — Minor or normal
--alert-amber: #D97706 — Needs attention
--alert-red: #DC2626 — Urgent (red reserved for crisis only)

/* Backgrounds */
--bg-main: #0F172A (Dark mode default)
--bg-card: #1E1B4B
--bg-secondary: #312E81
```

### Typography

```css
/* Data/Status Labels */
font-family: Space Grotesk, Inter;
font-variant-numeric: tabular-nums;
usage: Signal names, timestamps, numeric values

/* Body Copy */
font-family: Open Sans, Fira Sans;
usage: Explanations, contributing factors, alerts
```

### Icons

```
Active/enabled: Checkmark (✓) or green dot (●)
Pending action: Warning triangle (⚠) or clock (⏱)
Disabled/lost: X (✗) or gray circle (○)
Expanding details: Chevron (›) or plus (+)
Navigation: Standard iOS/Android patterns
```

---

## V. Data Flow: Teen → Backend → Guardian

```
┌──────────────────────────────────────────────────────────────┐
│ TEEN MOBILE APP (React Native)                               │
│                                                               │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ Signal Collection Service                              │   │
│ │ • GPS (every 60s)                                      │   │
│ │ • App Usage (event-driven)                             │   │
│ │ • Accelerometer (10Hz → aggregated)                    │   │
│ │ • Permission state monitor                            │   │
│ └─────────┬──────────────────────────────────────────────┘   │
│           │                                                   │
│           ▼ (batch, encrypted TLS)                            │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│ PRISM API (FastAPI)                                          │
│                                                               │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ POST /v1/signals/ingest                                │   │
│ │ • Validate, decrypt                                   │   │
│ │ • Store in DB                                         │   │
│ │ • Update baseline                                     │   │
│ └─────────┬──────────────────────────────────────────────┘   │
│           │                                                   │
│           ▼                                                   │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ ML Worker (Anomaly Detection)                          │   │
│ │ • Compare to baseline                                 │   │
│ │ • Calculate z-score                                   │   │
│ │ • If alert-worthy: emit AlertEvent                    │   │
│ └─────────┬──────────────────────────────────────────────┘   │
│           │                                                   │
│           ▼ (WebSocket subscriptions)                        │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│ GUARDIAN DASHBOARD (Next.js)                                 │
│                                                               │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ Alert Card                                             │   │
│ │ • Displays: Contributing Factors                       │   │
│ │ • Provides: Check-in prompt                           │   │
│ │ • Tracks: Check-in conversation                       │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                               │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ Trend View                                             │   │
│ │ • Shows: Baseline vs Current                           │   │
│ │ • Charts: 7d/30d trends                               │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                               │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ PRISM Node Status                                      │   │
│ │ • Connection health                                   │   │
│ │ • Sensor readiness                                    │   │
│ └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## VI. Key Principles

### 1. Never Silently Fail
Every permission change, sensor loss, or connection drop must appear in the UI **immediately**.

```
✗ WRONG: User disables GPS in System Settings, app keeps collecting pretending to work
✓ RIGHT: UI shows "Location unavailable since 3:42 PM" within 60 seconds
```

### 2. Status is Data
Signal status (active/pending/lost/disabled) is as important as the signal value itself.

```typescript
interface SignalStatus {
  signal_id: string;
  status: "active" | "pending_permission" | "permission_denied" | "disabled" | "offline";
  last_value?: number;
  last_update?: ISO8601;
  permission_lost_at?: ISO8601;
  permission_lost_reason?: string;
}
```

### 3. Transparency > Simplicity
It's okay to show complexity if it helps users understand what's happening.

```
✗ WRONG: "Location paused" (vague, doesn't say why)
✓ RIGHT: "Location paused — You disabled in Settings > Apps > Permissions at 3:42 PM"
```

### 4. Granular Modality Control
Every signal must be toggleable independently. No "all or nothing".

### 5. Audit Everything
Every permission change, consent modification, or status shift is an immutable log entry.

---

## VII. Implementation Roadmap

### Phase 1 (MVP)
- [ ] Teen Mobile App: Onboarding → Consent → Permission Lifecycle
- [ ] Teen Mobile App: Active Signals Dashboard with real-time status
- [ ] Guardian Dashboard: Alert cards with contributing factors
- [ ] Guardian Dashboard: Baseline & Trends view
- [ ] Design system tokens in code (CSS/JS)

### Phase 2
- [ ] PRISM Node pairing flow + status dashboard
- [ ] Advanced trend analytics (anomaly scoring, correlations)
- [ ] Teen-Guardian check-in messaging flow
- [ ] Notification preferences & delivery

### Phase 3
- [ ] Crisis detection & intervention pathway
- [ ] Companion persona integration (if approved)
- [ ] Multi-guardian support
- [ ] Historical data export (GDPR/CCPA)

---

## VIII. Accessibility & WCAG 2.1 AA

All three frontends must meet WCAG 2.1 AA:

- **Color contrast**: 4.5:1 minimum for normal text
- **Interactive elements**: 3:1 minimum contrast; 44x44px minimum tap target
- **Status indicators**: Never color-only (combine icon + text)
- **Alerts**: Never sound-only (include visual + haptic)
- **Screen reader support**: All interactive elements labeled; status changes announced via `aria-live`
- **Keyboard navigation**: Full navigation without mouse
- **Focus indicators**: Always visible, 3:1 contrast

---

## IX. File Structure

```
apps/
├── mobile/
│   ├── src/
│   │   ├── screens/
│   │   │   ├── Onboarding/
│   │   │   │   ├── AgeVerification.tsx
│   │   │   │   ├── TeenConsent.tsx
│   │   │   │   ├── ModularitySelection.tsx
│   │   │   │   ├── SensorCapabilityCheck.tsx
│   │   │   │   ├── PermissionRequest.tsx
│   │   │   │   └── ReviewConfirmation.tsx
│   │   │   ├── Dashboard/
│   │   │   │   ├── ActiveSignals.tsx
│   │   │   │   ├── PermissionStatus.tsx
│   │   │   │   └── PendingGuardianApproval.tsx
│   │   │   ├── Signals/
│   │   │   │   ├── SignalDetail.tsx
│   │   │   │   └── SignalSettings.tsx
│   │   │   ├── Devices/
│   │   │   │   ├── NodeStatus.tsx
│   │   │   │   ├── NodePairing.tsx
│   │   │   │   └── PermissionSummary.tsx
│   │   │   └── Privacy/
│   │   │       ├── ConsentHistory.tsx
│   │   │       └── DataManagement.tsx
│   │   ├── components/
│   │   │   ├── SignalRow.tsx
│   │   │   ├── PermissionAlert.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── DisclosureBox.tsx
│   │   │   └── TimestampLabel.tsx
│   │   ├── services/
│   │   │   ├── PermissionService.ts
│   │   │   ├── SignalCollectionService.ts
│   │   │   └── PermissionMonitor.ts
│   │   ├── hooks/
│   │   │   ├── usePermissionStatus.ts
│   │   │   ├── useSignalData.ts
│   │   │   └── usePermissionListener.ts
│   │   ├── context/
│   │   │   └── PermissionContext.tsx
│   │   └── styles/
│   │       ├── design-tokens.css
│   │       ├── colors.css
│   │       └── typography.css
│   │
│   └── __tests__/
│       ├── PermissionService.test.ts
│       ├── SignalRow.test.tsx
│       └── Onboarding.e2e.ts
│
├── dashboard/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── alerts.tsx
│   │   │   ├── baseline.tsx
│   │   │   ├── checkin.tsx
│   │   │   └── settings.tsx
│   │   ├── components/
│   │   │   ├── AlertCard.tsx
│   │   │   ├── TrendChart.tsx
│   │   │   ├── CheckInPrompt.tsx
│   │   │   └── NodeStatus.tsx
│   │   ├── hooks/
│   │   │   ├── useAlerts.ts
│   │   │   ├── useBaseline.ts
│   │   │   └── useRealTimeUpdates.ts
│   │   └── styles/
│   │       └── design-tokens.css
│   │
│   └── __tests__/
│       ├── alerts.test.tsx
│       └── baseline.test.tsx
│
└── shared/
    ├── types/
    │   ├── signals.ts
    │   ├── alerts.ts
    │   ├── permissions.ts
    │   └── node.ts
    └── constants/
        └── designTokens.ts
```

---

## X. Next Steps

1. **Design Mockups**: Create Figma prototypes for all three experiences
2. **Permission Service**: Implement core permission monitoring + status tracking
3. **Component Library**: Build shared design system components
4. **Integration Tests**: Test permission flows end-to-end (teen app → backend → guardian dashboard)
5. **Accessibility Audit**: WCAG 2.1 AA compliance testing
