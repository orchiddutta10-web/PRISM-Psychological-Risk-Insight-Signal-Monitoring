# PRISM MVP Specification Index

**Status**: ✅ FROZEN  
**Effective Date**: 2026-07-23  
**Last Updated**: 2026-07-23

---

## Overview

This index consolidates PRISM's 5 frozen specifications for Phase 1 MVP. All specifications are **normative** (mandatory) and **non-negotiable** unless formally excepted through the change control process.

Each specification is complete, internally consistent, and ready to hand to engineering for implementation.

---

## The Five Frozen Specifications

### 1. **MVP Scope** — [MVP-SCOPE.md](MVP-SCOPE.md)

**What**: Definitive list of in-scope and out-of-scope features for 7-day release.

**Key sections**:
- Phase 1 MVP (9 features)
- Post-Phase 1 Roadmap (explicitly out-of-scope)
- Acceptance criteria for "done"
- Dependency graph
- Change control process

**Use case**: Engineering reference for what to build and what to skip.

---

### 2. **Sensor Specification** — [SENSORS.md](SENSORS.md)

**What**: Complete inventory of all sensors collected, sampling rates, data retention, and permission models.

**Key sections**:
- Sensor matrix (9 sensors total)
- Behavioral sensors (location, keystroke, app, accelerometer, screen)
- Physiological sensors (GSR, PPG, voice)
- Derived sensors (sleep window)
- Sensor exclusion list (25+ sensors NOT captured)
- Data volume estimates
- Permission flow & fallback strategy

**Use case**: Mobile/backend teams implementing sensor collection and ingestion.

---

### 3. **Privacy Specification** — [PRIVACY-SPEC.md](PRIVACY-SPEC.md)

**What**: Encryption model, data retention, user rights, audit logging, and compliance framework.

**Key sections**:
- Metadata-only rule with concrete examples
- Encryption in transit (TLS 1.3) and at rest (AES-256)
- Data retention policy per data type (3 days to 2 years)
- User deletion & export rights (GDPR Article 15, 17)
- Immutable audit logging (every read/write event)
- COPPA, FERPA, GDPR compliance checklist
- Third-party data processor agreements

**Use case**: Backend, security, and legal teams implementing data protection and compliance.

---

### 4. **Alert Language** — [ALERT-LANGUAGE.md](ALERT-LANGUAGE.md)

**What**: How alerts are presented to guardians—three tiers (Sage, Amber, Red), contributing factors format, language guardrails, and crisis escalation flow.

**Key sections**:
- Alert philosophy (explainable, non-diagnostic, non-alarming)
- 3-tier system (Sage/Amber/Red) with templates
- Contributing factors format (quantified, never includes content)
- Prohibited phrases (no diagnoses, no stigma)
- No-alert criteria (one-time events, synthetic data, etc.)
- Crisis escalation flow
- Test cases

**Use case**: Frontend/UX teams building guardian dashboard and alert display; QA for test case generation.

---

### 5. **Consent Lifecycle** — [CONSENT-LIFECYCLE.md](CONSENT-LIFECYCLE.md)

**What**: How consent is obtained, managed, renewed, revoked, and audited—dual consent model with granular per-modality toggles.

**Key sections**:
- Dual consent requirement (teen + guardian both sign)
- Consent flow (4 steps: teen onboarding → disclosure → guardian approval → activation)
- Consent records (database schema, audit trail)
- Per-modality consent (independent toggles for each sensor)
- Renewal (annual, auto-notification)
- Revocation (either party, any time, data deleted in 24h)
- Data withdrawal rights (GDPR Article 17)
- Compliance checklist (COPPA, GDPR, FERPA, state laws)

**Use case**: Frontend/backend teams implementing auth & consent flows; legal for compliance verification.

---

## Cross-Reference Matrix

| Specification | References | Referenced By |
|---------------|-----------|---|
| MVP-SCOPE.md | SENSORS, PRIVACY, ALERT, CONSENT | Architecture, PRD |
| SENSORS.md | MVP-SCOPE, PRIVACY | Mobile app, API ingestion, ML engine |
| PRIVACY-SPEC.md | MVP-SCOPE, SENSORS, CONSENT | Backend security, legal, compliance |
| ALERT-LANGUAGE.md | MVP-SCOPE, PRIVACY, SENSORS | Dashboard UI, test cases |
| CONSENT-LIFECYCLE.md | MVP-SCOPE, PRIVACY, SENSORS | Onboarding UI, backend auth, legal |

---

## How to Use These Specs

### For Engineering

1. **Read MVP-SCOPE first**: Understand what's in/out of Phase 1
2. **Read SENSORS**: Implement sensor collection (mobile) and ingestion (API)
3. **Read PRIVACY-SPEC**: Implement encryption, audit logs, retention policies
4. **Read ALERT-LANGUAGE**: Build alert UI and crisis detection
5. **Read CONSENT-LIFECYCLE**: Implement consent flow and RBAC

### For Product & Design

1. **Read MVP-SCOPE**: Feature prioritization and acceptance criteria
2. **Read ALERT-LANGUAGE**: Alert UI/UX design and copy
3. **Read CONSENT-LIFECYCLE**: Onboarding flow and consent UI
4. **Reference SENSORS & PRIVACY**: Feature validation against constraints

### For Legal & Compliance

1. **Read PRIVACY-SPEC first**: Encryption, retention, audit framework
2. **Read CONSENT-LIFECYCLE**: Dual consent model and user rights
3. **Read SENSORS**: Data collection inventory (for COPPA/GDPR compliance)
4. **Read MVP-SCOPE**: Features affecting compliance (e.g., no third-party integrations)

### For QA & Test

1. **Read MVP-SCOPE**: Acceptance criteria for "done"
2. **Read ALERT-LANGUAGE**: Alert test cases and templates
3. **Read CONSENT-LIFECYCLE**: Consent flow test scenarios
4. **Read PRIVACY-SPEC**: Audit log verification tests
5. **Reference SENSORS**: Data collection edge cases

---

## Consistency Validation

**All 5 specs have been validated for:**

- ✅ **Internal consistency**: No contradictions within each spec
- ✅ **Cross-consistency**: No contradictions between specs
- ✅ **Completeness**: No critical gaps (all features defined)
- ✅ **Feasibility**: All features achievable in 7-day MVP window
- ✅ **Compliance**: Alignment with COPPA, GDPR, FERPA, state laws
- ✅ **Privacy**: No raw content captured; metadata-only rule enforced
- ✅ **Security**: Encryption, audit logging, RBAC implemented

---

## Change Control Process

**To change any frozen spec after 2026-07-23:**

1. Create a GitHub issue tagged `spec-change-request`
2. Include justification addressing:
   - **Impact**: Which spec(s) affected?
   - **Risk**: Does this affect compliance, privacy, security?
   - **Timeline**: Can it be done in MVP window?
3. Require approval from:
   - Product Lead ✅
   - Engineering Lead ✅
   - Privacy Officer ✅
   - Legal Counsel ✅ (if privacy/compliance affected)
4. Link approved GitHub issue to all affected specs

**Example**: If we want to add real GSR hardware (currently MVP uses synthetic):
- Impacts: SENSORS.md (new section), MVP-SCOPE.md (feature move to Phase 2)
- Risk: Low (purely additive, no privacy impact)
- Timeline: Fits in MVP window (estimated 1–2 days for simulator swap-out)
- Approval: Product + Eng sign off; legal review not required

---

## Spec Maintenance Schedule

| Task | Frequency | Owner |
|------|-----------|-------|
| Review for consistency | Before each release | Product + Eng Lead |
| Update for new features | Per Phase (Phase 2 planning, etc.) | Product Lead |
| Audit trail review | Quarterly | Privacy Officer |
| Compliance check | Annually or upon law change | Legal Counsel |
| Version bump | Major changes only | Technical Writer |

---

## Appendix: Document Metadata

| Spec | Version | Pages | Last Reviewed | Status |
|------|---------|-------|---|---|
| MVP-SCOPE.md | 1.0 | 12 | 2026-07-23 | FROZEN ✅ |
| SENSORS.md | 1.0 | 18 | 2026-07-23 | FROZEN ✅ |
| PRIVACY-SPEC.md | 1.0 | 16 | 2026-07-23 | FROZEN ✅ |
| ALERT-LANGUAGE.md | 1.0 | 19 | 2026-07-23 | FROZEN ✅ |
| CONSENT-LIFECYCLE.md | 1.0 | 22 | 2026-07-23 | FROZEN ✅ |

**Total specification coverage**: ~87 pages of normative requirements.

---

## 🔴 CRITICAL REVISION: Phase-Based Scope

**Status Change**: Previous MVP-SCOPE.md was too large. Now refocused on **core loop only**.

### New Documents (2026-07-23)
1. **[MVP-V1-CORE.md](MVP-V1-CORE.md)** — Focused MVP V1 (3 sensors, rule-based, 7 days)
2. **[PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md)** — Multi-phase delivery plan (Phase 1-4+)

### Previous Document (Now Superseded)
- **[MVP-SCOPE.md](MVP-SCOPE.md)** — ⚠️ SUPERSEDED by MVP-V1-CORE.md (kept for reference)

### What Changed
- ✅ MVP V1: 3 sensors (GPS, app, accelerometer) → 7 days
- ✅ Keystroke → Deferred to Phase 2
- ✅ Voice → Deferred to Phase 2
- ✅ GSR/PPG real → Deferred to Phase 2
- ✅ AI companion → Deferred to Phase 3
- ✅ Wearables → Deferred to Phase 2
- ✅ Advanced ML/DL → Deferred to Phase 3+

### Why
- Too many features = missed deadlines
- Core loop (baseline → anomaly → alert) is the priority
- Everything else builds on that foundation

---

## Quick Links

- 📋 [Product Requirements Document (PRD)](PRD.md)
- 🏗️ [System Architecture](architecture.md)
- 🎨 [Design System](design-system.md)
- 📚 [Runbooks](runbooks/)
- ⚖️ [Ethics Statement](ETHICS.md)
- 🔗 [All ADRs](adr-0001-production-deploy.md)

---

## Sign-Off

**By reading this index and the linked specifications, you confirm:**

1. ✅ I understand the PRISM MVP scope and its constraints
2. ✅ I understand the metadata-only data collection model
3. ✅ I understand the privacy, encryption, and audit logging requirements
4. ✅ I understand the dual consent model
5. ✅ I understand the alert language and crisis escalation flow
6. ✅ I will not implement features listed in "Post-Phase 1 Roadmap" during MVP
7. ✅ I will follow the change control process for any requested modifications

---

**Document Owner**: Product Lead  
**Last Updated**: 2026-07-23  
**Next Review**: 2026-08-06 (post-Phase-1-MVP)

---

## Quick Reference: Frozen Constraints

**Non-Negotiable for MVP**:
- ✅ Metadata only (no content)
- ✅ Dual consent (teen + guardian)
- ✅ Granular per-modality consent
- ✅ TLS 1.3 in transit, AES-256 at rest
- ✅ Immutable audit logs
- ✅ Explainable alerts (no black-box)
- ✅ Non-diagnostic language
- ✅ Crisis escalation to hotline
- ✅ 90-day data retention (behavioral), 24h (physio)
- ✅ User rights: access, export, deletion

**Explicitly Out-of-Scope for MVP**:
- ❌ Real hardware (ESP32, BLE wearable) — synthetic only
- ❌ Deep learning models — heuristic rules only
- ❌ Third-party integrations (WhatsApp, Instagram, Twilio)
- ❌ Multi-tenant or Kubernetes — single-tenant, Docker Compose
- ❌ Advanced ML (LSTM, clustering, etc.)
- ❌ External LLM APIs — local prompt injection only

