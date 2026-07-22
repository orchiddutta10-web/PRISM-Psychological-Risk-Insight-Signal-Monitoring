# PRISM Privacy Specification

**Version**: 1.0  
**Status**: FROZEN for Phase 1 MVP  
**Effective Date**: 2026-07-23  
**Compliance**: COPPA (Children's Online Privacy Protection Act), FERPA (Family Educational Rights and Privacy Act), GDPR Principles

---

## Executive Summary

This document defines PRISM's privacy model: what data is collected, how it is protected, how long it is retained, and what rights users have. The core principle is **metadata only**: PRISM captures behavioral and physiological patterns, never raw content.

---

## Privacy Model: The Metadata-Only Rule

### What IS Captured

**Metadata**: Aggregated, derived, or statistical information that does NOT reveal content.

✅ **Allowed**:
- "User typed 150 keys at 60 WPM" → keystroke timing, no words
- "User was immobile for 8 hours (23:00–07:00)" → sleep window, no activity details
- "User spent 2 hours in Social media category" → app category, not which app
- "User switched apps 45 times today" → count, not app names
- "Location cluster is Home, 5 days/week" → inferred place, not coordinates
- "Heart rate variability decreased 15%" → HRV metric, not actual HR
- "Speaker embedding matches session 1 (0.95 confidence)" → speaker verification, no content

### What is NOT Captured

❌ **Prohibited**:
- Text messages, emails, chat content, push notifications
- Audio content, voice transcripts, conversations
- Video, photos, screenshots, screen recordings
- Browser history, URLs visited (only app category if browser is used)
- Call logs, SMS contents
- Contact lists, calendar event contents
- Installed app inventory beyond running apps
- Any document content, filenames, or metadata inside files

---

## Encryption Model

### Encryption in Transit (TLS 1.3)

**Requirement**: All data sent from teen's device to PRISM API must use TLS 1.3 or higher.

```
Teen Device (app) ──[TLS 1.3]──> PRISM API ──[TLS 1.3]──> Database
```

**Certificate Pinning**: API clients pin the server certificate to prevent MITM attacks.

**Validation**:
- [ ] All HTTP endpoints redirect to HTTPS
- [ ] TLS 1.2 connections rejected (force TLS 1.3 only)
- [ ] Certificate validity checked on every connection
- [ ] Handshake timeout after 30 seconds (prevent hanging connections)

---

### Encryption at Rest (AES-256)

**Requirement**: Sensitive fields at rest are encrypted using AES-256 in GCM mode.

**Which Fields are Encrypted:**

| Field | Table | Algorithm | Key Rotation |
|-------|-------|-----------|---|
| latitude | GPS_READINGS | AES-256-GCM | Annual |
| longitude | GPS_READINGS | AES-256-GCM | Annual |
| user_id (foreign key) | * | AES-256-GCM | Annual |
| guardian_email | USERS | AES-256-GCM | Annual |
| teen_phone_number | USERS | AES-256-GCM | Annual |
| voice_embedding | VOICE_SESSIONS | AES-256-GCM | Annual |
| consent_grant (blob) | CONSENT_GRANTS | AES-256-GCM | Annual |

**Which Fields are NOT Encrypted:**

| Field | Reason |
|-------|--------|
| timestamp | Not sensitive; needed for indexing |
| app_category | Derived metadata; not personally identifying |
| typing_speed_wpm | Aggregate; not content |
| sleep_window | Derived; not raw sensor data |
| alert_tier | Non-sensitive; needed for querying |

**Key Management**:
- Keys stored in AWS Secrets Manager (or equivalent)
- Automatic key rotation every 12 months
- Old keys retained for 30 days (decryption of historical data)
- Key access requires MFA (no unattended access)

**Encryption Implementation**:
```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

key = os.environ.get("ENCRYPTION_KEY")  # AES-256 = 32 bytes
cipher = AESGCM(key)
nonce = os.urandom(12)
ciphertext = cipher.encrypt(nonce, plaintext, associated_data=user_id)
# Store: user_id | nonce | ciphertext
```

---

## Data Retention Policy

**Rule**: Delete data automatically when retention window expires. Deletion is **not reversible**.

### Behavioral Data

| Data Type | Retention | Trigger | Notes |
|-----------|-----------|---------|-------|
| GPS readings | 90 days | Oldest entry > 90 days | Hourly cleanup job |
| Keystroke intervals | 90 days | Oldest entry > 90 days | Hourly cleanup job |
| App usage events | 90 days | Oldest entry > 90 days | Hourly cleanup job |
| Accelerometer | 3 days | Oldest reading > 3 days | Highest volume; aggressive deletion |
| Screen events | 90 days | Oldest event > 90 days | Hourly cleanup job |
| Sleep windows (derived) | 90 days | Oldest entry > 90 days | Hourly cleanup job |

### Physiological Data

| Data Type | Retention | Trigger | Notes |
|-----------|-----------|---------|-------|
| GSR/PPG raw | 24 hours | Oldest reading > 24 hours | Features extracted; raw discarded |
| HRV/GSR features | 24 hours | Oldest reading > 24 hours | Hourly cleanup job |
| Voice embedding | 7 days | Oldest embedding > 7 days | Hourly cleanup job |
| Voice audio | 0 seconds | After embedding extracted | Deleted immediately; never stored |

### Administrative Data

| Data Type | Retention | Trigger | Notes |
|-----------|-----------|---------|-------|
| Consent grants | Indefinite | User opts-out or reaches 18 | Needed for legal defense |
| Audit logs | 2 years | Oldest event > 2 years | Compliance requirement |
| Alert history | 90 days | Oldest alert > 90 days | Guardian can export before deletion |
| Session logs | 30 days | Oldest log > 30 days | Debugging purposes |

### Data Deletion Trigger Examples

```python
# Every hour, the cleanup worker runs:
DELETE FROM gps_readings 
WHERE created_at < NOW() - INTERVAL '90 days'
AND user_id NOT IN (
    SELECT user_id FROM consent_grants 
    WHERE status = 'active'
);

DELETE FROM accelerometer_readings 
WHERE created_at < NOW() - INTERVAL '3 days';

DELETE FROM voice_sessions 
WHERE created_at < NOW() - INTERVAL '7 days' 
AND audio_blob IS NOT NULL;
```

**Verification**: Monthly report showing rows deleted per table.

---

## User Deletion Rights

### Right to Deletion (GDPR Article 17)

**Teen or Guardian can request deletion of all data:**
1. Go to Settings → Privacy → Delete Account
2. Confirm deletion twice (prevents accidents)
3. Download export (optional) before deletion
4. **Automatic process**:
   - All data deleted within 24 hours
   - Deletion confirmed via email
   - Cannot be undone

**What is deleted:**
- ✅ All GPS readings
- ✅ All keystroke intervals
- ✅ All app usage events
- ✅ All accelerometer readings
- ✅ All voice embeddings
- ✅ All derived metrics
- ✅ All alert history

**What is retained for legal compliance:**
- ❌ Audit logs (2 years retention, encrypted)
- ❌ Consent grants (proof of consent)
- ❌ Anonymized analytics (no PII)

---

## Data Export Rights (GDPR Article 15)

**Teen or Guardian can download all personal data:**
1. Go to Settings → Privacy → Export Data
2. PRISM generates ZIP with CSV files
3. Downloaded within 1 minute (or queued for large exports)

**Export includes:**
- Consent history (dates, changes)
- Alert history (all alerts, contributing factors)
- Aggregated usage patterns (% time in categories, sleep windows)
- Encrypted GPS/keystroke data (for verification)

**Export excludes:**
- Audit logs (not shown to users)
- Other teen's data
- Companion conversation history (regenerated on device; not stored server-side)

---

## Audit Logging (Immutable)

**Requirement**: Every data access (read or write) is logged to an immutable append-only table.

### Audit Log Schema

```sql
CREATE TABLE audit_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    event_id UUID UNIQUE,
    timestamp DATETIME NOT NULL,
    actor_id UUID NOT NULL,  -- User who accessed data
    actor_role ENUM('TEEN', 'GUARDIAN', 'ADMIN', 'SYSTEM') NOT NULL,
    action ENUM('READ', 'WRITE', 'DELETE', 'EXPORT') NOT NULL,
    resource_type ENUM('GPS', 'KEYSTROKE', 'APP_USAGE', 'VOICE', etc.) NOT NULL,
    resource_id UUID,  -- Specific sensor reading ID (if applicable)
    record_count INT DEFAULT 1,  -- # of records accessed
    user_agent TEXT,  -- Client info
    ip_address INET NOT NULL,  -- Source IP
    status ENUM('SUCCESS', 'DENIED', 'FAILED') NOT NULL,
    reason_denied TEXT,  -- If DENIED: why (e.g., "No consent for GPS")
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX(actor_id, timestamp),
    INDEX(resource_type, timestamp)
);
```

### Audit Log Examples

```sql
-- Teen viewing their own data on app
INSERT INTO audit_logs (...)
VALUES (UUID(), NOW(), <teen_id>, 'TEEN', 'READ', 'APP_USAGE', NULL, 1, 'Mozilla/5.0...', '192.168.1.1', 'SUCCESS', NULL);

-- Guardian accessing alerts on dashboard
INSERT INTO audit_logs (...)
VALUES (UUID(), NOW(), <guardian_id>, 'GUARDIAN', 'READ', 'ALERT', <alert_id>, 1, 'Chrome/120...', '203.0.113.50', 'SUCCESS', NULL);

-- System writing new sensor reading
INSERT INTO audit_logs (...)
VALUES (UUID(), NOW(), 'system-ingester', 'SYSTEM', 'WRITE', 'GPS', NULL, 50, 'prism-mobile-app/2.0', '10.0.2.2', 'SUCCESS', NULL);

-- Denied: Admin tried to access teen data without permission
INSERT INTO audit_logs (...)
VALUES (UUID(), NOW(), <admin_id>, 'ADMIN', 'READ', 'GPS', NULL, 0, 'Admin Console', '203.0.113.100', 'DENIED', 'Admin not assigned to this teen');
```

### Audit Log Access Control

- **Auditors only** can view audit logs (separate role)
- Audit logs cannot be modified or deleted (immutable table)
- Audit logs are encrypted at rest (AES-256)
- Audit logs are never exported to users (only shown to compliance team)

---

## Anonymization & De-identification

**For Analytics & Compliance**:
- Remove direct identifiers (name, email, phone, user_id)
- Aggregate data (hour-level summaries, not per-event)
- Add noise to sensitive values (GPS coordinates ±50m random offset)
- Disable reverse-identification (no PII linkage possible)

**Example**:
```python
# Original: (user_id=123, lat=40.7128, lon=-74.0060, time=2026-07-23T14:30:00Z)
# Anonymized: (cohort_id=hash(user_id), lat=40.71±0.05, lon=-74.01±0.05, hour=2026-07-23T14:00:00Z)
```

---

## Compliance Checklist

### COPPA (Children's Online Privacy Protection Act)
- ✅ No collection without verifiable parental consent
- ✅ No third-party cookies or tracking
- ✅ No sale of children's data to advertisers
- ✅ Parent can review and delete child's data
- ✅ Security measures in place (encryption, audit logs)
- ✅ Privacy notice provided (clear, concise, accurate)

### FERPA (Family Educational Rights and Privacy Act)
- ✅ If integrating with schools: parent has access to school-related data
- ✅ Data stored separately from education records (no FERPA violation)
- ✅ No automatic sharing with educational institutions

### GDPR (General Data Protection Regulation)
- ✅ Lawful basis for processing: Parental consent + user consent
- ✅ Data minimization: Only necessary data collected
- ✅ Purpose limitation: Data used only for teen well-being, not marketing
- ✅ Storage limitation: Data deleted after retention period
- ✅ User rights: Access, export, deletion
- ✅ Data processor agreements: All vendors signed DPA (Data Processing Agreement)

---

## Privacy Policy (User-Facing)

**Location**: In-app Settings → Privacy Policy, or `prism.app/privacy`

**Key Points**:
1. What data is collected (list each sensor)
2. Why it's collected (for anomaly detection, not diagnosis)
3. Who can see it (teen, guardian, PRISM staff only)
4. How long it's kept (retention periods per data type)
5. How it's protected (encryption, audit logs)
6. User rights (access, export, delete)
7. Third-party services (if any)
8. Changes to policy (notice required, 30 days before enforcement)

---

## Security Best Practices

1. **Least Privilege Access**: API routes require role-based ACL (RBAC)
2. **No Hardcoded Secrets**: All secrets in environment variables or secrets manager
3. **Rate Limiting**: Prevent brute-force attacks on login/export endpoints
4. **SQL Injection Prevention**: All queries use parameterized statements
5. **CSRF Protection**: All state-changing requests require CSRF token
6. **XSS Prevention**: All user input sanitized; Content Security Policy headers set
7. **CORS**: Only allow requests from `prism.app` and `prism-admin.app`
8. **DDoS Mitigation**: Rate limiting + WAF rules
9. **Penetration Testing**: Quarterly third-party security audit
10. **Incident Response**: Contact BugCrowd within 24 hours of confirmed breach

---

## Third-Party Data Processors

**All vendors must sign Data Processing Agreement (DPA):**

| Service | Purpose | Data Access | DPA Status |
|---------|---------|------------|---|
| AWS (RDS, S3, Secrets Manager) | Cloud hosting | All data | ✅ Signed |
| SendGrid | Email notifications | Guardian email, alert summaries | ✅ Signed |
| Twilio (future) | SMS/Voice | Guardian phone, consent OTP | 🔄 Pending |
| Auth0 (future) | Identity provider | Usernames, hashed passwords | 🔄 Pending |
| Sentry | Error tracking | Stack traces (PII removed) | ✅ Signed |

**Important**: No data is shared with advertising networks, data brokers, or third parties for marketing.

---

## Cross-References

- **Sensor Specification**: [SENSORS.md](SENSORS.md)
- **MVP Scope**: [MVP-SCOPE.md](MVP-SCOPE.md)
- **Consent Lifecycle**: [CONSENT-LIFECYCLE.md](CONSENT-LIFECYCLE.md)
- **Architecture**: [architecture.md](architecture.md)
- **Ethics Statement**: [ETHICS.md](ETHICS.md)

---

**Signed Off By**:
- [ ] Privacy Officer
- [ ] General Counsel
- [ ] CISO (Chief Information Security Officer)
- [ ] Data Protection Officer (if applicable)

**Last Reviewed**: 2026-07-23  
**Next Review**: Quarterly or upon major feature changes
