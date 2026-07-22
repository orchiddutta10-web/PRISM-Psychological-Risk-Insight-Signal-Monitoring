# PRISM & PRISM Node — Project Scope (7-Day MVP)

## Ethics & Privacy Constraints (Non-Negotiable)
- **Metadata Only**: No raw message content, audio, video, or screen captures are ever captured or stored.
- **Explicit Consent**: Transparent disclosure of what is monitored; no covert/stealth mode.
- **Explainable AI**: No black-box diagnostics. All ML outputs provide human-readable "contributing factors" (e.g., "Change in late-night keystroke timing").
- **Audit & Security**: End-to-end encryption in transit (TLS), encrypted fields at rest, immutable data-access audit logs.
- **Crisis Escalation**: Always active for the companion personas.

---

## Feature Scope Split

### Phase 1: Architecture Consolidation
- **Week-1 MVP**: Unified event schema supporting both behavior (`location`, `typing`, `app_usage`) and physio (`gsr`, `ppg`). Updated ERD with new tables (`PHYSIO_READINGS`, `VOICE_SESSIONS`, `SLEEP_WINDOWS`, `RISK_REGISTRY_HITS`, `COMPANION_SESSIONS`, `CONSENT_GRANTS`).
- **Post-Week-1 Roadmap**: Complex distributed streaming architecture (e.g., Kafka) for massive scale.

### Phase 2: Sensor & Signal Ingestion
- **Week-1 MVP**: Synthetic signal generator for GSR (Galvanic Skin Response) and PPG (Photoplethysmography). App activity extended to capture data bytes (mocked if necessary). Ingestion health-check endpoint.
- **Post-Week-1 Roadmap**: Real ESP32 firmware integration via MQTT for live IoT physical hardware (PRISM Node).

### Phase 3: Sleep Schedule Inference
- **Week-1 MVP**: Rule-based circadian estimator combining stillness, screen-off time, and typing gaps into a probable sleep window. Rolling variance anomaly detection (statistical/deterministic).
- **Post-Week-1 Roadmap**: Deep learning / LSTM sleep-stage classifier trained on labeled polysomnography data.

### Phase 4: Voice Module
- **Week-1 MVP**: Pretrained speaker-embedding model (e.g., `speechbrain` or `resemblyzer`) for speaker verification gate. Pretrained RF/SVM on MFCCs for coarse emotion proxy. Raw audio is discarded immediately after feature extraction.
- **Post-Week-1 Roadmap**: Custom trained emotion/stress detection models optimized for adolescent voices.

### Phase 5: Risky App / Content Registry
- **Week-1 MVP**: Structured `RISK_REGISTRY` table seeded with known static package names and keywords. Deterministic checking against new-app events triggering explainable alerts.
- **Post-Week-1 Roadmap**: Live, maintained 3rd-party threat-intelligence feed integration.

### Phase 6: Multi-Persona AI Companion
- **Week-1 MVP**: 5 generic archetypes (Coach, Listener, Strategist, Clinician, Mentor) with strict prompt-level and UI-level disclosure ("I am an AI, not a doctor"). Hardcoded crisis keyword/intent classifier bypassing the LLM. In-app chat channel.
- **Post-Week-1 Roadmap**: Advanced context-aware crisis detection models.

### Phase 7: Messaging Channel Integrations
- **Week-1 MVP**: In-app chatbot (functional). WhatsApp & Instagram integrations stubbed/architected conceptually but not fully live unless Meta API sandbox is instantly available. Voice call stubbed in UI.
- **Post-Week-1 Roadmap**: Live Meta WhatsApp/Instagram Business API approvals and Twilio Voice bidirectional speech-to-text integration.

### Phase 8: PRISM Node Dashboard
- **Week-1 MVP**: Dedicated UI section in the mobile app for "PRISM Node" showing synthetic live HR/GSR trends and sleep windows.
- **Post-Week-1 Roadmap**: Real Bluetooth BLE bridging to actual wearable hardware.

### Phase 9: Guardian Dashboard & Explainability
- **Week-1 MVP**: Explainable alert cards ("what changed vs baseline"). Role-based views (trend bands for guardians). Independent consent toggles per modality.
- **Post-Week-1 Roadmap**: Longitudinal correlation dashboards with clinical outcome data.
