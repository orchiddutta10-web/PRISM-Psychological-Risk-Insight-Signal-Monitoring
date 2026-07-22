# PRISM Consent Lifecycle Specification

**Version**: 1.0  
**Status**: FROZEN for Phase 1 MVP  
**Effective Date**: 2026-07-23  
**Compliance**: COPPA, FERPA, GDPR, State Consent Laws

---

## Executive Summary

This document defines PRISM's consent model: how consent is obtained, managed, revoked, and logged. The core principle is **dual consent**: both teen and guardian must explicitly approve data collection. Consent is granular (per-sensor modality), renewable, and revocable at any time.

---

## Consent Philosophy

### Dual Consent Requirement

**PRISM requires consent from TWO people before any data collection**:

1. **Teen**: Must read disclosure, understand what will be collected, and voluntarily agree
2. **Guardian**: Must read disclosure, verify it's appropriate, and approve on behalf of the teen

**Why dual consent?**
- Respects teen's autonomy (not just imposed on them)
- Ensures guardians are informed (not bypassed)
- Aligns with COPPA requirements (verifiable parental consent)
- Reduces teen-guardian conflict (both aligned from start)

### Non-Negotiable Rules

- ✅ Consent is **explicit**, not implied (no "accept terms" in EULA)
- ✅ Consent is **informed** (teen reads what's collected, why, and how long)
- ✅ Consent is **granular** (per-sensor modality, not all-or-nothing)
- ✅ Consent is **revocable** (can change mind at any time)
- ✅ Consent is **audited** (every change logged with timestamp)
- ✅ Consent is **durable** (proof of consent retained for legal defense)

---

## Consent Flow (Day 1)

### Step 1: Teen Onboarding (First Launch)

```
Teen opens PRISM app for the first time
    ↓
[Welcome screen with disclosure]
"PRISM lets a trusted adult (guardian) see patterns in your 
activity so they know if you're okay. 

What we watch: WHERE you go, HOW FAST you type, WHAT APPS you use, 
YOUR SLEEP, and occasionally your voice.

What we DON'T watch: Your messages, calls, photos, or anything private."
    ↓
[Button: "I understand, continue" or "Go back"]
    ↓
Teen reads disclosure, clicks button
    ↓
[Activity level check]
"Based on what you see, are you comfortable with this?"
    ↓
Teen chooses modality toggles:
  ☑ Location (GPS)
  ☑ Typing speed
  ☑ App usage
  ☑ Sleep pattern
  ☐ Voice (unchecked by default; opt-in)
    ↓
[Confirmation screen]
"You've selected: GPS, Typing, Apps, Sleep
Your guardian will need to approve before we start collecting."
    ↓
[Send guardian approval request via email/SMS]
```

### Step 2: Guardian Approval (Email)

```
Guardian receives email from PRISM:

Subject: [Teen's name] needs your approval to use PRISM

Dear [Guardian name],

[Teen's name] (age [age]) has signed up for PRISM, a privacy-first 
app that helps you stay informed about their well-being.

[Teen] has agreed to share:
✓ Location (GPS) — Every minute while app is active
✓ Typing speed — To detect stress or changes in behavior
✓ App usage — What categories they use (not specific apps)
✓ Sleep patterns — When they're sleeping, based on device activity
✗ Voice — Not enabled by [Teen]

Privacy promise:
• No message content, audio, or photos
• Data encrypted in transit (TLS) and at rest (AES-256)
• Data deleted automatically after 90 days
• Every data access is logged for security

Your approval means:
1. You've read this disclosure and understand what's being collected
2. You've discussed this with [Teen] and agree it's appropriate
3. You're responsible for managing [Teen]'s consent settings

[Approve] [Deny] [Ask Questions]

Approval expires: 30 days (renewable annually)
```

### Step 3: Guardian Approves (Online)

```
Guardian clicks [Approve] link in email
    ↓
[Guardian signs in to PRISM dashboard]
    ↓
[Consent review page]
    Collecting:
    • GPS location (every 60 seconds)
    • Keystroke timing (every keystroke)
    • App usage (every app switch)
    • Sleep window (derived from activity)
    
    NOT collecting:
    • Message content
    • Photos or videos
    • Voice/audio
    • Installed apps inventory
    
    Data protection:
    • Encrypted in transit (TLS 1.3)
    • Encrypted at rest (AES-256)
    • Deleted after 90 days (behavioral) or 24 hours (physio)
    • Audit log of all access
    
    Your rights:
    • Revoke consent at any time
    • Export teen's data
    • Delete all data
    • View access audit log
    ↓
[Checkboxes]
  ☑ I have read and understood what data will be collected
  ☑ I have discussed this with [Teen] and we both agree
  ☑ I understand I can revoke this consent at any time
    ↓
[Approve] [Deny]
    ↓
Guardian clicks [Approve]
    ↓
[Confirmation]
"Consent approved! [Teen]'s PRISM app is now active.
Last step: [Teen] will receive a notification to activate their app."
```

### Step 4: Teen Activates Collection

```
Teen receives push notification:
"Your guardian approved PRISM! Ready to start?"
    ↓
[Confirm screen]
"Your guardian [Guardian name] has approved your consent.
Data collection will start immediately. You can change your 
mind at any time in Settings."
    ↓
[Start collecting]
    ↓
Teen sees real-time dashboard:
"Data being transmitted right now:
✓ Location — Last sent 2 minutes ago
✓ Typing — Sent 5 min ago (47 keystrokes)
✓ Apps — Sent 3 min ago (TikTok active)
✓ Sleep — Calculated from your activity"
```

---

## Consent Records

### Consent Grant Table (Database)

```sql
CREATE TABLE consent_grants (
    id UUID PRIMARY KEY,
    teen_id UUID NOT NULL REFERENCES users(id),
    guardian_id UUID NOT NULL REFERENCES users(id),
    
    -- Consent scope
    consent_type ENUM('INITIAL', 'RENEWAL', 'MODIFICATION') NOT NULL,
    modality_gps BOOLEAN DEFAULT FALSE,
    modality_keystroke BOOLEAN DEFAULT FALSE,
    modality_app_usage BOOLEAN DEFAULT FALSE,
    modality_accelerometer BOOLEAN DEFAULT FALSE,
    modality_voice BOOLEAN DEFAULT FALSE,
    modality_physio_gsr BOOLEAN DEFAULT FALSE,
    modality_physio_ppg BOOLEAN DEFAULT FALSE,
    
    -- Timeline
    created_at TIMESTAMP NOT NULL,
    created_by_role ENUM('TEEN', 'GUARDIAN', 'SYSTEM') NOT NULL,
    expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 1 YEAR),
    revoked_at TIMESTAMP DEFAULT NULL,
    revoked_by_role ENUM('TEEN', 'GUARDIAN') DEFAULT NULL,
    revocation_reason TEXT DEFAULT NULL,
    
    -- Proof
    teen_signed_ip INET,
    teen_signed_user_agent TEXT,
    teen_signature_hash VARCHAR(255),  -- SHA-256 of signed consent form
    
    guardian_signed_ip INET,
    guardian_signed_user_agent TEXT,
    guardian_signature_hash VARCHAR(255),
    
    -- Context
    consent_form_version VARCHAR(10) NOT NULL DEFAULT '1.0',
    disclosure_text TEXT,  -- Full disclosure text shown at time of consent
    status ENUM('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED') NOT NULL,
    
    INDEX(teen_id, status),
    INDEX(guardian_id, status),
    INDEX(expires_at),
    INDEX(status)
);
```

### Audit Log Entry Example

```sql
INSERT INTO audit_logs (actor_id, action, resource_type, status, reason)
VALUES (
    <teen_id>,
    'CONSENT_GRANT',
    'MULTI_MODAL',
    'SUCCESS',
    'Teen approved initial consent: GPS, Keystroke, App, Sleep'
);

INSERT INTO audit_logs (actor_id, action, resource_type, status, reason)
VALUES (
    <guardian_id>,
    'CONSENT_APPROVE',
    'MULTI_MODAL',
    'SUCCESS',
    'Guardian approved consent for teen; modalities: GPS, Keystroke, App, Sleep'
);
```

---

## Per-Modality Consent

**Teen and guardian can enable/disable each sensor independently at any time.**

### Modality Toggles

| Modality | Data Type | Default | Can Teen Control? |
|----------|-----------|---------|---|
| Location (GPS) | Behavioral | ON | Yes |
| Keystroke Timing | Behavioral | ON | Yes |
| App Usage | Behavioral | ON | Yes |
| Accelerometer | Behavioral | ON (but needs approval) | Yes |
| Sleep Window | Derived | ON (requires Accel or Screen) | No (derived) |
| GSR/PPG | Physiological | OFF (opt-in) | Yes (future) |
| Voice | Physiological | OFF (opt-in) | Yes |

### Example: Teen Disables GPS

```
Teen goes to Settings → Privacy → Disable Location
    ↓
[Confirmation]
"You're about to disable Location data. 
Guardian will NOT be able to see where you go.
Are you sure?"
    ↓
Teen clicks [Yes, disable]
    ↓
[Confirmation]
"GPS collection disabled. You can re-enable anytime."
    ↓
Guardian dashboard shows:
"Location (GPS): ❌ Disabled by teen
Last data: [date]"
    ↓
Audit log entry:
Time: 2026-07-23 14:30:00
Actor: <teen_id>
Action: MODALITY_DISABLE
Modality: GPS
Reason: User choice
```

### Example: Guardian Disables Voice

```
Guardian goes to Dashboard → [Teen name] → Consent Settings
    ↓
[Modality list]
    ☑ Location (GPS)
    ☑ Keystroke
    ☑ App usage
    ☑ Sleep
    ☐ Voice (currently disabled)
    ↓
Guardian clicks [Edit]
    ↓
[Confirmation]
"Currently, [Teen] has NOT enabled voice recording.
If [Teen] enables it in the future, this toggle controls 
whether the data is collected."
    ↓
Guardian can set:
    ☐ Block voice (teen cannot enable)
    ☑ Allow voice (teen can choose)
    ↓
Guardian clicks [Allow voice]
    ↓
Teen's app now shows:
"Voice (optional): You can enable this to share check-ins
with your companion. Your guardian has approved it."
```

---

## Consent Renewal

**Consent expires annually and must be renewed.**

### Auto-Renewal Notification (90 Days Before Expiry)

```
Email to both teen and guardian:

Subject: Your PRISM consent is expiring in 90 days

Dear [Teen] and [Guardian],

Your consent for PRISM is set to expire on [date]. 
To continue using PRISM, you'll need to re-approve.

[Current modalities]
✓ Location
✓ Keystroke
✓ App usage
✓ Sleep

[Renew consent] (takes 2 minutes)

If you don't renew, PRISM will stop collecting data and 
all data will be deleted after 90 days (retention period).

Questions? Contact support@prism.app
```

### Renewal Process (Same as Initial)

1. Teen reviews disclosure (same as original)
2. Teen confirms or adjusts modality toggles
3. Guardian approves (same process)
4. New `consent_grant` row created
5. Old row marked `EXPIRED`
6. Data collection continues seamlessly

---

## Consent Revocation

**Either teen or guardian can revoke consent at any time, permanently stopping collection.**

### Teen Revokes Consent

```
Teen goes to Settings → Privacy → Stop PRISM
    ↓
[Warning screen]
"If you revoke consent, we will:
✓ Stop collecting your data immediately
✓ Delete all your data within 24 hours
✓ Notify your guardian

Your guardian can re-enable PRISM, but data will be lost.

Are you sure?"
    ↓
Teen clicks [Yes, revoke]
    ↓
[Confirmation]
"Consent revoked. Your guardian has been notified."
    ↓
Audit log:
Time: 2026-07-23 15:45:00
Actor: <teen_id>
Action: CONSENT_REVOKE
Reason: User request (teen)
Data deletion scheduled: 24 hours
```

### Guardian Revokes Consent

```
Guardian goes to Dashboard → [Teen name] → Revoke consent
    ↓
[Warning screen]
"Revoking consent will:
✓ Stop PRISM from collecting [Teen]'s data immediately
✓ Delete all collected data within 24 hours
✓ Notify [Teen]

You can re-enable PRISM later, but all data will be lost.

Are you sure?"
    ↓
Guardian clicks [Yes, revoke]
    ↓
[Confirmation]
"Consent revoked. [Teen] has been notified."
    ↓
Teen receives notification:
"Your guardian has stopped PRISM.
Data collection has stopped."
    ↓
Audit log:
Time: 2026-07-23 16:20:00
Actor: <guardian_id>
Action: CONSENT_REVOKE
Reason: Guardian request
Data deletion scheduled: 24 hours
```

### Data Deletion After Revocation

```python
# Scheduled job (24 hours after revocation)
def delete_revoked_consent_data():
    revoked = db.query(ConsentGrant).filter(
        ConsentGrant.revoked_at < NOW() - INTERVAL 24 HOURS,
        ConsentGrant.status == 'REVOKED',
        ConsentGrant.data_deleted_at IS NULL
    ).all()
    
    for grant in revoked:
        # Delete all data associated with this consent
        db.delete(GpsReadings.where(user_id=grant.teen_id))
        db.delete(KeystrokeIntervals.where(user_id=grant.teen_id))
        db.delete(AppUsageEvents.where(user_id=grant.teen_id))
        db.delete(VoiceSessions.where(user_id=grant.teen_id))
        
        # Mark as deleted
        grant.data_deleted_at = NOW()
        db.commit()
        
        # Send confirmation
        send_email(grant.guardian_id, "Data deleted per revocation request")
        send_email(grant.teen_id, "Your PRISM data has been deleted")
        
        # Log event
        audit_log(actor='system', action='DATA_DELETE', reason='Consent revocation')
```

---

## Special Cases

### Consent Before Age 13 (COPPA Compliance)

**If teen is under 13 years old:**
- Guardian must provide verifiable consent (email verification + postal mail option)
- Teen cannot independently grant consent
- Guardian is sole decision-maker
- Consent form simplified for child's understanding (but child reads it)

### Consent After Age 13 (Varying State Laws)

**If teen is 13–17:**
- Dual consent required (teen + guardian)
- Teen can revoke independently in some states
- Guardian can revoke in all states
- Consent form age-appropriate

### Consent at Age 18+ (Legal Adult)

**If teen reaches 18:**
- Teen is the sole consent holder (unless living with guardian by choice)
- Previous guardian consent becomes advisory only
- Teen can opt-out of guardian view entirely

---

## Consent Audit Trail

**Every consent change is logged to the immutable audit log.**

### Audit Log Fields

| Field | Purpose |
|-------|---------|
| `timestamp` | When consent change occurred |
| `actor_id` | Who made the change (teen, guardian, or system) |
| `actor_role` | TEEN, GUARDIAN, SYSTEM, ADMIN |
| `action` | CONSENT_GRANT, MODALITY_ENABLE, MODALITY_DISABLE, CONSENT_RENEW, CONSENT_REVOKE |
| `modality` | GPS, KEYSTROKE, APP_USAGE, VOICE, GSR, PPG (if applicable) |
| `ip_address` | Source IP (for fraud detection) |
| `user_agent` | Device/browser (for verification) |
| `consent_grant_id` | Link to `consent_grants.id` |
| `reason` | Human-readable reason |

### Query: All Consent Changes for One Teen

```sql
SELECT 
    al.timestamp,
    al.actor_role,
    al.action,
    al.modality,
    al.reason
FROM audit_logs al
WHERE al.resource_type = 'CONSENT'
  AND al.teen_id = <teen_id>
ORDER BY al.timestamp DESC;
```

### Compliance Report

```
Consent Audit Report for Teen: [name]
Generated: 2026-07-23 10:00 UTC

Timeline:
2026-07-23 10:30:00 — CONSENT_GRANT (Teen) — GPS, Keystroke, App, Sleep, Voice (N/A)
2026-07-23 11:00:00 — CONSENT_APPROVE (Guardian) — GPS, Keystroke, App, Sleep
2026-07-23 15:45:00 — MODALITY_DISABLE (Teen) — Voice (user choice)
2026-10-21 14:20:00 — CONSENT_RENEW (Teen) — GPS, Keystroke, App, Sleep
2026-10-21 14:50:00 — CONSENT_APPROVE (Guardian) — GPS, Keystroke, App, Sleep

Current status: ACTIVE
Expires: 2027-10-21
All modalities: GPS ✓, Keystroke ✓, App ✓, Sleep ✓, Voice ✗
```

---

## Compliance Checklist

### COPPA (Children's Online Privacy Protection Act)
- ✅ Verifiable parental consent required before any collection
- ✅ Clear, concise privacy notice provided
- ✅ Parent can review and delete child's data
- ✅ Parent can revoke consent anytime
- ✅ No collection beyond stated purposes
- ✅ No sale of child's data to third parties

### GDPR (General Data Protection Regulation)
- ✅ Lawful basis: Explicit consent from teen + guardian
- ✅ Consent is granular (per-modality)
- ✅ Consent is freely given (no coercion)
- ✅ Consent is informed (full disclosure provided)
- ✅ Withdrawal: User can revoke at any time
- ✅ Audit trail: All consent changes logged

### FERPA (Family Educational Rights and Privacy Act)
- ✅ If school-integrated: Consent treated separately from educational records
- ✅ No automatic sharing with educational institutions
- ✅ Parent can access teen's data
- ✅ Data breaches reported within 30 days

### State-Level Consent Laws
- ✅ California (CPRA): "Opt-out" mechanisms provided for eligible categories
- ✅ Colorado (CPA): Data minimization; only necessary data collected
- ✅ Virginia (VCDPA): Supported data rights (access, deletion)
- ✅ Texas (TDPSA): Consent model aligns with requirements

---

## Consent Withdrawal (Right to Be Forgotten)

**Teen or guardian can request complete data deletion (GDPR Article 17).**

### Request Process

```
Teen or Guardian goes to Settings → Privacy → Delete Account
    ↓
[Warning screen]
"Deleting your account will:
✓ Revoke all consent
✓ Delete all collected data within 24 hours
✓ Cannot be undone
✓ Audit logs retained for 2 years (legal requirement)

Are you sure?"
    ↓
[Download your data first?]
[Export] [No thanks]
    ↓
[Confirm deletion]
    ↓
Email confirmation sent to both teen + guardian
    ↓
24-hour deletion scheduled
```

### Deletion Verification

```
Automated deletion report (24 hours after request):

Deleted:
✓ GPS readings (90-day retention)
✓ Keystroke intervals (90-day retention)
✓ App usage events (90-day retention)
✓ Accelerometer readings (3-day retention)
✓ Voice embeddings (7-day retention)
✓ HRV/GSR features (24-hour retention)
✓ All derived metrics
✓ Alert history
✓ User profile (anonymized)

Retained (legal compliance):
✗ Audit logs (2-year retention)
✗ Consent grants (proof of prior consent)
✗ Anonymized analytics

Confirmation email sent to: [email]
```

---

## Cross-References

- **Privacy Specification**: [PRIVACY-SPEC.md](PRIVACY-SPEC.md)
- **MVP Scope**: [MVP-SCOPE.md](MVP-SCOPE.md)
- **Sensor Specification**: [SENSORS.md](SENSORS.md)
- **Alert Language**: [ALERT-LANGUAGE.md](ALERT-LANGUAGE.md)
- **Architecture**: [architecture.md](architecture.md)
- **Ethics Statement**: [ETHICS.md](ETHICS.md)

---

**Signed Off By**:
- [ ] Legal Counsel
- [ ] Privacy Officer
- [ ] Product Lead
- [ ] Compliance Officer

**Last Reviewed**: 2026-07-23  
**Next Review**: Quarterly or upon consent flow changes
