# PRISM Design System

This document outlines the visual language, design system tokens, and UI guidelines for the PRISM platform. All components in the mobile app (React Native) and guardian dashboard (Next.js + Tailwind) must adhere to this system.

---

## 1. Color Palette

Our palette is designed to look modern and trustworthy, providing high clarity without causing alarm. Saturated red is strictly reserved for high-severity alerts to avoid inducing anxiety in guardians.

| Role | Hex Code | HSL / Usage | Description |
| :--- | :--- | :--- | :--- |
| **Primary (Deep Indigo)** | `#1E1B4B` | `hsl(244, 47%, 20%)` | Dark mode backgrounds, headers, primary branding. |
| **Primary Light (Navy)** | `#312E81` | `hsl(244, 47%, 34%)` | Card backgrounds, active state borders. |
| **Accent (Warm Amber)** | `#D97706` | `hsl(35, 92%, 43%)` | Indicates "Needs Attention" or moderate deviation. |
| **Baseline Normal (Sage)** | `#10B981` / `#D1FAE5` | `hsl(160, 84%, 39%)` | Indicates "Baseline Normal" wellness markers. |
| **High Severity (Saturated Red)** | `#DC2626` | `hsl(0, 72%, 51%)` | RESERVED for critical/high-severity alerts only. |
| **Neutral Dark** | `#0F172A` | `hsl(222, 47%, 11%)` | Primary body text (light mode), app background. |
| **Neutral Light** | `#F8FAFC` | `hsl(210, 40%, 98%)` | Backgrounds, secondary containers. |

---

## 2. Typography

We utilize two font families to separate data density visualization from standard text consumption:

### Geometric Sans (Data, Metrics, Charts)
* **Suggested Fonts:** `Space Grotesk`, `Inter` (using tabular/monospaced numbers).
* **Usage:** Applied to numbers, chart labels, timelines, telemetry metadata, and all tabular representations.
* **Key Feature:** Must support **tabular figures** (`font-variant-numeric: tabular-nums`) to prevent shifting layout when numbers update.

### Humanist Sans (Body Copy & Explanations)
* **Suggested Fonts:** `Open Sans`, `Fira Sans`, `System Sans` (humanist face).
* **Usage:** Applied to explanatory prose, "contributing factors" descriptions, onboarding disclosures, settings, and navigation labels.
* **Rationale:** Maximizes readability and accessibility for long text.

---

## 3. Iconography

All icons must use an **outline-style** aesthetic to maintain a clean, lightweight UI.
* **Stroke Width:** Exactly `2px` (or `medium` weight).
* **Style:** Open/outline glyphs. Fill is only allowed to denote active navigation tabs or toggle selections.
* **Library recommendation:** Lucide Icons / Feather Icons.

---

## 4. Accessibility & Contrast (WCAG 2.1 AA)

All text, icons, and interactive elements must meet or exceed WCAG 2.1 AA requirements:
* **Normal Text (under 18pt / 24px):** Minimum contrast ratio of **4.5:1** against the background.
* **Large Text (18pt / 24px and over):** Minimum contrast ratio of **3.0:1** against the background.
* **UI Controls & Graphics (Icons, Borders):** Minimum contrast ratio of **3.0:1** against adjacent colors.
* **Non-color Reliance:** Alerts must never rely on color alone. Use a combination of text status labels, icons (e.g., warning symbol vs. checkmark), and descriptive context.

---

## 5. Adaptive Theming CSS Tokens

To support multiple display configurations, PRISM uses a CSS-custom-properties token set:

### 5.1 Base Theme (Dark Mode - Default)
* `--bg-main`: `#0F172A` (hsl 222, 47%, 11%)
* `--bg-card`: `#1E1B4B` (hsl 244, 47%, 20%)
* `--border-card`: `#312E81` (hsl 244, 47%, 34%)
* `--text-primary`: `#F8FAFC` (hsl 210, 40%, 98%)
* `--text-secondary`: `#94A3B8` (hsl 215, 16%, 57%)

### 5.2 Light Theme
* `--bg-main`: `#F8FAFC` (hsl 210, 40%, 98%)
* `--bg-card`: `#FFFFFF` (hsl 0, 0%, 100%)
* `--border-card`: `#E2E8F0` (hsl 214, 32%, 91%)
* `--text-primary`: `#0F172A` (hsl 222, 47%, 11%)
* `--text-secondary`: `#475569` (hsl 215, 16%, 37%)

### 5.3 High-Contrast Theme
* --bg-main: `#000000` (hsl 0, 0%, 0%)
* --bg-card: `#000000` (hsl 0, 0%, 0%)
* --border-card: `#FFFFFF` (hsl 0, 0%, 100%)
* --text-primary: `#FFFFFF` (hsl 0, 0%, 100%)
* --text-secondary: `#FFFF00` (hsl 60, 100%, 50%)

---

## 6. Monochromatic Guardian Onboarding Tokens

To support the strictly monochrome Phase 1 onboarding sequence, the mobile app uses the following color tokens:

* **Primary Dark Background:** `#0A0A0A` (Pure black - full bleed)
* **Primary Light Background:** `#FFFFFF` (Pure white - screens 2 to 5)
* **Primary Text / Active Borders:** `#000000` (Pure black)
* **Lighter Text / Title Highlights:** `#FFFFFF` (Pure white on dark bg)
* **Secondary Text / Inactive Borders:** `#7F7F84` (Neutral gray)
* **Watermark Accent:** Charcoal tone (overlap circles)

All screens in the onboarding sequence must strictly adhere to these monochrome variables. Saturated accents (green, red, amber) are reserved for later phases.

---

## 7. Phase 8 — AI Companion Chat & Trial Conversion Tokens

These tokens extend Section 6. All values remain within the black / white / gray palette. No new hues are introduced.

### Chat Screen (Screen 14)

| Token | Value | Usage |
|:------|:------|:------|
| `chat-bg` | `#F2F2F7` | Full chat scroll area background |
| `chat-watermark-icon-opacity` | `0.12` | PRISM icon watermark grid overlay |
| `bubble-incoming-bg` | `#FFFFFF` | Aria message bubble background |
| `bubble-outgoing-bg` | `#000000` | Guardian message bubble background |
| `bubble-incoming-text` | `#000000` | Incoming message text |
| `bubble-outgoing-text` | `#FFFFFF` | Outgoing message text (contrast-safe on black bg) |
| `timestamp-text` | `#8E8E93` | Bubble timestamp (WCAG AA on both bubble colours) |
| `date-pill-bg` | `#E5E5EA` | "Today" centred date pill |
| `date-pill-text` | `#8E8E93` | Date pill label |
| `header-status-text` | `#8E8E93` | "online" presence indicator |
| `input-bar-bg` | `#FAFAFB` | Message input row surface |
| `send-btn-bg` | `#000000` | Circular send button |
| `send-btn-icon` | `#FFFFFF` | Paper-plane icon on send button |
| `my-plan-pill-bg` | `#FAFAFB` | "My Plan" header pill surface |
| `my-plan-pill-border` | `#E5E5EA` | "My Plan" pill border |

### Trial Conversion Screen (Screen 15)

| Token | Value | Usage |
|:------|:------|:------|
| `video-player-bg` | `#000000` | Full-bleed video area |
| `video-caption-overlay` | `rgba(0,0,0,0.6)` | Subtitle bar overlay |
| `video-caption-text` | `#FFFFFF` | Subtitle text |
| `pricing-card-bg` | `#FAFAFB` | Bordered pricing card surface |
| `pricing-card-border` | `#E5E5EA` | Pricing card border (1.5 px) |
| `discount-badge-bg` | `#000000` | "90% OFF" badge |
| `discount-badge-text` | `#FFFFFF` | Badge label |
| `price-trial` | `#000000` | Large trial price (₹3) |
| `price-original` | `#8E8E93` | Struck-through original price |
| `family-dot` | `#000000` | Status dot beside family count (monochrome, no green) |
| `payment-selected-border` | `#000000` | Active payment method tile border |
| `payment-indicator-active` | `#000000` | Filled radio dot for selected method |
| `footer-note-text` | `#8E8E93` | "₹299/month after trial" note |

### Pricing Configuration Contract

All trial / renewal / discount copy is sourced from a single `PRICING_CONFIG` constant in `OnboardingScreen.tsx`. UI code must **never hardcode** a price string directly — always reference the config key. This allows Phase 4 personalisation work to swap values without touching component render logic.

```ts
const PRICING_CONFIG = {
  trialPrice:           "₹3",
  originalPrice:        "₹30",
  renewalPrice:         "₹299/month",
  discountPercentage:   "90% OFF",
  trialDays:            3,
  familyCount:          "55,000 families protected",
  ratingText:           "4.8+ rating"
};
```

### WebSocket / Chat Persistence Contract

- Connection URL: `ws://localhost:8000/api/v1/events/ws?token=<guardian_jwt>`
- Messages published to `guardian_events:<guardian_id>` Redis channel.
- `type: "chat_message"` payloads are persisted to the `chat_messages` table.
- History endpoint: `GET /api/v1/events/chat/history` — returns chronological log; auto-seeds Aria's welcome message on first call (idempotent).
- AppState `active` → `connectWebSocket()`, `background`/`inactive` → `disconnectWebSocket()` with 3-second retry on close.

### Payment Provider Interface Contract

```ts
// Swap-ready stub — replace body with real SDK call (Razorpay / UPI intent / Stripe)
const PaymentProvider = {
  async processPayment(amount: string): Promise<boolean> { ... }
};
```
No payment SDK import is committed to this screen. The `PaymentProvider` object is the only surface a future integrator needs to touch.

