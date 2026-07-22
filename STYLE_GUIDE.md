# SentinelMind V3.0 — Visual Identity & Design System

> **Creative Direction:** Premium medical-tech interface language · Dark glassmorphism · Bio-signal neon aesthetics  
> **Target Application:** Real-time physiological monitoring dashboard (HR, GSR, stress classification)

---

## 1. Design Philosophy

SentinelMind occupies a unique intersection: **clinical precision** meets **cyberpunk elegance**. The visual language communicates:

| Attribute | Expression |
|-----------|-----------|
| **Trust**   | Clean typography, structured grids, deliberate whitespace |
| **Urgency** | Crimson glows, animated confidence rings, live-stream badges |
| **Precision** | Monospaced data readouts, scientific units, 60-frame charts |
| **Sophistication** | Obsidian depths, frosted glass surfaces, subtle gradient sheens |

---

## 2. Color Palette

### 2.1 Backgrounds (Obsidian System)

| Token | Hex | Usage |
|-------|-----|-------|
| `--obsidian` | `#05080f` | Deepest background — body |
| `--abyssal` | `#080c18` | Surface layer — navbar, status bar |
| `--void` | `#0d1424` | Card base — platforms for glass overlays |

### 2.2 Glass Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--glass-bg` | `rgba(13,20,36,0.72)` | Default card surface |
| `--glass-bg-alt` | `rgba(18,28,50,0.55)` | Log entries, secondary surfaces |
| `--glass-bg-hover` | `rgba(20,32,55,0.82)` | Card hover state |
| `--glass-border` | `rgba(255,255,255,0.07)` | Default border |
| `--glass-border-glow` | `rgba(0,212,255,0.22)` | Hover/active border |
| `--glass-blur` | `blur(18px)` | Standard backdrop blur |

### 2.3 Accent System

| Accent | Hex | Role | When |
|-------|-----|------|------|
| **Electric Teal** | `#00d4ff` | Primary accent | Navigation, GSR charts, neutral state |
| **Neon Cyan (bright)** | `#00f0ff` | Highlight | Hover glows, tooltips |
| **Deep Violet** | `#6c5ce7` | Secondary | Voice logs, IBI metrics, gradient pair |
| **Crimson** | `#ff2d55` | Alert/stress | HR charts, STRESSED state, critical anomalies |
| **Muted Crimson** | `#ff4d6d` | Warning | Elevated readings, badge backgrounds |
| **Mint** | `#00e5a0` | Calm/safe | REST state, live indicator, normal readings |
| **Amber** | `#f5c518` | Elevated | EXCITED state, warning anomalies |

### 2.4 Text Hierarchy

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#e8edf5` | Headings, stat values, important labels |
| `--text-secondary` | `#7b89a6` | Body text, chart subtitles, meta info |
| `--text-muted` | `#4a5670` | Captions, units, timestamps, section titles |

### 2.5 Gradients

```css
--gradient-accent:  linear-gradient(135deg, #00d4ff, #6c5ce7);
--gradient-stress:  linear-gradient(135deg, #ff2d55, #ff6b6b);
--gradient-calm:    linear-gradient(135deg, #00e5a0, #00d4ff);
--gradient-warm:    linear-gradient(135deg, #f5c518, #ff8a5c);
--gradient-glass:   linear-gradient(180deg, rgba(255,255,255,0.06), transparent);
```

---

## 3. Typography

### 3.1 Font Stack

| Role | Font | Weights |
|------|------|---------|
| UI & Display | **Inter** (sans-serif) | 300, 400, 500, 600, 700, 800 |
| Data & Code | **JetBrains Mono** (monospace) | 400, 500, 600 |

### 3.2 Type Scale

| Size (rem) | Size (px) | Weight | Usage |
|------------|-----------|--------|-------|
| 0.625 | 10 | 500 | Voice intent, log timestamps |
| 0.65 | 10.4 | 600 | Section titles, stat labels, version |
| 0.7 | 11.2 | 400 | Footer, status bar, chart sub |
| 0.75 | 12 | 500 | Log messages, chart badges |
| 0.8125 | 13 | 500 | Voice commands |
| 0.875 | 14 | 600 | Chart titles, log headers |
| 1 | 16 | 400 | Base body |
| 1.15 | 18.4 | 700 | Logo heading |
| 1.3 | 20.8 | 700 | State name |
| 2.4 | 38.4 | 700 | Stat values (mono) |

### 3.3 Letter-spacing Conventions

- **Uppercase labels:** `1px – 2px` (e.g., section titles, stat labels)
- **Data values:** `-0.5px` (tight, modern)
- **Body text:** `0.2px – 0.5px` (default)

---

## 4. Glassmorphism System

### 4.1 Card Anatomy

```
┌─────────────────────────────────────┐
│  ← 1px gradient sheen (top edge)    │  .glass::before
│                                     │
│  ┌───────────────────────────────┐  │
│  │   Icon container (40x40)      │  │  border-radius: 10px
│  │   Label (uppercase, 0.68rem)  │  │
│  │   Value (mono, 2.4rem)        │  │  gradient text
│  │   Unit (0.7rem, muted)        │  │
│  └───────────────────────────────┘  │
│                                     │
│  ← 2px accent underline (on hover)  │  .stat-card::before
└─────────────────────────────────────┘
  backdrop-filter: blur(18px)
  border: 1px solid rgba(255,255,255,0.07)
  box-shadow: 0 8px 40px rgba(0,0,0,0.55)
```

### 4.2 States

| State | Transform | Border | Shadow | Accent |
|-------|-----------|--------|--------|--------|
| **Default** | `none` | `rgba(255,255,255,0.07)` | `0 8px 40px rgba(0,0,0,0.55)` | Hidden underline |
| **Hover** | `translateY(-3px)` | `rgba(0,212,255,0.22)` | `0 16px 56px rgba(0,0,0,0.60)` + `0 0 30px rgba(0,212,255,0.04)` | Visible |
| **Active** | `translateY(-1px)` | `rgba(0,212,255,0.30)` | Elevated | Full glow |

---

## 5. Component Library

### 5.1 Navigation Bar
- Full-width glass container (`border-radius: 20px`)
- Animated gradient logo icon with `box-shadow` pulse (3s cycle)
- Live indicator: mint dot + "STREAMING LIVE" label
- Monospaced clock in dark glass pill

### 5.2 Status Bar
- Compact glass strip below nav bar
- System dot (mint = online, crimson = offline)
- Uptime counter, data stream rate (Hz), simulated RSSI
- 0.65rem monospace, divided by `|` separators

### 5.3 Stat Cards
- Glass surface with top gradient sheen
- Icon container (40x40, 10px radius, glass border)
- Accent-colored underline that reveals on hover
- Gradient stat value text
- **Micro-interaction:** radial gradient spotlight follows cursor (`--mouse-x`, `--mouse-y`)

### 5.4 State Card (Hero Metric)
- SVG ring gauge (56px) showing confidence percentage
- Animated pulse dot at ring center (2s radial expansion)
- State name in monospace (mint / crimson / amber)
- Confidence bar with shimmer animation

### 5.5 Chart Cards
- Glass card with hover lift
- Chart title with colored dot indicator (crimson for HR, teal for GSR)
- Live badge in corresponding accent
- Chart.js canvas with:
  - Dark background (inherited)
  - Gradient fill (accent → transparent)
  - Subtle grid lines (`rgba(255,255,255,0.04)`)
  - Muted tick labels (`#4a5670`)
  - Glass-styled tooltip (`rgba(8,12,24,0.92)` with accent border)

### 5.6 Log Panels
- Severity-coded left border (3px): crimson = critical, amber = warning, teal = info
- Slide-in animation on render (0.35s cubic-bezier)
- Monospaced, uppercase type labels
- Hover: `translateX(3px)` reveal

---

## 6. Ambient Background System

### 6.1 Layer Stack (bottom → top)

```
  Layer 0: #05080f (solid obsidian)
  Layer 1: Radial gradients (3 overlapping orbs)
    - 700px teal orb top-left (opacity 0.08)
    - 550px violet orb bottom-right (opacity 0.06)
    - 400px crimson orb center-right (opacity 0.04)
  Layer 2: Grid overlay (48px, 0.025 opacity)
  Layer 3: SVG fractal noise (0.025 opacity, 256px tile)
  Layer 4: UI content (z-index: 1)
```

### 6.2 Orb Animation

```css
@keyframes orb-float {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(40px, -30px) scale(1.05); }
  66%  { transform: translate(-20px, 20px) scale(0.95); }
  100% { transform: translate(30px, 40px) scale(1.02); }
}
```

Duration: 20s – 30s per orb (staggered), `ease-in-out infinite alternate`.

---

## 7. Animation & Motion

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Logo glow | `box-shadow` pulse | 3s | ease-in-out |
| Live dot | opacity blink | 1.4s | ease-in-out |
| State ring pulse | scale + opacity | 2s | ease-out |
| Confidence shimmer | translateX sweep | 2s | ease-in-out |
| Card hover lift | transform + shadow | 0.35s | cubic-bezier(0.22,1,0.36,1) |
| Log slide-in | translateX + opacity | 0.35s | cubic-bezier(0.22,1,0.36,1) |
| Orb float | translate + scale | 20-30s | ease-in-out |

### Transition Token
```css
--transition: 0.35s cubic-bezier(0.22, 1, 0.36, 1);
/* Custom ease-out — "gentle deceleration" */
```

---

## 8. Responsive Breakpoints

| Breakpoint | Layout Changes |
|------------|---------------|
| **> 960px** | 2-column charts & logs, 5-column stat grid |
| **768px – 960px** | 2-column stats, stacked charts |
| **480px – 768px** | 2-column stats, stacked everything |
| **< 480px** | Single-column, compact header, smaller stat values |

---

## 9. Asset Creation Blueprint

### 9.1 Logo Mark

- **Symbol:** A stylized eye / shield hybrid — hexagon with a concentric pupil ring
- **Gradient:** Electric Teal → Deep Violet (135°)
- **Size:** 44×44px (desktop), 36×36px (mobile)
- **File format:** SVG with `<linearGradient>` — no external assets required
- **Glow:** 24px `box-shadow` blur, animated to 40px on 3s loop

### 9.2 Icon Set

Use **unified outline icons** (1.5px stroke weight, rounded caps/joins):

| Metric | Recommended Icon |
|--------|-----------------|
| Heart Rate | Heart pulse / heartbeat line |
| GSR | Wave / zigzag with droplet |
| IBI | Clock with heartbeat |
| HRV | Bar chart ascending |
| State | Shield / brain / concentric circles |
| Voice | Speech bubble with waveform |
| Anomaly | Warning triangle / exclamation |

**Style:** No filled areas — clean 24×24 viewBox outlines at `rgba(255,255,255,0.6)` default, accent color on interaction.

### 9.3 Background Texture

The SVG noise filter encoded inline (no external image fetch):

```svg
<filter id="noise">
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
</filter>
```

Applied as a fixed overlay at 2.5% opacity — adds film-grain depth to glass surfaces.

### 9.4 Chart.js Theme

The global Chart.js defaults should be set to:
- `borderColor`: transparent (use per-dataset)
- `color`: `#4a5670` (tick labels)
- `font.family`: `'JetBrains Mono', monospace`
- `grid.color`: `rgba(255,255,255,0.04)`
- `tooltip`: dark glass with accent border, 12px padding, 8px corner radius

### 9.5 Font Loading Strategy

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

`display=swap` ensures text remains visible during load.

---

## 10. Accessibility Considerations

| Concern | Implementation |
|---------|---------------|
| Color contrast | All text passes WCAG AA (4.5:1) against `#0d1424` |
| Motion sensitivity | Animations use `prefers-reduced-motion` — disable orbs, reduce transitions to 0.1s |
| Focus indicators | `2px solid var(--teal)` with `2px` offset on all interactive elements |
| Screen readers | Semantic HTML (`<header>`, `<footer>`, `<section>` landmarks) |
| Touch targets | All interactive elements ≥ 44×44px |

---

## 11. Production File Checklist

- [ ] `logo.svg` — Vector shield/eye mark with gradient
- [ ] `icons/` — 6 outline SVG icons (HR, GSR, IBI, HRV, state, voice, anomaly)
- [ ] `fonts/` — Self-hosted Inter + JetBrains Mono (WOFF2, subset)
- [ ] `dashboard.html` — Complete glassmorphic UI (implemented above)
- [ ] `tokens.css` — Standalone CSS custom-property sheet
- [ ] `noise.png` — Pre-computed noise texture (optional performance optimization)

---

*SentinelMind V3.0 Design System · Edge Physiological Intelligence · 2026*
