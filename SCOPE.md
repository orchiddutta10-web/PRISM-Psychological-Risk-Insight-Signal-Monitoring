# PRISM & PRISM Node — Project Scope & Repository Audit (7-Day MVP)

This document establishes the boundaries of the Week 1 MVP demo, audits the functional versus stubbed states of the repository, and splits features by current capabilities (rule-based/classical ML) versus future data requirements.

---

## 🛑 NON-NEGOTIABLE PRINCIPLES & CONSTRAINTS

1. **Metadata-Only Ingestion:**
   * No message body texts, raw audio, screenshots, screen records, or video streams are ever stored or processed in persistent storage. 
   * Keystroke analytics record timing intervals (delays, keypress latency) only. Voice check-ins process ephemeral spectral features (MFCCs) in-memory and discard raw audio bytes immediately after classification.

2. **No Diagnostic Labeling (Explainability Paradigm):**
   * The dashboard reports *behavioral deviations* relative to established baselines.
   * **Allowed:** *"Late-night screen usage increased by 40% compared to 14-day baseline."*
   * **Banned:** *"Your child has Insomnia"*, *"depression"*, or *"clinical anxiety."*

3. **Explicit Consent & Monitored Disclosure:**
   * Stealth/covert monitoring is prohibited. The teen application must clearly disclose what data streams are active.

4. **Hard-Coded Crisis Classifier Gating:**
   * All conversation streams (in-app, WhatsApp, Instagram) pass through an un-bypassable keyword/regex crisis filter *before* LLM routing. The model will never roleplay through a mental health crisis.

---

## 🔍 REPOSITORY AUDIT: FUNCTIONAL VS. STUBBED

### 1. Services & API (`services/api/app`)
* **Auth Service (`routes/auth.py`)**:
  * **Functional**: Guardian registration, login, JWT token issuance, and device registration keys.
* **Consent Management (`routes/consent.py`)**:
  * **Functional**: Recording and updating `ConsentRecord` (legacy) and `ConsentGrant` (granular modality-level settings).
* **Sensor Ingestion (`routes/telemetry.py`)**:
  * **Functional**: Ingestion of GPS location, app usage, keystroke timing, and physiological vitals (PPG, GSR). Establishes and saves baseline profiles.
* **Risk Engine / ML Inference (`utils/ml_engine.py` & `utils/circadian_estimator.py`)**:
  * **Functional**: Anomaly detection logic using **K-Means** (mobility centroids), **Logistic Regression** (typing cadence delays), and **Isolation Forest** (app usage outliers). Circadian sleep scheduler estimating sleep gaps.
* **Voice Affect / Biometrics (`routes/voice.py` & `utils/voice_processor.py`)**:
  * **Functional (Pretrained Checkpoints / Stubs)**: Ephemeral feature processing. Verifies speaker embedding similarity against registered templates (stubbed cosine match). Classifies affect category (calm, stressed, anxious, sad).
* **Multi-Persona Companion (`routes/companion.py` & `utils/companion_engine.py`)**:
  * **Functional**: pre-inference crisis verification check, routing to CBT, listener, clinician, strategist, or mentor archetypes. Mocked LLM responses to ensure zero latency during demo presentations.
* **Messaging Channel Webhooks (`routes/companion.py`)**:
  * **Functional**: Meta webhook endpoint verifying hub challenges (`GET`) and ingesting messages (`POST`) from WhatsApp and Instagram.
  * **Stubbed**: Outbound responses back to WhatsApp (requires active Meta Graph keys and business manager setup).
* **Audit Logging (`routes/audit.py` & `utils/audit.py`)**:
  * **Functional**: Encryption of sensitive fields at rest, saving audit details to `audit_log_entries`.

### 2. Next.js Guardian Dashboard (`apps/dashboard`)
* **Functional**:
  * Home dashboard displaying child overview cards.
  * Detailed device status view showing dynamic reorderable cards.
  * **Role-Based Obfuscation (RBAC)**: Custom trend band view restricting charts for standard `guardian` roles (hides exact raw step numbers, delays, usage counts). Displays high-resolution graphs only for `clinician` or `self` roles.
  * **Explainability Alert Cards**: Renders detail modals containing explicit *What Changed*, *Vs. Baseline*, and *Suggested Supportive Strategy* sections without diagnostic text.
  * **Consent Ledger Toggles**: Live toggling of modality consents (voice, gsr, gps, app, companion) hitting database endpoints.

### 3. Mobile Teen-Facing App (`apps/mobile`)
* **Functional**:
  * Step-by-step consent onboarding screens.
  * Visual PRISM Node vitals dashboard presenting rolling GSR/PPG sparklines, battery status, and sleep windows.
  * Disclosed Companion chat screens with clear safety warnings and persona selections.

---

## 📋 FEATURE SCOPE & ROADMAP SPLIT

| Feature Modality | Buildable Now (MVP Heuristics/Classical ML) | Future Phase (Genuinely Needs Real Data) / Post-Week-1 Roadmap |
| :--- | :--- | :--- |
| **Mobility & Movement** | K-Means clustering on geographic entropy / step baseline deviations (synthetic/bootstrapped data). | Deep trajectory clustering using real GPS sequence histories. |
| **Typing Cadence** | Logistic Regression on timing intervals (press delay, fly time) relative to baselines. | LSTM keystroke biometric models capturing individual finger cadence patterns. |
| **App Anomalies** | Isolation Forest marking outlier package configurations and usage timings. | Transformer-based app sequence models predicting next-app transitions. |
| **Sleep Scheduling** | Rule-based circadian estimator detecting 3-hour inactivity gaps. | Polysomnography-trained LSTM sequence network predicting deep/REM sleep cycles. |
| **Voice Affect** | Ephemeral feature classification (SVM/Random Forest on RAVDESS dataset). | Real-time sentiment fusion on acoustic features of conversational audio. |
| **Biometric Speaker ID** | Cosine similarity comparison on pretrained speech embeddings. | Custom voiceprint enrollment models optimized for adolescent voice pitch changes. |
| **IoT Physio Ingestion** | Synthetic GSR/PPG ESP32 Edge stream generator. | Multi-sensor Bluetooth BLE bridging to actual wearable hardware (PRISM Node). |
| **AI Companion** | Pre-inference crisis filter + LLM system persona directives. | Fine-tuned specialized safety-support conversational LLMs. |
| **External Messaging** | Webhook request routing, Meta developer sandbox. | Meta Business verified live production endpoints, SMS/Twilio integration. |
