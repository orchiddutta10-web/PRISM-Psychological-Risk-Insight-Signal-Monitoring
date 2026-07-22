# PRISM MVP Scope — 7-Day Release Freeze

**Version**: 1.0  
**Status**: FROZEN for Phase 1 MVP  
**Effective Date**: 2026-07-23  
**Last Review**: 2026-07-23

---

## Executive Summary

This document locks the **Phase 1 MVP scope** for PRISM's 7-day release. All features listed here are **in-scope** and required for "done." Everything in the "Post-Phase 1 Roadmap" section is **explicitly out-of-scope** for MVP and must not be implemented during this release cycle.

---

## Phase 1 MVP (In-Scope for 7-Day Release)

### F1: Consent & Onboarding
- [x] Teen app displays list of monitored metrics on startup (no hidden collection)
- [x] Dual sign-off flow: teen consent + guardian approval required before data ingestion
- [x] Per-modality consent toggles (location, keystroke, app usage, voice, physio)
- [x] Consent acceptance stored in audit log with timestamp and IP
- [x] Teen-facing dashboard showing "data being transmitted right now" (live)

### F2: Metadata Ingestion (Behavioral)
- [x] **Location** (GPS): Latitude, longitude, accuracy, timestamp — captured every 60 seconds when app is active
- [x] **Keystroke Timing**: Inter-keystroke intervals (not content) — sampled every 5 keystrokes
- [x] **App Usage**: App category, open/close events, duration — every app switch captured
- [x] **Device Accelerometer**: X/Y/Z motion vectors at 10 Hz sampling — used for stillness/movement inference
- [x] **Screen State**: On/off, lock/unlock events — used for sleep window inference

### F3: Metadata Ingestion (Physiological)
- [x] **GSR (Galvanic Skin Response)**: Synthetic signal generator providing mock readings at 4 Hz
- [x] **PPG (Photoplethysmography)**: Synthetic signal generator providing mock heart rate at 1 Hz
- [x] **All physio data discarded after feature extraction** — raw waveforms never stored
- [x] Sensor fallback to simulator if hardware unavailable

### F4: Signal Processing & Baseline Inference
- [x] **Sleep Window Inference**: Rule-based circadian estimator using stillness + screen-off + typing gaps
- [x] **Anomaly Detection**: Rolling-window variance detection for behavioral deviations (statistical thresholds)
- [x] **Contributing Factors Extraction**: Structured list of reasons for each anomaly ("Change in late-night typing", "New app category detected")
- [x] **No ML/DL Models in MVP**: Heuristic rule engines only

### F5: Alert Generation & Grading
- [x] **3-Tier Alert System**: Sage (baseline), Amber (attention), Red (high concern)
- [x] **Guardian Alert Inbox**: Web dashboard displaying alerts with contributing factors
- [x] **Crisis Keyword Classifier**: Hardcoded bypass detecting crisis intents; escalates to trusted adult
- [x] **No Diagnostic Labels**: Alerts never claim "depression", "anxiety", or other clinical terms

### F6: Multi-Persona AI Companion (Teen-Facing)
- [x] **5 Archetypal Personas**: Coach, Listener, Strategist, Clinician, Mentor
- [x] **Persona Selection UI**: Teen picks their companion style on startup
- [x] **In-App Chat**: Teen converses with selected persona within the app
- [x] **Disclosure Banner**: Every message starts with "I'm an AI, not a therapist"
- [x] **Crisis Escalation**: Hardcoded safety checks escalate to parent + crisis hotline
- [x] **No External LLM APIs (MVP)**: All responses generated locally or via controlled prompt injection

### F7: Guardian Web Dashboard
- [x] **Secure Portal**: JWT authentication + RBAC (Guardian, Clinician, Admin roles)
- [x] **Alert Visualization**: Trend cards showing deviations from baseline (not tabular, geometric)
- [x] **Contributing Factors Display**: Every alert includes human-readable reasons
- [x] **Consent Status View**: Guardians see which modalities are enabled/disabled
- [x] **Data Export**: CSV export of alert history (audit-compliant)

### F8: Audit & Security
- [x] **Immutable Event Log**: Every data access (read/write) logged with actor, timestamp, modality
- [x] **Encryption in Transit**: TLS 1.3 for all API endpoints
- [x] **Encryption at Rest**: AES-256 for GPS coordinates, identifiers, voice embeddings
- [x] **Consent Audit Trail**: All consent changes logged with timestamp and actor
- [x] **Data Retention Policy**: Behavioral metadata retained for 90 days; physio features for 30 days

### F9: Test Coverage
- [x] **API Unit Tests**: 80%+ coverage for auth, consent, ingestion routes
- [x] **Integration Tests**: End-to-end consent + data flow
- [x] **UI Tests**: Happy path for onboarding + dashboard alert display
- [x] **Security Tests**: JWT validation, RBAC enforcement, encryption verification

---

## Post-Phase 1 Roadmap (Explicitly Out-of-Scope)

### Excluded from MVP
These items are **NOT in the 7-day release**. Any implementation of these features during MVP will be rejected in code review.

#### Sensing & Hardware
- [ ] Real ESP32 firmware integration (PRISM Node) — stubbed in UI only
- [ ] Bluetooth BLE bridging to wearable — UI placeholder only
- [ ] Real GSR/PPG hardware capture — MVP uses synthetic generators

#### ML & Analytics
- [ ] Deep learning sleep-stage classifier — MVP uses rule-based heuristics
- [ ] LSTM anomaly detection — MVP uses statistical rolling variance
- [ ] Custom emotion/stress models trained on adolescent voices — N/A in MVP
- [ ] Longitudinal correlation dashboards with clinical outcome data

#### Integrations
- [ ] WhatsApp/Instagram Business API — conceptually architected, not live
- [ ] Twilio Voice bidirectional speech-to-text — stubbed in UI
- [ ] Slack/Discord notifications — not implemented
- [ ] Kafka/distributed streaming — centralized ingestion only

#### Advanced Features
- [ ] Multi-modal crisis detection (combining voice + behavioral + chat) — hardcoded classifier only
- [ ] Contextual guardian messaging (SMS alerts, email templates) — dashboard inbox only
- [ ] Longitudinal ML model training on user cohorts — no personalization in MVP
- [ ] 3rd-party threat-intelligence feed integration — static risk registry only

#### Compliance & Scale
- [ ] HIPAA/FedRAMP certifications — N/A for MVP
- [ ] Kubernetes deployment — Docker Compose only
- [ ] Multi-tenant architecture — single-tenant MVP
- [ ] GDPR "right to be forgotten" automation — manual data deletion in Phase 2

---

## Phase 1 Acceptance Criteria

### For "MVP Complete"
1. ✅ All features in "Phase 1 MVP" section implemented and tested
2. ✅ No unimplemented features from other sections are present in codebase
3. ✅ All API routes require JWT + RBAC (no unauthenticated endpoints)
4. ✅ Consent validation enforced for all data ingestion
5. ✅ Alert cards include contributing factors (no black-box outputs)
6. ✅ Companion personas include disclosure banner on every message
7. ✅ Immutable audit log populated for all data-access events
8. ✅ TLS 1.3 configured for all external traffic
9. ✅ Test suite passes 100% (no skipped tests)
10. ✅ No hardcoded secrets in code or config files

### For "MVP Ready to Deploy"
1. ✅ Load test: dashboard handles 100 concurrent guardians
2. ✅ Load test: API handles 1000 events/second from 500 teens
3. ✅ Security audit: no SQL injection, XSS, or CSRF vulnerabilities
4. ✅ Privacy audit: no raw content captured in logs or error traces
5. ✅ Legal review: COPPA compliance checklist signed off

---

## Dependency Graph

```
Consent & Onboarding (F1)
    ↓ (required for)
Metadata Ingestion (F2, F3)
    ↓ (required for)
Signal Processing (F4)
    ↓ (required for)
Alert Generation (F5)
    ├─→ Guardian Dashboard (F7)
    └─→ Companion AI (F6)
        ↓ (both use)
Audit & Security (F8)
```

**Critical Path for MVP**: F1 → F2 → F4 → F5 → F7  
**Blocking Path for F6**: Requires F1 (consent) but independent of F2–F5

---

## Change Control

Any changes to this MVP scope after this date require a documented exception signed by:
1. **Product**: Confirms no impact to launch date
2. **Engineering**: Confirms implementation is feasible within remaining time
3. **Privacy/Legal**: Confirms no privacy or compliance implications

**Process**: Create a GitHub issue tagged `scope-exception` with justification, then link to this doc.

---

## Cross-References

- **Privacy Specification**: [PRIVACY-SPEC.md](PRIVACY-SPEC.md)
- **Sensor Specification**: [SENSORS.md](SENSORS.md)
- **Alert Language**: [ALERT-LANGUAGE.md](ALERT-LANGUAGE.md)
- **Consent Lifecycle**: [CONSENT-LIFECYCLE.md](CONSENT-LIFECYCLE.md)
- **Product Requirements**: [PRD.md](PRD.md)
- **Architecture**: [architecture.md](architecture.md)

---

**Signed Off By**:
- [ ] Product Lead
- [ ] Engineering Lead
- [ ] Privacy Officer
- [ ] Legal Counsel

**Last Reviewed**: 2026-07-23  
**Next Review**: Upon completion of Phase 1 MVP
