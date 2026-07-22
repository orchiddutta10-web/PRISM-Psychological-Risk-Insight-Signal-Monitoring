# PRISM Product Roadmap — Multi-Phase Delivery

**Status**: 📋 PLANNING  
**Last Updated**: 2026-07-23

---

## Overview

PRISM will ship as a **multi-phase product**, with each phase building on the previous one. This roadmap clarifies what's now vs. later, preventing scope creep and ensuring focused execution.

**Philosophy**: 
- **Phase 1 (MVP V1)**: Core loop only (behavioral signals → anomaly detection → guardian alert)
- **Phase 2**: Enhanced sensing (voice, real wearables) + guardian messaging
- **Phase 3**: AI companion + advanced ML
- **Phase 4+**: Integrations + clinical features

---

## Timeline Overview

```
Phase 1: MVP V1 (Core Loop)     2026-07-23 → 2026-07-30  (7 days)
Phase 2: Enhanced Sensing        2026-08-06 → 2026-09-03  (4 weeks)
Phase 3: AI Companion            2026-09-10 → 2026-10-08  (4 weeks)
Phase 4+: Integrations/Clinical  2026-10-15 → TBD         (future)
```

---

## Phase 1: MVP V1 — Core Loop (7 Days)

### Focus
**Personal behavioral baseline → Anomaly detection → Guardian alert**

### What Ships
✅ **Sensors** (3):
- GPS location (60 sec sampling)
- App usage (category only, event-driven)
- Accelerometer (10 Hz, stillness scoring)

✅ **Features**:
- Consent (dual: teen + guardian)
- Baseline calculation (rule-based sleep + activity)
- Anomaly detection (statistical variance)
- Alerts (3-tier: Sage/Amber/Red)
- Guardian dashboard (read-only alerts)
- Audit & security (TLS 1.3, AES-256, logs)

✅ **Tech Stack**:
- Backend: FastAPI (Python)
- Frontend: Next.js (guardian dashboard only)
- Mobile: React Native (teen app with consent + live data view)
- Database: PostgreSQL + Redis
- Deployment: Docker Compose (local dev only)

### Metrics
- **Engineering**: 2-3 person-weeks
- **Sensors**: 3 (behavioral only)
- **Storage per teen**: ~500 MB/day (vs. 4.5 GB if all features)
- **Latency**: <5 sec alert generation
- **Availability**: >95% (no SLA yet)

### Launch Checklist
- [ ] All F1-F7 features complete
- [ ] >80% test coverage
- [ ] No deferred features in codebase
- [ ] TLS 1.3 configured
- [ ] Immutable audit log working
- [ ] Dual consent flow tested
- [ ] Guardian dashboard responsive

---

## Phase 2: Enhanced Sensing (4 Weeks)

**Timeline**: 2026-08-06 → 2026-09-03

### Focus
**Real wearables + voice + guardian messaging**

### What Ships
✅ **New Sensors**:
- Keystroke timing (optional; opt-in from app)
- Voice sessions (speaker verification only; audio discarded immediately)
- GSR/PPG from real wearable (ESP32 via MQTT or BLE)

✅ **New Features**:
- Wearable pairing (BLE for phone ↔ hardware)
- Voice check-in (teen initiates, speaker ID verified, emotion NOT detected)
- Guardian push notifications (optional; per-alert-tier)
- Real-time wearable dashboard (teen-facing: see live HR/GSR)

✅ **Companion Prep** (MVP):
- Text-only in-app chat (single persona: "Coach" only)
- Crisis keyword classifier (hardcoded, no LLM)
- Basic crisis escalation (parent notification + 988 Lifeline)

### What's Still Deferred
❌ 5-persona AI companion system
❌ Voice emotion recognition
❌ Advanced crisis detection
❌ Multimodal anomaly detection

### Metrics
- **Engineering**: 4 person-weeks
- **New sensors**: 3 (keystroke, voice embedding, GSR/PPG)
- **Storage per teen**: ~1.5-2 GB/day (wearables are high-volume)
- **Latency**: <2 sec for wearable data
- **Availability**: >99%

### Engineering Priorities
1. ESP32 firmware (MQTT telemetry)
2. BLE bridging (phone ↔ wearable)
3. Keystroke ingestion (from mobile keyboard)
4. Voice session ingestion (speaker embeddings only)
5. Real-time wearable view (teen app)
6. Push notification infrastructure

---

## Phase 3: AI Companion (4 Weeks)

**Timeline**: 2026-09-10 → 2026-10-08

### Focus
**In-app mental health companion (5 personas) + advanced crisis detection**

### What Ships
✅ **5 Personas**:
1. **The Coach** (CBT-style, action-oriented)
2. **The Listener** (Reflective, person-centered)
3. **The Strategist** (Solution-focused, goal-oriented)
4. **The Clinician** (Measured, structured intake style)
5. **The Mentor** (Motivational interviewing, challenging gently)

✅ **Companion Features**:
- Teen selects persona on first launch
- In-app text chat (teen-facing, encrypted)
- Disclosure banner ("I'm an AI, not a therapist")
- Crisis keyword detection (hardcoded classifier)
- Crisis escalation to parent + 988 Lifeline
- Session history (local on device, not cloud-stored)
- Integration with behavioral alerts (companion can reference detected patterns)

✅ **Advanced Crisis Detection**:
- Multi-signal crisis detection (chat keywords + behavioral anomalies + keystroke stress)
- Immediate escalation to trusted adult
- Integration with parent notifications
- Compliance with crisis hotline protocols

### What's Still Deferred
❌ External LLM APIs (OpenAI, Claude, etc.)
❌ Clinical outcome tracking
❌ Multi-teen family features
❌ WhatsApp/Instagram integration
❌ Voice emotion recognition

### Metrics
- **Engineering**: 4 person-weeks
- **New LLM usage**: Local prompt injection only (no external APIs)
- **Crisis detection accuracy**: 95%+ (precision-focused)
- **Latency**: <1 sec companion response
- **Sessions per teen**: ~3-5/week

### Engineering Priorities
1. Persona system architecture
2. Local LLM/prompt injection setup
3. Crisis keyword classifier (expanded from Phase 2)
4. Teen session encryption
5. Guardian crisis notifications
6. Multi-persona UI selector

---

## Phase 4+: Integrations & Clinical (Future)

**Timeline**: 2026-10-15 → TBD

### Potential Features (Not Committed)
- ⚠️ WhatsApp/Instagram guardian notifications
- ⚠️ School integration (FERPA-compliant)
- ⚠️ Clinician dashboard (clinician role + RBAC)
- ⚠️ Longitudinal clinical outcome tracking
- ⚠️ Advanced ML models (LSTM anomaly, clustering)
- ⚠️ Multi-teen family features
- ⚠️ HIPAA/FedRAMP certification
- ⚠️ Telehealth integration (referral links)

### Guiding Principle
- No feature ships in Phase 4+ until Phase 1 metrics show product-market fit
- Each phase must validate one core hypothesis before adding complexity

---

## Feature Deferral Matrix

| Feature | Reason Deferred | Target Phase | Status |
|---------|---|---|---|
| Keystroke timing | Nice-to-have; optional signal | Phase 2 | Planned |
| Voice check-in | Requires wearable infrastructure | Phase 2 | Planned |
| GSR/PPG real hardware | Requires wearable + firmware | Phase 2 | Planned |
| In-app companion | Complex; not on critical path | Phase 3 | Planned |
| 5-persona system | AI/prompt complexity; Phase 3 task | Phase 3 | Planned |
| Voice emotion | Requires training data + models | Future | Research |
| WhatsApp integration | Vendor lock-in; non-core | Phase 4+ | Backlog |
| Instagram integration | Non-core; low priority | Phase 4+ | Backlog |
| Deep learning models | Heuristics sufficient for MVP | Phase 3+ | Backlog |
| LSTM sleep classifier | Overkill for MVP; rule-based works | Phase 3+ | Backlog |
| Multimodal fusion | Only after individual signals proven | Phase 4+ | Backlog |
| HIPAA/FedRAMP | Compliance overkill for MVP | Phase 4+ | Future |

---

## Sensor Rollout

### Phase 1
```
✓ GPS          (Behavioral: location)
✓ App Usage    (Behavioral: category)
✓ Accelerometer (Behavioral: motion/stillness)
```

### Phase 2
```
+ Keystroke    (Behavioral: typing speed/cadence)
+ Voice        (Physiological: speaker ID only; emotion NOT detected)
+ GSR/PPG      (Physiological: real hardware from wearable)
```

### Phase 3+
```
+ Gait analysis        (Future: accelerometer advanced)
+ Voice emotion        (Future: speech emotion models)
+ Multimodal signals   (Future: combined ML)
```

---

## Tech Stack Evolution

### Phase 1 (MVP V1)
```
Backend:  FastAPI + PostgreSQL + Redis
Frontend: Next.js (Guardian Dashboard)
Mobile:   React Native (Teen App)
DevOps:   Docker Compose (local dev)
ML:       Heuristic rules only (no TensorFlow/PyTorch)
```

### Phase 2
```
+ Wearable:  ESP32 firmware (Arduino C++)
+ Protocol:  MQTT for IoT telemetry
+ Mobile:    BLE bridging (React Native)
+ Storage:   TimescaleDB for high-volume wearable data
```

### Phase 3+
```
+ LLM:       Local prompt injection (no external APIs for MVP)
+ ML:        TensorFlow/PyTorch if needed (NOT in Phase 3)
+ Scaling:   Kafka for distributed telemetry (NOT in Phase 3)
```

---

## Staffing by Phase

| Role | Phase 1 | Phase 2 | Phase 3 | Phase 4+ |
|------|---------|---------|---------|----------|
| Backend Lead | 1 FTE | 1 FTE | 0.5 FTE | As-needed |
| Mobile Lead | 1 FTE | 1 FTE | 0.5 FTE | As-needed |
| Frontend Lead | 0.5 FTE | 0.5 FTE | 1 FTE | As-needed |
| ML Engineer | — | — | 0.5 FTE (advisor) | 1 FTE |
| Hardware/IoT | — | 1 FTE | 0.5 FTE | As-needed |
| PM/Product | 1 FTE | 1 FTE | 1 FTE | 1 FTE |
| **Total** | **3.5 FTE** | **4.5 FTE** | **4 FTE** | **Variable** |

---

## Success Metrics by Phase

### Phase 1 Success
- ✅ Launch on time (2026-07-30)
- ✅ Core loop functional (alert generated within 5 sec of anomaly)
- ✅ Dual consent working (100% teen + guardian approval required)
- ✅ Zero production security incidents
- ✅ >80% test coverage
- ✅ TLS 1.3 enforced
- ✅ Immutable audit log working

### Phase 2 Success
- ✅ Wearable integration tested with real hardware
- ✅ Voice check-in working (speaker ID verified)
- ✅ GSR/PPG real-time data flowing
- ✅ Push notifications <2 sec latency
- ✅ Teen retention >80% (using wearable feature)

### Phase 3 Success
- ✅ All 5 personas deployed and tested
- ✅ Crisis detection accuracy >95%
- ✅ Guardian engagement >60% (checking in after alerts)
- ✅ Teen survey feedback >4/5 on companion usefulness
- ✅ Zero false-positive crisis alerts

### Phase 4+ Success
- TBD (depends on Phase 3 outcome)

---

## Stakeholder Communication

### Product Manager to Executive Sponsors
> "PRISM V1 (MVP) focuses on the core loop: behavioral signal collection → baseline comparison → explainable alerts. This keeps scope tight and launch date achievable. Phase 2 adds wearables and voice. Phase 3 adds the AI companion. Integrations are Phase 4+."

### Engineering to Developers
> "Phase 1 is 7 days, 3 sensors, rule-based heuristics. Phase 2 adds wearable infrastructure. Phase 3 brings in AI companions. This staged approach lets us validate each layer before adding complexity."

### Privacy/Legal to Compliance
> "Phase 1 is COPPA-compliant (verifiable parental consent, no ads, no third-party sharing). Each phase undergoes privacy review. We will not integrate third-party APIs (WhatsApp, Instagram) until Phase 4+, if at all."

---

## Decision Gates

**Before Phase 2 Launch**:
- [ ] Phase 1 metrics show product works (alert accuracy >90%)
- [ ] Teen retention >70%
- [ ] Zero security incidents
- [ ] Regulatory approval (if needed)

**Before Phase 3 Launch**:
- [ ] Phase 2 validates wearable utility
- [ ] Guardian engagement >50%
- [ ] Crisis detection tested with real scenarios
- [ ] LLM approach approved by legal/privacy

**Before Phase 4 Launch**:
- [ ] Phase 3 shows strong user engagement (>60%)
- [ ] Scalability validated (1000+ teens)
- [ ] Clinical advisors sign off on new features

---

## Cross-References

- **Core product spec**: [MVP-V1-CORE.md](MVP-V1-CORE.md)
- **Original (superseded) scope**: [MVP-SCOPE.md](MVP-SCOPE.md) — Now marked as "V0"
- **Sensor details**: [SENSORS.md](SENSORS.md)
- **Privacy policy**: [PRIVACY-SPEC.md](PRIVACY-SPEC.md)
- **Consent model**: [CONSENT-LIFECYCLE.md](CONSENT-LIFECYCLE.md)

---

**Owner**: Product Lead  
**Last Updated**: 2026-07-23  
**Review Frequency**: Monthly (or upon phase completion)
