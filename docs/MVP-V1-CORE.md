# PRISM MVP V1 — Core Product Loop Only

**Version**: 1.1 (REFOCUSED)  
**Status**: 🔴 **CRITICAL REVISION**  
**Effective Date**: 2026-07-23  
**Change**: Removing secondary/future features from critical path; focusing on core loop

---

## The Problem

Previous MVP-SCOPE.md included too many features:
- ✅ Consent + Consent lifecycle
- ✅ GPS, keystroke, app usage, accelerometer, voice, GSR, PPG
- ✅ Sleep inference, anomaly detection, alerts
- ✅ 5-persona AI companion
- ✅ Guardian dashboard
- ✅ Crisis detection

**Result**: Too much scope for a small team to deliver in 7 days.

---

## The Solution: Core Loop Only

**PRISM V1 = One Core Loop**

```
STEP 1: CONSENT
├─ Teen reads disclosure
└─ Guardian approves (dual consent)

STEP 2: COLLECT BEHAVIORAL SIGNAL
├─ GPS location (every 60 sec)
├─ App usage (category only, event-driven)
└─ Device activity (accelerometer for stillness)

STEP 3: BUILD PERSONAL BASELINE
├─ Sleep window (rule-based from accelerometer + screen)
├─ Daily activity patterns
└─ App usage distribution

STEP 4: DETECT MEANINGFUL CHANGE
├─ Statistical anomaly detection (rolling variance)
├─ Compare to teen's own baseline (not population norms)
└─ Flag deviations >2 std-dev

STEP 5: COMBINE SIGNALS
├─ Is sleep disrupted?
├─ Is activity changed?
├─ Is app usage shifted?
└─ Multi-signal correlation

STEP 6: EXPLAIN CHANGE
├─ Contributing factors (quantified)
├─ Examples: "Sleep ↓ 40%", "Activity ↓ 60%"
└─ Language: Non-diagnostic, neutral

STEP 7: GUARDIAN CHECK-IN
├─ Guardian sees alert with factors
├─ Guardian initiates conversation
└─ Teen shares context (optional)
```

---

## PRISM V1 MVP — 7 Core Features

### F1: Consent & Onboarding ✅
**Teen app displays monitored metrics, dual sign-off required**
- Teen reads what's collected (GPS, apps, activity)
- Guardian approves
- Per-modality toggles (can disable any signal)
- Audit log: all consent changes

**NOT INCLUDED**:
- ❌ Companion personas
- ❌ Voice sessions
- ❌ Complex consent renewal UI

---

### F2: Behavioral Data Ingestion ✅

**Collect 3 behavioral signals only (no physiology)**

| Signal | Type | Sampling | Retention | Notes |
|--------|------|----------|-----------|-------|
| GPS | Location | 60 sec | 90 days | Lat/long only; no address |
| App Usage | Category | Event | 90 days | Social, Gaming, Productivity; NOT app names |
| Accelerometer | Motion | 10 Hz | 3 days | Stillness score; raw data discarded |

**NOT INCLUDED**:
- ❌ Keystroke timing (defer to V1.1)
- ❌ GSR/PPG (synthetic only in V1; real wearables Phase 2)
- ❌ Voice (defer to Phase 2)
- ❌ Screen state (use accelerometer instead for sleep)

---

### F3: Personal Baseline (Rule-Based)

**Calculate teen's own normal patterns — no ML, just rules**

| Baseline Metric | Calculation | Retention |
|---|---|---|
| Sleep window | Accelerometer stillness + screen-off + no app activity for 60+ min | 90 days |
| Activity level | Accelerometer variance per hour (high/med/low) | 90 days |
| App usage % | Time in each category per day | 90 days |
| Location clusters | Home/School/Other (simple geoclustering) | 90 days |

**Algorithm** (heuristic, no ML):
```
Sleep window = (stillness_score > 0.8) AND (screen_off > 60 min) AND (app_idle > 120 min)
Activity level = VARIANCE(accelerometer) last 24h
App category shift = |app_usage_today - app_usage_7day_avg| > threshold
```

**NOT INCLUDED**:
- ❌ Deep learning models
- ❌ LSTM sleep stage classification
- ❌ Personalized ML model per teen
- ❌ Multimodal fusion (defer)

---

### F4: Anomaly Detection (Statistical)

**Compare today to teen's own baseline; flag deviations**

| Check | Threshold | Action |
|-------|-----------|--------|
| Sleep < baseline - 2 std-dev | Triggers Amber | Alert: "Sleep disrupted" |
| Activity < baseline - 2 std-dev | Triggers Amber | Alert: "Less active than usual" |
| App usage shift > 2 std-dev | Triggers Amber | Alert: "App usage pattern changed" |
| Multi-signal: 2+ deviations | Triggers Red | Alert: "Multiple patterns changed" |

**NOT INCLUDED**:
- ❌ Classification models
- ❌ Clustering algorithms
- ❌ Complex statistical inference
- ❌ Probabilistic models

---

### F5: Explainable Alerts (3-Tier)

**Guardian sees alerts with human-readable contributing factors**

#### 🟢 Sage (Baseline)
```
✅ All Quiet
Your teen's patterns are normal today.
```

#### 🟡 Amber (Attention)
```
⚠️ Sleep Disrupted This Week

What changed:
• Sleep duration: 8h → 5h (↓ 38%)
• Sleep time: 23:00 → 01:30 (↑ 2.5 hours later)
• Activity: Normal in day, but evening restless

Suggested next step:
"Hey, I noticed you've been sleeping less lately. Everything okay?"
```

#### 🔴 Red (High Concern)
```
🔴 Sustained Pattern Change (3+ Days)

What changed:
• Sleep: 4-5 hours/night (vs. normal 8-9)
• Activity: 60% lower than baseline
• App usage: Shifted to late night (23:00-03:00)

Immediate action:
1. Check in directly: "I'm noticing some changes. Want to talk?"
2. Consider calling: 988 Lifeline (guidance for parents)
3. Schedule professional check-in (counselor, pediatrician)

Resources: Crisis Text Line (text HOME to 741741)
```

**NOT INCLUDED**:
- ❌ Companion AI personas
- ❌ Multi-persona selection
- ❌ In-app chat
- ❌ Voice emotion detection
- ❌ Advanced crisis classification

---

### F6: Guardian Dashboard

**Simple, focused view of teen's baseline + alerts**

**Views**:
1. **Dashboard**: Last 7 days of alerts (Sage/Amber/Red)
2. **Teen Profile**: Consent status, enabled modalities, baseline metrics
3. **Alert Detail**: Each alert shows contributing factors
4. **Export**: CSV of alert history (for compliance)

**Interactions**:
- View alert timeline
- See contributing factors
- View teen's optional context (if shared)
- Manage consent toggles

**NOT INCLUDED**:
- ❌ Companion messaging
- ❌ Clinician dashboard
- ❌ Longitudinal trend analysis
- ❌ Advanced filtering/search
- ❌ Multi-teen dashboards (V1 = single teen per guardian)

---

### F7: Audit & Security

**Immutable logging, encryption, compliance**

- ✅ TLS 1.3 for all traffic
- ✅ AES-256 encryption for GPS, identifiers
- ✅ Immutable audit log (every read/write)
- ✅ Consent audit trail
- ✅ Data retention policy (90 days behavioral, 24h physio features)
- ✅ User deletion rights (GDPR 17)

**NOT INCLUDED**:
- ❌ HIPAA certification
- ❌ Multi-tenant RBAC (V1 = simple auth)
- ❌ Advanced threat detection

---

## What's Deferred to Later Phases

### 🟡 V1.1 (1-2 weeks after V1 launch)
- Keystroke timing (nice-to-have signal)
- Refinement alerts (5-day threshold instead of 3)
- Teen-facing "what's happening" view

### 🔴 Phase 2 (Post-MVP, 4-8 weeks)
- Real wearable integration (ESP32, BLE, GSR/PPG)
- Voice check-in (speaker verification, optional)
- In-app companion (simplified: text-only, not 5 personas)
- Push notifications to guardian

### 🟠 Phase 3 (Long-term)
- Voice emotion recognition
- AI psychologist companion (5-persona system deferred)
- WhatsApp/Instagram integration
- Advanced crisis detection (multi-modal)
- Deep learning models

### ⚪ Phase 4+ (Future)
- Multimodal fusion
- Clinical outcome correlation
- LSTM models
- Longitudinal dashboards
- School integration (FERPA-compliant)

---

## Why This Focus Works

| Principle | Benefit |
|-----------|---------|
| **Core loop only** | Ship in 7 days instead of 4 weeks |
| **3 sensors** | Minimal permissions, maximal signal quality |
| **Rule-based** | No ML training data needed; deterministic |
| **Dual consent** | Legal compliance (COPPA) from day 1 |
| **Explainable** | Guardians trust the product |
| **Personal baseline** | No population norms; pure behavioral change detection |
| **Guardian-first** | Simplest UX: alerts + context |

---

## Scope Comparison: Before vs. After

### ❌ Previous MVP-SCOPE.md (Too Large)

```
✓ Consent (complex lifecycle)
✓ GPS, keystroke, app, accelerometer
✓ GSR/PPG (synthetic)
✓ Sleep inference (with circadian estimator)
✓ Multi-persona AI companion (5 personas)
✓ Voice sessions
✓ Crisis detection
✓ 3-tier alerts
✓ Guardian dashboard
✓ Audit/security
✓ In-app companion chat
```

**Problems**:
- Too many sensors (7+)
- AI companion adds complexity
- Voice adds new permissions
- GSR/PPG add storage (4.5 GB/day)
- Multiple personas = significant code

---

### ✅ New MVP V1 (Focused)

```
✓ Consent (simple dual sign-off + modality toggles)
✓ GPS, app usage, accelerometer (3 sensors only)
✗ Keystroke (defer to V1.1)
✗ Voice (defer to Phase 2)
✗ GSR/PPG (defer to Phase 2)
✓ Sleep window (rule-based only)
✓ Anomaly detection (variance threshold)
✓ Explainable alerts (3-tier)
✓ Guardian dashboard (read-only)
✓ Audit/security
✗ AI companion (defer to Phase 2)
✗ Crisis detection (defer; basic keyword match only)
```

**Benefits**:
- 3 sensors only (80% signal quality, 20% complexity)
- 0 ML models (heuristic rules)
- Simple permissions (location, usage, motion)
- ~500 MB/day per teen (vs. 4.5 GB)
- 2-3 person-weeks of engineering (vs. 4-6)

---

## Implementation Priority

**Week 1 (Critical Path)**:
1. F1: Consent flow (2 days)
2. F2: GPS + app usage ingestion (2 days)
3. F4: Statistical anomaly detection (1 day)
4. F5: Alert generation (1 day)

**Week 1 (Support)**:
5. F3: Baseline calculation (parallel, 1 day)
6. F6: Guardian dashboard (2 days)
7. F7: Audit & security (1 day)

**Testing & Polish**: Days 5-7

---

## Feature Deferral List (NOT Deleted, Just Deferred)

**Keep in roadmap docs; DON'T implement in MVP V1:**

```
Deferred Features:

V1.1 (1-2 weeks):
  - Keystroke timing
  - Refined anomaly thresholds

Phase 2 (4-8 weeks):
  - Real wearable hardware (ESP32, BLE)
  - Voice check-in with speaker verification
  - Simplified in-app companion (text-only, no 5 personas)
  - Guardian push notifications

Phase 3 (Long-term):
  - Voice emotion recognition
  - Advanced AI companion (5 personas)
  - WhatsApp/Instagram integration
  - Multimodal crisis detection
  - Deep learning anomaly detection

Future:
  - LSTM sleep classifier
  - Clinical outcome correlation
  - School integration
  - HIPAA/FedRAMP certification
```

---

## Communication Strategy

**If stakeholders ask "Where's X feature?":**

| Feature | Response |
|---------|----------|
| "Where's the AI companion?" | "V1 focuses on core alert loop. In-app companion launches Phase 2 with real voice." |
| "What about voice emotion?" | "Voice emotion is complex and requires training data. Phase 3, after we validate core signals." |
| "Why no WhatsApp?" | "WhatsApp adds complexity (API, vendor lock-in). Guardian dashboard works on web/mobile V1. SMS/WhatsApp in Phase 2." |
| "Shouldn't we track GSR/PPG?" | "V1 uses synthetic data to validate the core loop. Real wearables Phase 2 when hardware available." |
| "Why no deep learning?" | "Heuristic rules are deterministic, explainable, and fast. ML adds training overhead. Reconsider if we see need in user data." |

---

## Success Criteria for MVP V1

- ✅ 3 sensors operational (GPS, app, accelerometer)
- ✅ Dual consent working (teen + guardian)
- ✅ Baseline calculated (personal, rule-based)
- ✅ Anomalies detected (statistical, >2 std-dev)
- ✅ Alerts generated (Sage/Amber/Red with factors)
- ✅ Guardian dashboard displays alerts + context
- ✅ Audit log populated
- ✅ TLS + AES-256 encryption
- ✅ Tests passing (>80% coverage)
- ✅ No deferred features in codebase

---

## Sign-Off Required

- [ ] **Product**: Focused scope acceptable
- [ ] **Engineering**: Feasible in 7 days
- [ ] **Privacy**: Core loop compliant (COPPA, GDPR)

---

**Key Message**: 

> **PRISM V1 is a focused, single-loop product:**  
> Collect behavioral signal → Compare to baseline → Explain deviation → Enable guardian check-in
>
> Everything else is Phase 2+. This keeps the team focused, the product simple, and the launch date achievable.

---

## Cross-References

- **Previous (too-large) scope**: [MVP-SCOPE.md](MVP-SCOPE.md) — Mark as "V0 (SUPERSEDED)"
- **Sensors (filtered for V1)**: [SENSORS.md](SENSORS.md) — Use GPS, App, Accelerometer only
- **Privacy (unchanged)**: [PRIVACY-SPEC.md](PRIVACY-SPEC.md)
- **Alerts (V1 version)**: [ALERT-LANGUAGE.md](ALERT-LANGUAGE.md)
- **Consent (V1 version)**: [CONSENT-LIFECYCLE.md](CONSENT-LIFECYCLE.md)

---

**Document Owner**: Product Lead  
**Created**: 2026-07-23 (CRITICAL REVISION)  
**Status**: 🟢 **READY FOR IMPLEMENTATION**
