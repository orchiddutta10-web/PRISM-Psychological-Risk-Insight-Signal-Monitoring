# SentinelMind V3.0 — Layout & Interaction Specification

> **Cinematic Bio-signal Visualization · Responsive Grid System · SVG/Canvas Animation Pipeline**  
> *For engineering implementation — bridges design intent to production code.*

---

## 1. Responsive Layout Architecture

### 1.1 Grid System

The dashboard uses a **12-column implicit grid** at all breakpoints, implemented via CSS Grid. Cards span column counts based on priority.

```
Desktop (≥ 960px)                    Tablet (768–959px)              Mobile (< 768px)
┌──────────────────────────┐        ┌──────────────────────┐       ┌──────────────────────┐
│        Navigation         │ 12c   │      Navigation      │ 12c   │       Navigation      │ 12c
├──────────────────────────┤        ├──────────────────────┤       ├──────────────────────┤
│        Status Bar         │ 12c   │      Status Bar      │ 12c   │       Status Bar      │ 12c
├──────┬──────┬──────┬─────┤        ├──────┬──────┬──────┬─┤       ├──────────────────────┤
│ HR   │ GSR  │ IBI  │ HRV │ 3c ea │ HR   │ GSR  │ IBI  │HRV│ 3c   │         HR           │12c
├──────┴──────┴──────┴─────┤        ├──────┴──────┴──────┴──┤       ├──────────────────────┤
│         State Card       │ 12c    │       State Card      │ 6c    │         GSR           │12c
│                          │        │  (spans center)       │       ├──────────────────────┤
├──────────────────────────┤        ├──────────────────────┤       │         IBI           │12c
│      HR Chart  │ GSR     │ 6c+6c  │    HR Chart          │ 12c   ├──────────────────────┤
│      Chart               │        ├──────────────────────┤       │         HRV           │12c
│                          │        │    GSR Chart         │ 12c   ├──────────────────────┤
├──────────────────────────┤        ├──────────────────────┤       │      State Card       │12c
│  Anomaly  │  Voice       │ 6c+6c  │  Anomaly  │  Voice   │ 6c+6  ├──────────────────────┤
├──────────────────────────┤        ├──────────────────────┤       │    HR Chart           │12c
│         Footer           │ 12c    │       Footer         │ 12c   ├──────────────────────┤
└──────────────────────────┘        └──────────────────────┘       │    GSR Chart          │12c
                                                                   ├──────────────────────┤
                                                                   │ Anomaly │ Voice       │12c
                                                                   ├──────────────────────┤
                                                                   │       Footer         │12c
                                                                   └──────────────────────┘
```

### 1.2 Breakpoint Constants

| Name | Min Width | Max Width | Columns | Gutter | Container Padding |
|------|-----------|-----------|---------|--------|------------------|
| `xs` | 0 | 479px | 2 | 12px | 16px |
| `sm` | 480px | 767px | 2 | 12px | 16px |
| `md` | 768px | 959px | 4 | 16px | 24px |
| `lg` | 960px | 1439px | 12 | 20px | 28px |
| `xl` | 1440px | ∞ | 12 | 20px | 28px (centered) |

### 1.3 Spacing Scale

```css
--space-1:   4px;
--space-2:   8px;
--space-3:   12px;
--space-4:   16px;
--space-5:   20px;
--space-6:   24px;
--space-8:   32px;
--space-10:  40px;
--space-12:  48px;
--space-16:  64px;
```

### 1.4 Card Sizing Rules

| Component | Desktop (lg/xl) | Tablet (md) | Mobile (xs/sm) |
|-----------|----------------|-------------|----------------|
| Stat cards | 210px min, 1fr max | 1fr (2 col) | 1fr (1 col) |
| State card | minmax(280px, 1fr) | 1fr | 1fr |
| Chart cards | 1fr 1fr (side-by-side) | 1fr | 1fr |
| Log panels | 1fr 1fr (side-by-side) | 1fr 1fr | 1fr |

---

## 2. Interactive Vector Graphics Specification

### 2.1 SVG — Animated Pulse Waveform (Hero HRV Visual)

**Purpose:** Replace the static stat card for HRV with a live SVG wave that visually respresents heart rate variability in real-time.

```
Specification
─────────────
ViewBox:       0 0 400 120
Aspect Ratio:  xMidYMid meet
Role:          Decorative + data visualization (ARIA: presentation)

Layers (bottom → top):
  Layer 1: Base grid lines (every 20 units)
           1px, rgba(255,255,255,0.04), dashed 2 4
  Layer 2: HRV envelope — filled area under waveform
           fill: url(#hrv-gradient) — linear top teal→transparent
           opacity: 0.2
  Layer 3: Waveform path — cubic bezier interpolation of IBI data
           stroke: var(--teal)         (calm)
           stroke: var(--crimson)      (stressed)
           stroke-width: 2.5
           stroke-linecap: round
           fill: none
           filter: url(#glow-teal)     (SVG glow filter)
  Layer 4: Beat markers — circles at each R-peak
           r: 4, fill: white
           filter: url(#glow-white)
  Layer 5: Sweep line — vertical line that tracks current time
           1px, rgba(255,255,255,0.1), animation: sweep 2s linear

Animation:
  ─ The waveform path is updated every 200ms via JS by pushing new IBI values
    into a fixed-length circular buffer (48 points = ~10s at 200ms).
  ─ Path is rendered with SVG <path> using Catmull-Rom or cubic-bezier smoothing.
  ─ The sweep line continuously animates across the viewBox width at constant
    speed, resetting when it reaches the right edge.
  ─ When state = STRESSED: waveform amplitude increases 1.5×, color shifts
    from teal to crimson over 600ms.
  ─ On each heartbeat (rising-edge), a radial pulse emanates from the beat
    marker dot — scale 1→3, opacity 1→0 over 800ms.

SVG Glow Filter:
  <filter id="glow-teal" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="3" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
```

**Data binding:** Each IBI value (ms) is normalized to the viewBox Y range (120 → 20 for 600ms → 1200ms IBI). The last 48 points form a rolling buffer.

### 2.2 SVG — GSR Ripple Tank (Electrodermal Activity)

**Purpose:** A 2D top-down "water surface" visualization where SCR events appear as expanding ripples, and tonic SCL controls the water level/color.

```
Specification
─────────────
ViewBox:       0 0 400 120
Role:          Decorative + ambient data visualization

Visual model:
  ─ Background: dark radial gradient simulating water depth
    (center: rgba(0,212,255,0.05) → edges: transparent)
  ─ Water surface: a horizontal sine wave line whose amplitude is
    proportional to tonic SCL (baseline skin conductance).
    Y position: map(SCL, 1µS, 20µS, 90, 30)
  ─ Phasic SCR events appear as concentric ellipses expanding outward:
    Start: rx=2, ry=1, opacity=0.6
    End:   rx=60, ry=15, opacity=0
    Duration: 2000ms, ease-out
    Color: #00d4ff (or #ff2d55 if SCR > 1.0µS)
  ─ A subtle grid (polar/radar style) underneath to give depth:
    40px concentric circles at 10% opacity

Animation:
  ─ The water line animates continuously using 2 stacked sine waves
    (frequency 0.02Hz and 0.05Hz) to simulate slow drift.
  ─ Each SCR event (when phasic > 0.05µS) spawns a new ripple using
    requestAnimationFrame for smooth physics.
  ─ When multiple SCRs cluster (< 500ms apart), ripples merge —
    overlapping ellipses produce moiré interference patterns.

SVG Ripple element template:
  <ellipse cx="200" cy="60" rx="2" ry="1"
    fill="none" stroke="rgba(0,212,255,0.6)" stroke-width="1.5"
    class="ripple" data-birth="{timestamp}" data-amplitude="{scr_value}"/>
```

### 2.3 Canvas — Heart Rate Variability Poincaré Plot (Real-time)

**Purpose:** A cinematic scatter plot showing RR-interval (IBI) dynamics — each point plots IBIₙ vs IBIₙ₊₁. The shape reveals sympathetic/parasympathetic balance.

```
Specification
─────────────
Canvas size:  100% of parent container (min 240×240px)
Resolution:   devicePixelRatio × CSS size (for retina)
Engine:       requestAnimationFrame loop (60fps target)

Visual design:
  ─ Background: dark gradient matching obsidian theme
  ─ Grid: light grid lines at 100ms intervals
    stroke: rgba(255,255,255,0.04), dashed
  ─ Identity line (x=y): 1px, rgba(255,255,255,0.08), dashed
  ─ Data points:
    * Normal (SDNN > 40):  teal dots, r=3, glow 4px
    * Low HRV (SDNN < 25): crimson dots, r=4, glow 6px
    * Transition: points fade from teal→crimson over 10s window
  ─ Elliptical SD1/SD2 overlay:
    * Standard deviation ellipse covering 1σ of points
    * stroke: rgba(255,255,255,0.15), fill: rgba(0,212,255,0.03)
    * Updates every 5s (rolling window of 30 points)
  ─ Tail effect: points fade from full opacity to 0.2 over 60s

Animation:
  ─ New points animate in with a brief "pop" (scale 0→1 over 200ms ease-out)
  ─ Camera auto-scales to fit the current cluster with 20% margin padding
  ─ Axis labels: bottom-left corner, monospace, 0.6rem, --text-muted
  ─ Stats overlay: SDNN, RMSSD, SD1/SD2 ratio in top-left corner

Rendering pipeline (pseudocode):
  function drawPoincare(ctx, ibiBuffer, width, height) {
    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx, width, height);
    drawIdentityLine(ctx, width, height);
    for (let i = 1; i < ibiBuffer.length; i++) {
      const x = map(ibiBuffer[i-1],   ibiMin, ibiMax, margin, width-margin);
      const y = map(ibiBuffer[i],     ibiMin, ibiMax, height-margin, margin);
      const age = (now - timestamps[i]) / 60000; // age in minutes
      const alpha = lerp(1, 0.2, clamp(age / 10, 0, 1));
      drawGlowDot(ctx, x, y, radius, color, alpha);
    }
    drawSDEllipse(ctx, ibiBuffer, width, height);
  }
```

### 2.4 Canvas — GSR Spectrogram (Optional — Cinematic Mode)

**Purpose:** A vertically scrolling spectrogram showing GSR frequency content over time. Creates a "radar/sonar" cinematic effect.

```
Specification
─────────────
Canvas size:  100% × 120px (compact strip below main GSR chart)
Mode:         Scrolling heatmap (top = now, bottom = 30s ago)

Rendering:
  ─ Compute STFT (Short-Time Fourier Transform) on GSR signal
    using 2s Hann windows with 1s overlap
  ─ Map frequency bins (0–2Hz) to color gradient:
    0–0.05Hz (SCL):     deep blue → teal
    0.05–0.5Hz (SCR):   teal → amber
    0.5–2Hz (noise):    amber → crimson
  ─ Scroll new column in from top every 1s
  ─ Column width = canvas.width / 30 (30s history)

Color scale:
  ──80dB (noise floor): transparent
  ──40dB (moderate):    #00d4ff at 40% opacity
  ──20dB (strong SCR):  #ff2d55 at 70% opacity
   0dB (saturation):    #ffffff at 90% opacity
```

---

## 3. SVG Asset Specifications — Complete Checklist

### 3.1 Master Checklist

```
SENTINELMIND SVG ASSET REGISTER
═══════════════════════════════════════════════════════════

 □ LOGO MARK                              priority: P0  |  status: delivered
    ├── File:         logo.svg
    ├── ViewBox:      0 0 44 44
    ├── Art:          Concentric hexagons with pupil/gradient core
    ├── Gradients:    linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1"
    │                 <stop offset="0%" stop-color="#00d4ff"/>
    │                 <stop offset="100%" stop-color="#6c5ce7"/>
    ├── Sizes:        44px (header), 36px (mobile header), 24px (favicon)
    └── Fallback:     A single teal circle if SVG fails (bg color)

 □ ICON — HEART RATE (HR)                priority: P0  |  status: spec
    ├── File:         icon-hr.svg
    ├── ViewBox:      0 0 24 24
    ├── Stroke:       1.5px, round caps/joins
    ├── Art:          Heartbeat line (ECG-style) with heart shape
    └── Variant:      Animated path for interactive use

 □ ICON — GALVANIC SKIN RESPONSE (GSR)   priority: P0  |  status: spec
    ├── File:         icon-gsr.svg
    ├── ViewBox:      0 0 24 24
    ├── Stroke:       1.5px, round caps/joins
    ├── Art:          Three ascending wave arcs with a droplet above
    └── Variant:      Animated wave for interactive use

 □ ICON — INTER-BEAT INTERVAL (IBI)      priority: P1  |  status: spec
    ├── File:         icon-ibi.svg
    ├── ViewBox:      0 0 24 24
    ├── Stroke:       1.5px
    ├── Art:          Clock face with sine wave inside
    └── Notes:        Second hand can be animated via CSS transform

 □ ICON — HEART RATE VARIABILITY (HRV)   priority: P1  |  status: spec
    ├── File:         icon-hrv.svg
    ├── ViewBox:      0 0 24 24
    ├── Stroke:       1.5px
    ├── Art:          Two concentric circles with dots (Poincaré plot abstraction)
    └── Notes:        Dots should be animatable (CSS keyframes)

 □ ICON — STRESS STATE                   priority: P0  |  status: spec
    ├── File:         icon-state.svg
    ├── ViewBox:      0 0 24 24
    ├── Stroke:       1.5px
    ├── Art:          Shield with brain/circuit pattern inside
    └── Variant:      Dashed outline for REST, solid for STRESSED

 □ ICON — VOICE COMMAND                  priority: P1  |  status: spec
    ├── File:         icon-voice.svg
    ├── ViewBox:      0 0 24 24
    ├── Stroke:       1.5px
    └── Art:          Speech bubble with waveform bars

 □ ICON — ANOMALY/ALERT                  priority: P1  |  status: spec
    ├── File:         icon-anomaly.svg
    ├── ViewBox:      0 0 24 24
    ├── Stroke:       1.5px
    └── Art:          Triangle with exclamation, dot below

 □ PULSE WAVEFORM HERO                   priority: P0  |  status: spec
    ├── File:         waveform-hrv.svg
    ├── ViewBox:      0 0 400 120
    ├── Filters:      glow-teal, glow-crimson, glow-white (SVG filters)
    ├── Elements:     grid lines, waveform path, beat markers, sweep line
    └── Integration:  Inline SVG with JS path updates

 □ GSR RIPPLE TANK                       priority: P0  |  status: spec
    ├── File:         gsr-ripple.svg
    ├── ViewBox:      0 0 400 120
    ├── Elements:     water line, ripple ellipses, polar grid
    └── Integration:  Inline SVG with JS ripple spawning

 □ FAVICON                               priority: P0  |  status: pending
    ├── File:         favicon.svg
    ├── Sizes:        SVG (any), 16×16, 32×32, 48×48
    ├── Art:          Centered 16×16 crop of logo mark
    └── Theme:        Dark background (#05080f)

 □ NOISE TEXTURE                         priority: P2  |  status: delivered (inline)
    └── Format:       SVG filter embedded in CSS background-image
```

### 3.2 SVG Authoring Conventions

| Rule | Standard |
|------|----------|
| Colors | Use CSS custom properties via `<use>` or inline `currentColor`. Never hardcode hex. |
| Stroke alignment | `stroke-alignment: inner` where possible (1.5px on 24×24 icons) |
| Responsive sizing | `width="100%" height="100%"` + `viewBox` on all SVGs |
| Animation | Prefer CSS `@keyframes` over SMIL for SVG element animation |
| Accessibility | `<title>` and `<desc>` on all SVGs, `aria-hidden="true"` for decorative |
| Retina | For large SVGs (waveform, ripple): render at 2× via `viewBox` scaling |

---

## 4. Component Styling Rules

### 4.1 Glass Card (Base Component)

```css
.glass {
  /* Surface */
  background: rgba(13, 20, 36, 0.72);

  /* Frosting */
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);

  /* Border — subtle glass edge */
  border: 1px solid rgba(255, 255, 255, 0.07);

  /* Depth */
  border-radius: 14px;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);

  /* Interaction */
  transition:
    background 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.glass:hover {
  background: rgba(20, 32, 55, 0.82);
  border-color: rgba(0, 212, 255, 0.22);
  transform: translateY(-2px);
  box-shadow:
    0 12px 48px rgba(0, 0, 0, 0.60),
    0 0 30px rgba(0, 212, 255, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
```

### 4.2 Stat Card

```
┌──────────────────────────────────────┐
│  ┌──────────────────┐  ────── 40px    │  margin-bottom: 14px
│  │   Icon container  │  radius: 10px  │
│  │   40×40          │  glass border   │
│  └──────────────────┘                 │
│  LABEL (uppercase)                     │  0.68rem / 600 / 1px letter-space / muted
│  Value                                 │  2.4rem / 700 / mono / gradient text
│  Unit                                  │  0.7rem / 400 / muted
│                                        │
│  ── accent underline (hover reveal)   │  2px, gradient
└──────────────────────────────────────┘
```

**Rules:**
- Icon container: `background: rgba(255,255,255,0.03)`, border `1px solid rgba(255,255,255,0.07)`
- On hover: icon container border → `rgba(0,212,255,0.22)`, background → `rgba(0,212,255,0.06)`
- Value text: `background: linear-gradient(135deg, #e8edf5 50%, #7b89a6)` clipped to text
- Accent underline: `::before` pseudo-element, `height: 2px`, `opacity: 0` → `1` on hover
- Cursor spot: `--mouse-x` / `--mouse-y` CSS custom properties set by JS mousemove, consumed by `radial-gradient` in `::after`

### 4.3 State Card (Ring Gauge)

```
┌──────────────────────────────────────┐
│  STATE LABEL          ┌──────────┐    │
│                       │  56px    │    │
│                       │  SVG ring│    │
│                       │  gauge   │    │
│                       └──────────┘    │
│  STATE NAME (mono)                     │  1.3rem / 700 / 1px letter-spacing
│                                        │
│  Confidence ────────────────── 85%     │  label: flex, space-between
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░          │  track: 4px height
│                                        │  fill: gradient, shimmer animation
└──────────────────────────────────────┘
```

**Rules:**
- SVG ring: `circumference = 150.8` (r=24). `stroke-dasharray = 150.8`. `stroke-dashoffset` mapped from confidence %
- Ring dot: 10px circle centered, `::after` pseudo-element for pulse animation (2s, scale 1→2.5, opacity 0.5→0)
- State name color: mint / crimson / amber based on `.state-REST` / `.state-STRESSED` / `.state-EXCITED`
- Confidence fill: gradient matching state color, `::after` shimmer (translateX -100% → 100%, 2s, ease-in-out)

### 4.4 Chart Card

```
┌──────────────────────────────────────┐
│  ● Title                  ┌────────┐ │
│  Subtitle                 │  badge │ │
│                           └────────┘ │
│  ┌──────────────────────────────────┐│
│  │                                  ││
│  │   Chart.js canvas (200px h)     ││
│  │                                  ││
│  └──────────────────────────────────┘│
└──────────────────────────────────────┘
```

**Rules:**
- Badge: `font-family: var(--mono)`, `0.72rem`, `padding: 4px 12px`, `border-radius: 20px`
- Badge HR: `background: rgba(255,45,85,0.1)`, `border: 1px solid rgba(255,45,85,0.15)`, `color: #ff2d55`
- Badge GSR: `background: rgba(0,212,255,0.1)`, `border: 1px solid rgba(0,212,255,0.15)`, `color: #00d4ff`
- Title dot: 8px circle, colored + `box-shadow: 0 0 8px` for glow

### 4.5 Log Entry

| Severity | Left Border Color | Type Label Color | Background |
|----------|------------------|-----------------|------------|
| `critical` | `var(--crimson)` `#ff2d55` | `var(--crimson)` | `rgba(18,28,50,0.55)` |
| `warning` | `var(--amber)` `#f5c518` | `var(--amber)` | `rgba(18,28,50,0.55)` |
| `info` | `var(--teal)` `#00d4ff` | `var(--teal)` | `rgba(18,28,50,0.55)` |

**Animation (on render):** `translateX(-12px)` → `0`, `opacity 0` → `1`, `0.35s cubic-bezier(0.22,1,0.36,1)`

---

## 5. CSS Custom Properties — Complete Reference

### 5.1 Full Variable Sheet

```css
/* ── Background System ──────────────────────────────────── */
--bg-obsidian:              #05080f;
--bg-abyssal:               #080c18;
--bg-void:                  #0d1424;
--bg-glass:                 rgba(13, 20, 36, 0.72);
--bg-glass-alt:             rgba(18, 28, 50, 0.55);
--bg-glass-hover:           rgba(20, 32, 55, 0.82);

/* ── Glassmorphism ──────────────────────────────────────── */
--glass-bg:                 var(--bg-glass);
--glass-bg-alt:             var(--bg-glass-alt);
--glass-bg-hover:           var(--bg-glass-hover);
--glass-border:             rgba(255, 255, 255, 0.07);
--glass-border-strong:      rgba(255, 255, 255, 0.12);
--glass-border-glow:        rgba(0, 212, 255, 0.22);
--glass-shadow:             0 8px 40px rgba(0, 0, 0, 0.55);
--glass-shadow-hover:       0 12px 48px rgba(0, 0, 0, 0.60);
--glass-blur:               blur(18px);
--glass-blur-lg:            blur(32px);

/* ── Neon Accents ───────────────────────────────────────── */
--teal:                     #00d4ff;
--neon-cyan:                #00f0ff;
--violet:                   #6c5ce7;
--crimson:                  #ff2d55;
--crimson-muted:            #ff4d6d;
--mint:                     #00e5a0;
--amber:                    #f5c518;

/* ── Gradients ──────────────────────────────────────────── */
--gradient-accent:          linear-gradient(135deg, var(--teal), var(--violet));
--gradient-stress:          linear-gradient(135deg, var(--crimson), #ff6b6b);
--gradient-calm:            linear-gradient(135deg, var(--mint), var(--teal));
--gradient-warm:            linear-gradient(135deg, var(--amber), #ff8a5c);
--gradient-glass-sheen:     linear-gradient(180deg, rgba(255,255,255,0.06), transparent);
--gradient-text:            linear-gradient(135deg, var(--text-primary) 50%, var(--text-secondary));

/* ── Text ───────────────────────────────────────────────── */
--text-primary:             #e8edf5;
--text-secondary:           #7b89a6;
--text-muted:               #4a5670;

/* ── Typography ─────────────────────────────────────────── */
--font-sans:                'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono:                'JetBrains Mono', 'Fira Code', monospace;

/* ── Borders & Radius ───────────────────────────────────── */
--radius-sm:                8px;
--radius-md:                14px;
--radius-lg:                20px;
--radius-xl:                28px;
--radius-full:              9999px;

/* ── Spacing ────────────────────────────────────────────── */
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;

/* ── Animation ──────────────────────────────────────────── */
--ease-out:                 cubic-bezier(0.22, 1, 0.36, 1);
--ease-inout:               cubic-bezier(0.65, 0, 0.35, 1);
--duration-fast:            0.2s;
--duration-base:            0.35s;
--duration-slow:            0.6s;
--duration-xslow:           1s;

/* ── Z-Index Scale ──────────────────────────────────────── */
--z-ambient:                0;
--z-content:                1;
--z-sticky:                 10;
--z-overlay:                100;
--z-tooltip:                200;

/* ── Chart Colors ───────────────────────────────────────── */
--chart-hr-line:            var(--crimson);
--chart-hr-fill:            rgba(255, 45, 85, 0.15);
--chart-gsr-line:           var(--teal);
--chart-gsr-fill:           rgba(0, 212, 255, 0.12);

/* ── Animation Keyframes ────────────────────────────────── */
@keyframes fade-in {        from { opacity: 0; } to { opacity: 1; } }
@keyframes slide-up {       from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slide-in-left {  from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
@keyframes shimmer {        0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
@keyframes pulse-ring {     0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(2.5); opacity: 0; } }
@keyframes live-blink {     0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
@keyframes logo-glow {      0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
```

### 5.2 Tailwind CSS Configuration Equivalent

If migrating to Tailwind CSS, the `tailwind.config.js` would include:

```js
// tailwind.config.js
module.exports = {
  content: ['./app/templates/**/*.html'],
  darkMode: 'class', // always class="dark" on <html>
  theme: {
    extend: {
      colors: {
        obsidian:  '#05080f',
        abyssal:   '#080c18',
        void:      '#0d1424',
        teal:      '#00d4ff',
        'neon-cyan':'#00f0ff',
        violet:    '#6c5ce7',
        crimson:   '#ff2d55',
        'crimson-muted': '#ff4d6d',
        mint:      '#00e5a0',
        amber:     '#f5c518',
        'text-primary':   '#e8edf5',
        'text-secondary': '#7b89a6',
        'text-muted':     '#4a5670',
        glass: {
          DEFAULT: 'rgba(13,20,36,0.72)',
          alt:     'rgba(18,28,50,0.55)',
          hover:   'rgba(20,32,55,0.82)',
          border:  'rgba(255,255,255,0.07)',
          glow:    'rgba(0,212,255,0.22)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backdropBlur: {
        glass: '18px',
        'glass-lg': '32px',
      },
      boxShadow: {
        glass: '0 8px 40px rgba(0,0,0,0.55)',
        'glass-hover': '0 12px 48px rgba(0,0,0,0.60), 0 0 30px rgba(0,212,255,0.04)',
        'neon-teal': '0 0 20px rgba(0,212,255,0.3)',
        'neon-crimson': '0 0 20px rgba(255,45,85,0.3)',
      },
      borderRadius: {
        glass: '14px',
        'glass-lg': '20px',
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #00d4ff, #6c5ce7)',
        'gradient-stress': 'linear-gradient(135deg, #ff2d55, #ff6b6b)',
        'gradient-calm':   'linear-gradient(135deg, #00e5a0, #00d4ff)',
        'gradient-glass':  'linear-gradient(180deg, rgba(255,255,255,0.06), transparent)',
        'gradient-text':   'linear-gradient(135deg, #e8edf5 50%, #7b89a6)',
      },
      transitionTimingFunction: {
        'ease-out-expo': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'logo-glow':   'logo-glow 3s ease-in-out infinite',
        'live-blink':  'live-blink 1.4s ease-in-out infinite',
        'pulse-ring':  'pulse-ring 2s ease-out infinite',
        'shimmer':     'shimmer 2s ease-in-out infinite',
        'slide-up':    'slide-up 0.35s ease-out',
        'slide-left':  'slide-in-left 0.35s ease-out',
        'fade-in':     'fade-in 0.35s ease-out',
      },
      keyframes: {
        'logo-glow': {
          '0%, 100%': { opacity: '0.3' },
          '50%':      { opacity: '0.6' },
        },
        'pulse-ring': {
          '0%':   { transform: 'scale(1)', opacity: '0.5' },
          '100%': { transform: 'scale(2.5)', opacity: '0' },
        },
        'shimmer': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};
```

---

## 6. Real-time Canvas Animation Pipeline

### 6.1 Rendering Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    requestAnimationFrame Loop                │
│                         (60 fps target)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Poincaré    │    │  Spectrogram │    │  Pulse Wave  │  │
│  │  Plot (HRV)  │    │  (GSR)      │    │  (SVG)       │  │
│  │  canvas      │    │  canvas     │    │  inline SVG  │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │           │
│         └───────────┬───────┴───────┬───────────┘           │
│                     │               │                       │
│              ┌──────┴──────┐  ┌─────┴──────┐               │
│              │  Data Bus   │  │   Anim     │               │
│              │  (IBI, GSR) │  │   Engine   │               │
│              └──────┬──────┘  └─────┬──────┘               │
│                     │               │                       │
│              ┌──────┴───────────────┴──────┐               │
│              │     Poll /api/v1/...        │               │
│              └─────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Frame Budget (per 16.6ms)

| Operation | Budget | Notes |
|-----------|--------|-------|
| Data fetch (XHR) | 0ms | Async, does not block |
| JSON parse + buffer push | < 1ms | O(1) ring buffer |
| Poincaré draw | 4ms | ~60 points + 1 ellipse |
| Spectrogram draw | 3ms | Push 1 column, shift |
| SVG path update | 1ms | Set `d` attribute |
| GSR ripple physics | 2ms | Update 10–30 ellipses |
| DOM updates (stat values) | 2ms | Batch via `requestAnimationFrame` |
| **Total** | **~12ms** | Headroom for GC/painting |

### 6.3 Performance Rules

1. **Buffer pooling** — pre-allocate typed arrays (`Float64Array`) for rolling buffers; never `push/shift` on arrays
2. **OffscreenCanvas** — if available, render static elements (grid, axes) to an offscreen canvas and copy via `drawImage`
3. **Throttle SVG updates** — if JS frame budget exceeds 14ms, reduce SVG path resolution (decimate to every other point)
4. **DevicePixelRatio** — multiply canvas dimensions by `window.devicePixelRatio` and scale the context; set CSS size to logical pixels
5. **Pause when hidden** — use `document.visibilitychange` to pause all animation loops when tab is not visible

### 6.4 Data Bus Interface

```typescript
interface BiometricDataBus {
  // Ring buffers (fixed length, pre-allocated)
  ibiBuffer:    Float64Array(120);     // 120 IBI samples (~2 min at 1Hz)
  gsrBuffer:    Float64Array(600);     // 600 GSR samples (~1 min at 10Hz)
  hrBuffer:     Float64Array(600);
  timestamps:   Float64Array(600);

  // State
  currentState: 'REST' | 'STRESSED' | 'EXCITED';
  confidence:   number;                // 0.0 – 1.0
  hrvMetrics: {
    sdnn:   number;
    rmssd:  number;
    sd1:    number;
    sd2:    number;
  };

  // Push (called each poll cycle)
  pushReading(sensor: SensorSnapshot): void;

  // Subscribe (for canvas/SVG renderers)
  onUpdate(callback: (data: this) => void): void;
}
```

---

## 7. Cinematic Effects — Implementation Notes

### 7.1 Glow Compositing

For chart lines and SVG elements, use CSS `filter: drop-shadow()` as a first pass. For more cinematic quality, use canvas `shadowBlur`:

```javascript
// Canvas glow — cinematic
ctx.shadowColor = '#00d4ff';
ctx.shadowBlur = 12;
ctx.beginPath();
ctx.strokeStyle = '#00d4ff';
ctx.lineWidth = 2.5;
// ... draw path ...
ctx.stroke();
```

For SVG, use the `<filter>` approach:

```svg
<filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur1"/>
  <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur2"/>
  <feMerge>
    <feMergeNode in="blur2"/>
    <feMergeNode in="blur1"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>
```

### 7.2 Transition Matrix for State Changes

When the predicted state changes (e.g., REST → STRESSED), trigger a **coordinated transition** across all visual elements:

| Element | REST → STRESSED Transition | Duration |
|---------|---------------------------|----------|
| Ambient orbs | Dominant orb shifts from teal → crimson | 2s ease |
| Stat card borders | All stat cards gain crimson accent | 1s ease |
| State ring | Ring fill rotates + color shifts | 0.6s ease-out |
| Pulse waveform SVG | Path color teal → crimson | 0.6s ease |
| GSR ripple tank | Ripple color teal → crimson | 0.6s ease |
| Chart fills | Gradient endpoints shift to crimson mix | 1s ease |
| Confidence bar | Animate to new width | 0.6s ease-out |

This is implemented by setting a CSS custom property `--state-accent` on `<html>` and using it in all `rgba()` / `background` / `border-color` values:

```css
:root { --state-accent: #00d4ff; }
:root.state-STRESSED { --state-accent: #ff2d55; }
:root.state-EXCITED  { --state-accent: #f5c518; }
```

Then all accent-dependent values reference `var(--state-accent)` for smooth 1s transitions.

### 7.3 Depth Layering

Create perceived depth via 5 z-layers:

```
Layer  -2:   Ambient orbs (fixed, slow parallax)
Layer  -1:   Grid overlay + noise texture
Layer   0:   Glass cards (backdrop-filter isolates them from background)
Layer   1:   Content inside cards (text, icons, charts)
Layer   2:   Hover effects, tooltips, cursor spotlights
```

---

## 8. Mobile-Specific Adaptations

### 8.1 Touch Interactions

| Element | Desktop | Mobile |
|---------|---------|--------|
| Card hover lift | `translateY(-2px)` on mouseenter | No lift (use `active` state instead) |
| Cursor spotlight | Radial gradient tracks mouse | Disabled (no hover) |
| State ring pulse | Always animating | Paused when not visible (IntersectionObserver) |
| Chart tooltip | On hover | On tap (Chart.js built-in) |

### 8.2 Mobile Layout Rules

1. All cards stack to full width below 480px
2. Stat values reduce to 1.8rem on mobile
3. Header collapses to single column with `flex-direction: column`
4. Live badge and clock on separate row
5. Status bar wraps with `flex-wrap: wrap`
6. Chart heights reduce to 140px
7. Log panels max-height reduces to 240px
8. Orbs reduce to 60% size to avoid overflow
9. Touch targets minimum 44×44px

### 8.3 Viewport Meta

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

`user-scalable=no` prevents accidental zoom when tapping dashboard UI elements rapidly.

---

## 9. Implementation Priority Matrix

| Feature | Effort | Impact | Priority |
|---------|--------|--------|----------|
| Glass card system (CSS) | Low | High | **P0 — now** |
| Color tokens + variables | Low | High | **P0 — now** |
| State ring gauge SVG | Medium | High | **P0 — now** |
| Ambient background system | Medium | Medium | **P0 — now** |
| Poincaré plot canvas | High | High | **P1 — next** |
| Live pulse waveform SVG | Medium | High | **P1 — next** |
| GSR ripple tank SVG | Medium | Medium | **P1 — next** |
| Coordinated state transitions | Medium | High | **P1 — next** |
| SVG icon set (6 icons) | Low | Medium | **P2 — soon** |
| GSR spectrogram canvas | High | Low | **P3 — nice to have** |
| Tailwind config migration | Medium | Low | **P3 — future** |
| OffscreenCanvas optimization | Medium | Low | **P3 — future** |

---

*Prepared for SentinelMind V3.0 engineering team · Implementation spec v1.0 · 2026*
