# PRISM — Product Requirements Document (PRD)

## 1. Product Vision & Overview
PRISM is a consent-first, privacy-respecting behavioral monitoring system designed to support teen well-being without invading their personal space. By capturing **metadata only** (motion, keystroke cadence, and high-level app usage patterns) and strictly ignoring private content (text messages, audio, video, photos, screenshots), PRISM identifies deviations from an individual's baseline behaviors and delivers explainable, non-diagnostic alerts to a guardian dashboard.

---

## 2. Core Constraints (Strict Privacy Model)
1. **Metadata Only:** No raw communication content, audio, video, or screen captures.
2. **Explicit Consent & Open Disclosure:** The teen-facing application is completely transparent. It shows exactly what is being monitored at all times. There is no covert/stealth mode.
3. **No Black-Box ML:** Any alert pushed to the guardian dashboard must be accompanied by human-readable "contributing factors" (e.g., *"Change in late-night keystroke timing (+30%) and reduced morning movement"*), rather than a simple diagnostic status.
4. **Security & Auditability:** End-to-end encryption in transit (TLS 1.3), field-level encryption at rest for sensitive data (GPS coordinates, identifiers), and immutable logging of all database access events.

---

## 3. Product Phases

### Phase 1: Consent, Onboarding & Metadata Ingestion
* **Teen App (Mobile):**
  * Explicit onboarding screens displaying monitored metrics (GPS/Accelerometer, Keystroke Timing, App Categories).
  * Consent workflow with dual sign-off (teen + guardian).
  * Visual dashboard showing the teen exactly what is currently being transmitted.
* **API Service:**
  * Endpoint ingestion for encrypted metadata payloads.
  * Device registration, token exchange, and consent validation.
  * Integration with the immutable audit log for registration and data ingestion events.

### Phase 2: Behavioral Baseline & ML Inference Engine
* **ML Engine:**
  * Establishes a local/server-side baseline profile for each teen (typical sleep window, movement index, average screen-time categories).
  * Evaluates incoming metadata windows for significant deviations (e.g., prolonged immobility, rapid switching of apps late at night, or sudden drops in typing speed/cadence).
  * Output includes a deviation score alongside a structured list of contributing factors (no diagnostic label, only behavioral shifts).
* **API Service Integration:**
  * Async workers processing payload queues.
  * Storing explainable deviation scores and contributing factors.

### Phase 3: Guardian Web Dashboard & Alert Pipeline
* **Guardian Dashboard (Web):**
  * Secure portal requiring JWT authentication and Role-Based Access Control (RBAC).
  * Visualization of baseline trends using geometric/sans tabular figures.
  * Alert inbox showing deviations categorized by level (Amber for "needs attention", Sage for "baseline normal", and Saturated Red for high-severity notifications).
  * Clear breakdown of "contributing factors" for every alert.
* **Notification Pipeline:**
  * Pushing alerts securely to the guardian dashboard/email/SMS based on severity thresholds.
  * Complete audit trail of guardian logins and alert views.
