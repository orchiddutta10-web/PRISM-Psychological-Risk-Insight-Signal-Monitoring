# PRISM — Guardian Feature Specification

**Document ID**: SPEC-GUARDIAN-v1.0
**Phase**: 14
**Status**: DESIGN REVIEW
**Date**: 2026-07-28
**Authors**: PRISM Product Architecture Team

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Guardian Architecture](#2-guardian-architecture)
3. [Dashboard Design](#3-dashboard-design)
4. [Behavioral Detection Logic](#4-behavioral-detection-logic)
5. [Trend Engine](#5-trend-engine)
6. [Alert Generation Framework](#6-alert-generation-framework)
7. [Notification Policy](#7-notification-policy)
8. [Privacy Protection Model](#8-privacy-protection-model)
9. [Consent Workflow](#9-consent-workflow)
10. [Guardian UX](#10-guardian-ux)
11. [Example Screens](#11-example-screens)
12. [Example Alerts](#12-example-alerts)
13. [Positive Behaviour Recognition](#13-positive-behaviour-recognition)
14. [Edge Cases](#14-edge-cases)
15. [Security Considerations](#15-security-considerations)
16. [Ethical Safeguards](#16-ethical-safeguards)
17. [Implementation Roadmap](#17-implementation-roadmap)
18. [Future Enhancements](#18-future-enhancements)

---

## 1. Feature Overview

### 1.1 What Guardian Mode IS

Guardian Mode is an **optional, secondary capability** of PRISM. It enables a trusted adult (parent, caregiver, guardian) to receive:

- High-level behavioural status summaries
- Trend-based pattern change alerts
- Privacy-preserving well-being indicators
- Safety-critical notifications triggered by sustained threshold violations

### 1.2 What Guardian Mode is NOT

Guardian Mode explicitly does **NOT** provide:

| Prohibited | Rationale |
|---|---|
| Raw conversation content | Metadata-only platform constraint |
| Journal or diary entries | Protected personal space |
| Emotional state logs | Reductive; AI cannot accurately infer emotional states |
| Personal reflections | Core privacy boundary |
| Memory history | User-owned data |
| Exact activity details | Categories only (e.g., "social media" not app names) |
| Real-time location | Coarse metadata only (home/school/unknown clusters) |
| Surveillance capability | Platform-wide design constraint; no covert mode |

### 1.3 Core Design Principles

```
PRIMARY PRINCIPLE:
PRISM is a personal behavioral insight platform.
Guardian Mode is always secondary.

1. User privacy comes first — always.
2. Behavioral insights belong primarily to the user.
3. Guardians receive only meaningful safety information.
4. Guardians NEVER receive complete conversations.
5. Guardians NEVER receive raw journals or emotional logs.
6. Guardian notifications should be rare — alert fatigue erodes trust.
7. Guardian notifications should reduce anxiety, not provoke it.
8. Guardian Mode supports healthy communication — it does not replace it.
```

### 1.4 Relationship to Existing PRISM Architecture

Guardian Mode builds on existing infrastructure:

| Existing Capability | Guardian Mode Usage |
|---|---|
| Alert tier system (Sage/Amber/Red) | Reused with guardian-specific templates |
| Audit logging (immutable) | Guardian dashboard access events logged |
| JWT + RBAC auth | Guardian role expanded with `guardian-view` scope |
| Consent lifecycle (dual sign-off) | Extended with guardian invite/accept flow |
| Encryption at rest (AES-256-GCM) | Guardian data encrypted per privacy spec |
| Immutable audit logs | All guardian data access events captured |

---

## 2. Guardian Architecture

### 2.1 Data Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Teen Device     │───▶│  PRISM API        │───▶│  Guardian         │
│  (metadata only) │    │  (aggregation +    │    │  Dashboard (web)   │
│                  │    │   trend detection) │    │                    │
└─────────────────┘    └──────────────────┘    └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Guardian Alert    │
                       │  Engine            │
                       │  (threshold-based, │
                       │   trend-validated) │
                       └──────────────────┘
```

### 2.2 Trust Boundary

```
TRUST ZONE A (User)              TRUST ZONE B (Guardian)
├── Raw sensor data              ├── Status summary only
├── Conversation history         ├── Behavioral trend alerts
├── Personal reflections         ├── Aggregated trend charts
├── AI companion interactions    ├── Safety-critical notifications
├── Journal entries              ├── Positive behavior milestones
├── Mood/emotion data            ├── Consent status
└── Private metadata             └── Acknowledgement history

SHARED ZONE (Both)
├── Behavioral trend summaries
├── Alert history with contributing factors
├── Consent grants/revocations
└── Guardian communication prompts
```

### 2.3 Data Minimization Pipeline

```
Raw sensor data (28.8M events/month)
    ↓
Feature extraction (per-modality aggregates)
    ↓
Per-user baseline comparison
    ↓
Deviation scoring (Isolation Forest)
    ↓
Trend validation (≥3 days sustained change)
    ↓
Alert candidate generation
    ↓
False-positive filtering (life-event aware)
    ↓
Guardian-appropriate language generation
    ↓
Alert delivery (dashboard + optional email/SMS)
    ↓
Guardian view logged to immutable audit trail
```

---

## 3. Dashboard Design

### 3.1 Layout Philosophy

The Guardian Dashboard follows two rules:

1. **First glance: reassurance** — The top of the dashboard shows a calm, accurate status. Guardians should feel informed, not anxious.
2. **Progressive disclosure** — Details unfold as the guardian scrolls or taps. No information overload at first view.

### 3.2 Status System

#### Status Levels

| Status | Icon | Meaning | AI Generation |
|---|---|---|---|
| **Stable** | 🟢 Calm dot | All metrics within personal baseline. No deviations detected. | <5% deviation across all modalities for ≥7 days |
| **Improving** | 🟢 Upward arrow | Previously flagged metrics returning toward baseline. | Deviation trending back toward baseline over ≥3 days |
| **Mild Change Detected** | 🟡 Dot | One or two modalities showing modest deviation. Likely temporary. | 15-30% deviation in 1-2 modalities for ≥3 days |
| **Needs Attention** | 🟠 Circle | Multiple modalities showing sustained deviation. Guardian check-in recommended. | 30-50% deviation in 2+ modalities for ≥5 days |
| **High Concern** | 🔴 Circle | Rapid or severe deviation across modalities. Escalation warranted. | >50% deviation in 3+ modalities, crisis keyword detection, or multi-factor risk |

#### What is NEVER shown in status

| Prohibited | Delivered Instead |
|---|---|
| "Depressed" | "Activity levels are lower than usual" |
| "Anxious" | "Typing patterns show increased variability" |
| "Suicidal" | "Crisis support resources are available" |
| "Stressed" | "Nighttime screen activity has increased" |
| "Withdrawn from friends" | "Social app category usage has decreased" |
| "Addicted to phone" | "Screen time is above personal baseline" |

### 3.3 Dashboard Sections

```
┌─────────────────────────────────────────────────┐
│  GUARDIAN DASHBOARD              [Settings ⚙]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Child: Emily                                   │
│  Current Status: Stable           [View Details]│
│                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                 │
│  RECENT BEHAVIOURAL CHANGE                      │
│  Activity slightly lower than usual.            │
│  Sleep pattern remains consistent.              │
│  Screen time within normal range.               │
│  No other notable changes.                      │
│                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                 │
│  IMPORTANT ALERTS                        [2]    │
│  ⚠ Late-night screen time elevated   2 days ago│
│  ⚠ Morning routine delayed           4 days ago│
│                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                 │
│  TIMELINE                                       │
│  Jul 28 · Activity returned to baseline  ◉      │
│  Jul 26 · Sleep routine improved        ◉      │
│  Jul 24 · Guardian acknowledged alert   ◉      │
│  Jul 22 · School engagement increased   ◉      │
│  Jul 20 · Morning routine stabilizing   ◉      │
│                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                 │
│  BEHAVIOUR STABILITY TREND                      │
│  [████████░░] 82% stable this week              │
│  [▔▔▔▔▔▁▔▔] 7-day trend chart                   │
│                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                 │
│  POSITIVE CHANGES                               │
│  ✓ Sleep routine improving (3 days)            │
│  ✓ Morning activity returning to baseline       │
│  ✓ Consistent school-day rhythm                │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 3.4 Status Section — Detailed Specification

**Purpose**: One-glance well-being indicator. Reassuring, accurate, non-diagnostic.

**Update Frequency**: Updates every 6 hours as new behavioral windows are processed.

**Data Sources** (aggregated):
- Movement/activity: step count, movement entropy, active hours
- Sleep: sleep window estimation, consistency, duration
- Screen time: total hours, late-night proportion
- Heart rate: resting HR stability, HRV trend (optional, wearable)
- App usage: category distribution changes
- Voice: speech segment count, silence ratio (optional)

**Privacy Boundary**: Status is generated from **aggregated trend deviation scores** — not raw data, not exact values, not content.

---

## 4. Behavioral Detection Logic

### 4.1 Detection Philosophy

PRISM does NOT alert on isolated events. Every alert is the product of **sustained trend validation**.

```
Single-day anomaly          →  No alert
2-day anomaly               →  Internal flag only (no guardian notification)
3-day sustained deviation   →  Amber candidate (trend validation)
5-day sustained deviation   →  Amber alert (delivered)
7+ day sustained deviation  →  Red candidate (escalation)
Multi-factor convergence    →  Red alert (delivered)
```

### 4.2 Signal Categories

| Category | Signals Monitored | Privacy Note |
|---|---|---|
| Routine Consistency | Bedtime variance, wake-time variance, meal-time proxies | No content, only timing |
| Communication Frequency | Typing burst frequency, session count | No message content, no recipients |
| Sleep Trends | Sleep duration, onset consistency, fragmentation | No sleep content |
| Activity Levels | Step count, movement entropy, active hours | No location specificity |
| Stress Indicators | HRV trend, typing speed variability, app-switching rate | No emotional labeling |
| Mood Stability | Voice session frequency, speech segment patterns | No voice content, no transcripts |
| Emotional Variability | Typing entropy, app-category switching | No mood labels, no emotional diagnosis |
| Recovery Patterns | Sleep rebound after late nights, activity resumption | No recovery content |

### 4.3 False-Positive Reduction

PRISM uses a multi-layer false-positive filter:

| Layer | Method | Example |
|---|---|---|
| 1. Duration gate | Require ≥3 days sustained deviation | Single late night → no alert |
| 2. Life-event awareness | Guardian/marked events suppress alerts | "Exam week" → suppress for 7 days |
| 3. Statistical significance | Minimum 15% deviation from personal baseline | 5% change → filtered out |
| 4. Confidence threshold | Minimum 60% model confidence | Low-confidence anomaly → suppressed |
| 5. Baseline-building period | First 7 days post-consent: no alerts | New device → grace period |
| 6. Alert deduplication | Batched if >3 identical alerts/hour | Repeated same alert → single notification |
| 7. Quiet hours | Guardian-configured silence windows | 10 PM–7 AM → held until morning |

### 4.4 Detection Pipeline

```
┌────────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
│ Raw Events  │──▶│  Per-Modality│──▶│  Isolation    │──▶│  Trend        │
│ (hourly     │   │  Aggregation │   │  Forest       │   │  Validator    │
│  windows)   │   │  (24h rollup)│   │  (deviation   │   │  (≥3 days)    │
└────────────┘   └─────────────┘   │  scoring)     │   └──────────────┘
                                   └──────────────┘           │
                                                              ▼
┌────────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
│ Guardian   │◀──│ Language    │◀──│ False-Positive│◀──│ Multi-Factor  │
│ Notification│  │ Generator   │   │ Filter        │   │ Convergence   │
└────────────┘   └─────────────┘   └──────────────┘   │ Check          │
                                                       └──────────────┘
```

---

## 5. Trend Engine

### 5.1 Trend Categories

Each validated trend answered these five questions internally before generating an alert:

1. **What changed?** — Which modality(ies) deviated?
2. **By how much?** — Quantified deviation from personal baseline
3. **For how long?** — Duration of sustained change
4. **In which direction?** — Improving, deteriorating, or neutral pattern
5. **Is this explained?** — Life-event or known context exists?

### 5.2 Aggregated Trend Detection

Trends are detected across **14-day rolling windows** compared to personal baselines:

| Trend Signal | Baseline Comparison | Threshold | Window Size |
|---|---|---|---|
| Movement | 14-day step count average | ±20% | 3-day sliding |
| Sleep consistency | Bedtime standard deviation | >2h variance | 5-day sliding |
| Screen time | Hourly screen-on average | ±25% | 3-day sliding |
| App usage diversity | Category entropy | ±30% | 7-day sliding |
| Communication | Typing burst frequency | ±35% | 5-day sliding |
| Nighttime activity | Screen time 22:00-04:00 | ±30% | 3-day sliding |

### 5.3 Trend Language Generation

Raw deviation percentages are converted to guardian-appropriate language:

| Raw Data | Guardian Language |
|---|---|
| "Step count -28% over 5 days" | "Activity levels have been lower than usual over the past several days." |
| "Sleep onset shifted +2h for 3 nights" | "Bedtime has been occurring later than your child's typical schedule." |
| "Screen time +35% this week" | "Screen usage has increased this week." |
| "Typing speed +40%, app switching +60%" | "Digital activity patterns have changed recently." |

**Never**: raw values, percentage changes, clinical language, speculative cause attribution.

---

## 6. Alert Generation Framework

### 6.1 Alert Severity Levels

| Level | Name | Icon | Trigger Conditions | Delivery | Escalation Path |
|---|---|---|---|---|---|
| Info | Information | ◉ Gray | No deviation; routine summary | Weekly digest | None |
| Observation | Observation | 🟡 Dot | Minor deviation in 1 modality; <30% change | Weekly digest | Monitor → Attention if sustained |
| Attention | Needs Attention | 🟠 Circle | Sustained deviation in 2+ modalities; 30-50% change | Dashboard immediately | Escalate to Urgent if >5 days |
| Urgent | Urgent | 🔴 Diamond | Rapid deterioration; 50%+ change in 3+ modalities | Dashboard + email | Escalate to Critical if multi-factor |
| Critical | Critical | 🔴🔴 Double | Crisis keyword detection; life-safety concern; immediate risk | Dashboard + email + SMS (future) | Crisis resources; professional support |

### 6.2 Alert Categories

| Category | Description | Typical Triggers | Example |
|---|---|---|---|
| **Behavior** | Sustained behavioral pattern shifts | Movement, screen time, activity | "Activity has been lower than usual this week." |
| **Wellbeing** | Holistic wellness indicators | Sleep, routine, recovery | "Sleep pattern has become less consistent." |
| **Safety** | Crisis or risk indicators | Crisis keywords, extreme inactivity | "We detected concerning patterns. Please check in." |
| **Isolation** | Social withdrawal signals | Reduced app diversity, lower typing frequency | "Digital interaction has decreased recently." |
| **Sleep** | Sleep pattern changes | Onset time, duration, consistency | "Bedtime has been occurring significantly later." |
| **Routine** | Daily rhythm disruption | Wake time, active hours, consistency | "Daily routine has been less predictable." |
| **Mood** | Behavioral proxies for emotional patterns | Typing entropy, app-switching, voice patterns | "Activity patterns suggest possible emotional variability." |
| **Risk Escalation** | Multi-factor convergence | 3+ simultaneous alerts | "Several behavioral patterns have shifted simultaneously." |

### 6.3 Alert Structure

Every alert follows this template:

```
┌──────────────────────────────────────┐
│ [Severity Icon] [Category Label]     │
│                                      │
│ [Plain-language title]               │
│                                      │
│ [2-3 sentence behavioral description]│
│                                      │
│ What We're Seeing:                   │
│ • [Specific behavioral observation]  │
│ • [Specific behavioral observation]  │
│ • [Specific behavioral observation]  │
│                                      │
│ Confidence: ████████░░ 82%           │
│                                      │
│ What This Means:                     │
│ [Plain-language interpretation]      │
│                                      │
│ Suggested Approach:                  │
│ [Non-alarming, actionable suggestion]│
│                                      │
│ [Optional: User context if shared]   │
│                                      │
│ [Timestamp] · [Alert ID]             │
│ [✓ Acknowledge]  [🗣 Conversation   │
│  Starter]        [📋 View Details]  │
└──────────────────────────────────────┘
```

### 6.4 Alert Deduplication

Multiple related alerts are batched:

```
BEFORE (3 separate alerts):
⚠ Late-night screen time
⚠ Reduced morning activity
⚠ Bedtime shift detected

AFTER (1 batched alert):
⚠ Several Evening Patterns Have Changed
• Screen usage in late hours increased
• Morning routines adjusted
• Bedtime shifted later than usual
```

---

## 7. Notification Policy

### 7.1 Notification Triggers

#### Do NOT notify guardians for:

| Scenario | Rationale |
|---|---|
| Small mood changes | Emotional granularity is not measurable from metadata |
| Temporary frustration | Single-day variations are normal |
| Ordinary sadness | No content analysis is performed |
| Single bad day | Requires sustained trend (≥3 days) |
| Minor disagreements | Content-based detection is prohibited |
| Routine emotional fluctuations | Behavioral variability is expected |
| One-time app uninstall | Could be legitimate cleanup |
| Weekend schedule changes | Normal variation in routines |
| Holiday behavior | Expected deviation from school-day patterns |
| Known exam period | Guardian or user-marked life event |

#### Notify guardians ONLY when:

| Trigger | Threshold |
|---|---|
| Persistent withdrawal | ≥5 days of reduced digital interaction + reduced movement |
| Rapid behavioral deterioration | 3+ modalities crossing attention threshold within 5 days |
| Repeated high-risk indicators | 2+ crisis keyword detections within 7 days |
| Multiple concerning signals | 3+ simultaneous alert-worthy deviations |
| Potential safety concerns | Crisis keyword detection or extreme inactivity pattern |

### 7.2 Delivery Policy

| Alert Level | Dashboard | Email | SMS | Timing |
|---|---|---|---|---|
| Info | ✅ | Weekly digest | ❌ | Any time |
| Observation | ✅ | Weekly digest | ❌ | Any time |
| Attention | ✅ | Next digest | ❌ | Any time |
| Urgent | ✅ | Immediate | Opt-in | Any time |
| Critical | ✅ | Immediate | Immediate | Immediately |

### 7.3 Alert Fatigue Prevention

| Rule | Action |
|---|---|
| Maximum alerts per week | 7 (configurable) |
| Identical alert batching | Merge if same category + same modality within 24h |
| Guardian acknowledgment | After acknowledgment, same alert category silenced for 48h |
| Alert sensitivity setting | "Calm" (least frequent), "Balanced" (default), "Attentive" (most frequent) |
| Weekly digest | All Info/Observation alerts aggregated into single weekly email |

### 7.4 Quiet Hours

Guardians can configure:

```
Quiet Hours: [22:00] to [07:00]
During quiet hours:
  ✅ Critical alerts: delivered immediately (overrides quiet hours)
  ✅ Urgent alerts: delivered immediately
  ⏸ Attention alerts: held until quiet hours end
  ⏸ Info/Observation: held for digest
```

---

## 8. Privacy Protection Model

### 8.1 Guardian Data Access Matrix

| Data Category | Guardian Can See | Details |
|---|---|---|
| Current Status | ✅ | Aggregated status label only |
| Behavioral Trends | ✅ | Trend descriptions, no raw data |
| Alert History | ✅ | All past alerts with contributing factors |
| Timeline | ✅ | Major behavioral shifts, positive milestones |
| Stability Score | ✅ | Aggregated weekly percentage |
| Consent Status | ✅ | Active/revoked per modality |
| App Categories | ✅ | Distribution percentages (e.g., "60% social") |
| Exact App Names | ❌ | Category-level only |
| GPS Coordinates | ❌ | Cluster labels only (home/school/other) |
| Message Content | ❌ | Metadata-only platform constraint |
| Companion Conversations | ❌ | Protected personal space |
| Journal Entries | ❌ | Private by design |
| Mood Labels | ❌ | Mood is not inferred from metadata |
| Voice Content | ❌ | Audio never stored |
| Personal Reflections | ❌ | Core privacy boundary |
| Memory History | ❌ | Owned by user |

### 8.2 Audit Trail

Every guardian data access event is logged:

```
audit_log_entries:
  actor_id:        guardian_user_id
  action:          READ_BEHAVIORAL_SUMMARY | READ_ALERTS | READ_TIMELINE | ACKNOWLEDGE_ALERT
  resource:        /guardian/dashboard/{user_id}
  timestamp:       ISO-8601 UTC
  context: {
    ip_address:    source IP,
    user_agent:    browser/client,
    record_count:  number of items viewed,
    alert_ids:     [specific alert IDs viewed]
  }
```

### 8.3 Guardian Access Logs Visible to User

For transparency, the user (teen/dependent) can see:

```
Your guardian viewed:
  • Dashboard summary — July 28, 2026 at 09:15
  • Alert "Late-night activity" — July 26, 2026 at 14:22
  • Timeline — July 24, 2026 at 20:05

You can review these access logs anytime in Settings → Privacy → Guardian Access.
```

---

## 9. Consent Workflow

### 9.1 Consent Model

Guardian Mode uses a **consent chain**:

```
User (teen/dependent) grants consent
         ↓
Guardian invitation sent (via email/SMS)
         ↓
Guardian accepts invitation + acknowledges privacy boundaries
         ↓
Dual consent established
         ↓
Guardian can view dashboard
         ↓
Either party can revoke at any time
```

### 9.2 Age-Dependent Consent

| Age Group | Guardian Requirement | User Consent Required | Special Rules |
|---|---|---|---|
| Under 13 | Required (guardian must initiate) | Assent required (age-appropriate explanation) | COPPA-compliant verifiable parental consent |
| 13-15 | Strongly encouraged | Required | Guardian can be invited; user retains veto |
| 16-17 | Optional | Required | User decides whether to connect a guardian |
| 18+ | Not applicable | N/A | Full autonomy; guardian features unavailable |
| Vulnerable adult | Optional | Required + capacity assessment | Third-party legal guardian may be required |

### 9.3 Enabling Guardian Mode

```
User flow:
1. User navigates to Settings → Guardian
2. User sees disclosure: "You can invite a trusted adult to receive
   trend-based behavioral summaries. They will never see your messages,
   conversations, journals, or personal reflections."
3. User enters guardian email/phone
4. Invitation sent with privacy boundary disclosure
5. Guardian receives invitation: "You're invited to connect with [Name]
   on PRISM. You'll receive behavioral trend summaries — never private
   content. Learn what you'll see and what you won't."
6. Guardian accepts: "I understand I will receive trend-based summaries
   only. I will not have access to messages, conversations, or personal
   content."
7. Dual consent established
8. Audit log: "Guardian connection established [user_id] ↔ [guardian_id]"
```

### 9.4 Revocation

| Action | Who | Effect | Grace Period |
|---|---|---|---|
| User revokes | User | Guardian access immediately terminated | Immediate |
| Guardian disconnects | Guardian | Guardian voluntarily ends connection | Immediate |
| Temporary pause | Either | Guardian access suspended for configurable duration | Configurable (1 day–30 days) |
| Age-based auto-revoke | System | Guardian access removed when user turns 18 | On birthday |
| Emergency override | System | Guardian access temporarily restored for crisis | 24 hours max, fully audited |

### 9.5 Transparency Log

Both parties can view:

```
GUARDIAN CONNECTION HISTORY

Connected: July 15, 2026
Status: Active

Access Log:
  Jul 28 · Dashboard viewed · 09:15 UTC
  Jul 26 · Alert viewed (ID: ALT-2026-07-26-001) · 14:22 UTC
  Jul 24 · Timeline viewed · 20:05 UTC
  Jul 22 · Settings updated (quiet hours: 22:00-07:00) · 08:30 UTC
```

---

## 10. Guardian UX

### 10.1 Emotional Design Principles

Guardian UI must reduce anxiety, not produce it:

| Principle | Implementation |
|---|---|
| Calm first glance | Status visible immediately; details require interaction |
| Non-alarmist language | "We noticed..." not "Alert!" or "Warning!" |
| Contextual reassurance | "This is common and often temporary" for low-severity items |
| Action-oriented, not fear-oriented | "Consider checking in" not "Your child needs help" |
| Positive framing | "Sleep is returning to normal" not "Sleep problem resolved" |
| Progress visibility | Show improvements alongside concerns |
| No red at first glance | Critical alerts require two taps to view (progressive severity) |

### 10.2 Guardian Onboarding Flow

```
Step 1: Welcome
"We'll share behavioral trends — never private content."

Step 2: What You'll See
[Visual cards showing categories with "✓ See" and "✕ Won't See"]

Step 3: Alert Preferences
[Calm / Balanced / Attentive sensitivity selector]
[Quiet hours configuration]
[Notification channels]

Step 4: Conversation Starters
"Here are suggested ways to talk about what you see:
 ✓ 'I noticed some changes in your routine — everything okay?'
 ✗ 'PRISM says you've been on your phone too much!'"

Step 5: Confirmation
"You're connected. You'll receive your first summary in 24 hours."
```

### 10.3 Dashboard Interaction Patterns

| Action | Interaction | Feedback |
|---|---|---|
| View alert | Tap alert card | Expands inline with full details |
| Acknowledge alert | Tap "✓ Acknowledge" | Alert marked read; similar alerts silenced 48h |
| View timeline | Scroll to timeline section | Scrollable timeline with expandable events |
| Get conversation starter | Tap "🗣 Conversation Starter" | One-tap copy of non-alarming conversation prompt |
| Adjust sensitivity | Settings → Alert Sensitivity | Instant; applies to future alerts only |
| View stability trend | Tap trend chart | Expands to full-screen interactive chart |

---

## 11. Example Screens

### 11.1 Guardian Dashboard — Calm State

```
┌──────────────────────────────────────────────────┐
│  PRISM Guardian                    [Settings ⚙] │
│                                                  │
│  Child: Alex                                     │
│  ┌────────────────────────────────────────────┐  │
│  │ ● Stable                                   │  │
│  │ All behavioral metrics are within Alex's   │  │
│  │ personal baseline. No deviations detected. │  │
│  │ [View Details →]                           │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  RECENT BEHAVIOURAL CHANGE                       │
│  ┌────────────────────────────────────────────┐  │
│  │ No significant changes detected.           │  │
│  │ Alex's routines have been consistent over  │  │
│  │ the past 7 days.                           │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  TIMELINE                              See All →│
│  ● Jul 28 · Routine remained consistent         │
│  ● Jul 26 · Guardian acknowledged alert         │
│  ● Jul 24 · Sleep pattern returned to baseline  │
│  ● Jul 22 · Morning routine stabilized          │
│                                                  │
│  POSITIVE CHANGES                                │
│  ✓ Screen time within healthy range (4 days)    │
│  ✓ Consistent weekday wake-up time              │
│  ✓ Regular physical activity pattern            │
│                                                  │
│  BEHAVIOUR STABILITY                             │
│  ████████████░ 91% this week                     │
│                                                  │
│  No alerts this week 🎉                          │
└──────────────────────────────────────────────────┘
```

### 11.2 Guardian Dashboard — Attention State

```
┌──────────────────────────────────────────────────┐
│  PRISM Guardian                    [Settings ⚙] │
│                                                  │
│  Child: Alex                                     │
│  ┌────────────────────────────────────────────┐  │
│  │ 🟡 Mild Change Detected                    │  │
│  │ Some routines have shifted from Alex's     │  │
│  │ personal baseline this week.               │  │
│  │ [View Details →]                           │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  RECENT BEHAVIOURAL CHANGE                       │
│  ┌────────────────────────────────────────────┐  │
│  │ Activity slightly lower than usual.        │  │
│  │ Late-night screen time has increased.      │  │
│  │ Sleep onset shifted later by ~45 minutes.  │  │
│  │ Heart rate and mood indicators are stable. │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  IMPORTANT ALERTS                         [2]    │
│  ⚠ Late-night screen time elevated   2 days ago│
│  ⚠ Morning activity lower than usual  4 days ago│
│                                                  │
│  TIMELINE                              See All →│
│  ● Jul 28 · Screen time above baseline          │
│  ● Jul 26 · Sleep shift detected                │
│  ● Jul 24 · Guardian acknowledged alert         │
│  ● Jul 22 · Morning routine delayed             │
│                                                  │
│  BEHAVIOUR STABILITY                             │
│  ████████░░░░ 68% this week (↓ from 91%)         │
│                                                  │
│  SUGGESTED APPROACH                              │
│  ┌────────────────────────────────────────────┐  │
│  │ These changes may be related to summer     │  │
│  │ break routines. Consider a casual check-in: │  │
│  │ "How's your summer going? Everything okay?"│  │
│  │ [Copy Conversation Starter]                │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 11.3 Guardian Dashboard — High Concern State

```
┌──────────────────────────────────────────────────┐
│  PRISM Guardian                    [Settings ⚙] │
│                                                  │
│  Child: Alex                                     │
│  ┌────────────────────────────────────────────┐  │
│  │ 🔴 High Concern                            │  │
│  │ Several behavioral patterns have shifted   │  │
│  │ significantly. A check-in is recommended.  │  │
│  │ Confidence: 87%                            │  │
│  │ [View Full Analysis →]                     │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  WHAT WE'RE SEEING                               │
│  ┌────────────────────────────────────────────┐  │
│  │ • Activity: Significantly below baseline   │  │
│  │   for 5 consecutive days                   │  │
│  │ • Sleep: Onset shifted by 2+ hours;        │  │
│  │   duration reduced by 3 hours/night        │  │
│  │ • Screen time: Elevated, especially during │  │
│  │   late-night hours (midnight–3 AM)         │  │
│  │ • Digital interaction: Reduced across all  │  │
│  │   categories for 4 days                    │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  SUGGESTED APPROACH                              │
│  ┌────────────────────────────────────────────┐  │
│  │ 1. Have a direct, non-judgmental check-in  │  │
│  │ 2. Ask open-ended questions: "I've noticed │  │
│  │    some changes. I'm here if you want to   │  │
│  │    talk — no pressure."                    │  │
│  │ 3. Consider reaching out to a school       │  │
│  │    counselor or pediatrician if patterns   │  │
│  │    persist for another 3 days              │  │
│  │                                            │  │
│  │ Resources: Crisis Text Line (text HOME to  │  │
│  │ 741741) · 988 Suicide & Crisis Lifeline    │  │
│  │ [Copy All]                                 │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  IMPORTANT: These are behavioral deviations, not │
│  diagnoses. A qualified professional should      │
│  evaluate any concerns.                          │
└──────────────────────────────────────────────────┘
```

---

## 12. Example Alerts

### 12.1 Information Alert — Routine Summary

```
◉ Weekly Routine Summary
July 22–28, 2026

Alex's routines remained consistent this week.

What We're Seeing:
• Sleep: 7-8 hours/night, consistent bedtime
• Activity: Regular movement patterns
• Screen time: Within personal baseline
• Routine: Weekday patterns stable

This is a routine weekly update. No action needed.
```

### 12.2 Observation Alert — Minor Shift

```
🟡 Activity Change Observed
July 26, 2026

Alex's activity levels have been slightly lower this week.

What We're Seeing:
• Movement: Below personal baseline for 3 days
• Screen time: Slightly above typical range
• Sleep: Remains consistent

What This Means:
A temporary shift, often related to weather, schedule
changes, or natural variation. This is common.

Confidence: 72%

Suggested Approach:
No action needed. Continue monitoring.
This alert will update if the pattern persists.
```

### 12.3 Attention Alert — Sustained Pattern

```
🟠 Sustained Pattern Change
July 24, 2026

Several aspects of Alex's daily routine have shifted
over the past week.

What We're Seeing:
• Bedtime has moved 1.5 hours later than usual
• Screen usage has increased, particularly in the evening
• Morning activity has decreased
• Sleep duration reduced by approximately 1.5 hours

What This Means:
This pattern has been consistent for 5 days. It may
reflect a schedule change, increased workload, or
other temporary factors.

Confidence: 81%

Suggested Approach:
"I noticed you've been going to bed later — how are
you feeling? Everything okay?"

[✓ Acknowledge]  [🗣 Copy Starter]
```

### 12.4 Urgent Alert — Rapid Deterioration

```
🔴 Pattern Accelerating
July 23, 2026

Alex's behavioral patterns have changed rapidly
over the past 4 days.

What We're Seeing:
• Activity dropped 50% below baseline
• Sleep: irregular, under 5 hours for 4 nights
• Digital interaction: near zero for 2 days
• Screen time: spiked to 14+ hours/day
• Heart rate: elevated resting rate (+12 BPM)

What This Means:
This represents a significant departure from Alex's
established patterns. The rate of change is notable.

Confidence: 89%

Suggested Approach:
1. Have a direct conversation today: "I've noticed
   some big changes. I'm worried and I want to
   understand what's going on."
2. Listen without judgment; ask what support
   would be helpful.
3. Consider consulting a school counselor or
   pediatrician.
4. Resources: Crisis Text Line (text HOME to 741741)

[✓ Acknowledge]  [📋 View Full Analysis]  [📞 Resources]
```

### 12.5 Critical Alert — Crisis Detection

```
🔴🔴 Immediate Check-In Recommended
July 22, 2026 · 01:45 AM

We've detected patterns that warrant an immediate
conversation with Alex.

PRISM is not a crisis service. If you believe Alex
is in immediate danger, call emergency services.

What We're Seeing:
• Multiple behavioral signals have shifted
  simultaneously and rapidly
• Patterns suggest significant distress

Confidence: 93%

Immediate Actions:
1. Reach out to Alex directly — call or visit
2. Ask directly: "Are you safe right now?"
3. Crisis resources are available:
   • 988 Suicide & Crisis Lifeline: call or text 988
   • Crisis Text Line: text HOME to 741741
   • Emergency: call 911 (US) or local emergency number

[✓ I've Checked In]  [📞 Call 988]  [📋 Resources]

A wellness follow-up will be sent in 24 hours.
```

### 12.6 Positive Recognition Alert

```
✓ Positive Pattern Recognized
July 28, 2026

We noticed a positive shift in Alex's routines.

What We're Seeing:
• Sleep duration returned to 7-8 hours
• Morning activity is back to baseline
• Screen time has decreased to typical range
• Routine consistency is improving daily

What This Means:
Alex's patterns are returning to their established
baseline. This is great to see.

Approach:
Consider acknowledging the positive change: "It seems
like things are settling back into a good rhythm.
I'm glad to see that."

[✓ Acknowledge]
```

---

## 13. Positive Behaviour Recognition

PRISM explicitly recognizes and communicates positive patterns:

### 13.1 Positive Pattern Categories

| Category | Trigger | Guardian Message |
|---|---|---|
| Routine Stability | 7+ days consistent baseline | "Alex's routines have been steady this week." |
| Improvement | Deviation returning to baseline | "Sleep is returning to Alex's normal pattern." |
| Recovery | Post-disruption normalization | "Activity levels are back to baseline after last week's change." |
| Consistency | Low variance across modalities | "Alex has maintained great routine consistency." |
| Positive Trend | Sustained improvement | "Screen time has been decreasing over the past 2 weeks." |

### 13.2 Positive Framing Rules

Always frame positively:

| Avoid | Use Instead |
|---|---|
| "Screen time problem resolved" | "Screen time has returned to typical range" |
| "Sleep is back to normal" | "Sleep patterns are aligning with baseline" |
| "Finally fixed" | "Consistent improvement observed" |
| "No longer a concern" | "Pattern has shifted in a positive direction" |

---

## 14. Edge Cases

### 14.1 Device Sharing

**Scenario**: Multiple users on one device (shared family tablet)

**Handling**: PRISM detects behavioral patterns per-user, not per-device. If a shared device is detected (wildly different typing patterns), the system flags "Possible shared device" and suppresses behavioral alerts. Guardian is notified: "Behavioral monitoring is paused — the device appears to be shared."

### 14.2 Guardian Separation/Divorce

**Scenario**: Two guardians, legal custody changes

**Handling**: Both guardians can be connected simultaneously. Either guardian can view the dashboard independently. If one guardian's access is legally revoked, the other guardian (or user) can remove them. All revocations are logged. PRISM does not adjudicate custody — it follows the user's consent choices.

### 14.3 Guardian Overreach

**Scenario**: Guardian uses behavioral data to control or punish

**Handling**: PRISM cannot prevent this, but mitigates through:
- User can see all guardian access in the transparency log
- User can revoke guardian access at any time
- Guardian dashboard shows trends, not specifics — limiting ammunition for control
- Alert language is intentionally neutral and non-judgmental
- Conversation starters model healthy communication, not interrogation

### 14.4 User Turns 18

**Scenario**: Birthday triggers age-based changes

**Handling**: On the user's 18th birthday:
1. System sends notification: "You're now 18. Guardian access will end in 30 days unless you choose to extend it."
2. After 30 days, guardian access automatically terminates
3. All guardian access history is preserved for audit
4. User retains full data ownership and control

### 14.5 Crisis False Positive

**Scenario**: Guardian receives urgent alert that turns out to be benign

**Handling**:
1. Guardian can mark alert as "Resolved — False Alarm" 
2. False alarm feedback is logged and used to tune detection thresholds
3. Trigger context is preserved: "Crisis keyword was detected. It was actually a quote from a book/TV show." 
4. No penalty to the user — system learns context, user trust is maintained

### 14.6 Network Outage / Delayed Alerts

**Scenario**: Device offline, alerts queued, delivered hours later

**Handling**:
1. Alerts are timestamped with detection time, not delivery time
2. Batch delivery message: "These alerts were generated while Alex's device was offline (July 25, 02:00–08:00)."
3. Stale alerts (>24h old on delivery) are delivered with a staleness warning
4. Guardian can suppress stale alerts

---

## 15. Security Considerations

### 15.1 Authentication (Expanded from existing JWT + RBAC)

```
Guardian role permissions:
  guardian:view_dashboard        — View behavioral summary
  guardian:view_alerts           — View alert history
  guardian:acknowledge_alert     — Mark alerts as read
  guardian:view_timeline         — View behavioral timeline
  guardian:configure_settings    — Adjust alert sensitivity, quiet hours
  guardian:export_data           — Export alert history (own access only)
  guardian:disconnect            — Revoke own guardian access

Guardian role does NOT have:
  user:read_messages             — Cannot read any user content
  user:read_journal              — Cannot read journal entries
  user:read_companion            — Cannot read companion conversations
  user:read_voice                — Cannot access voice data
  user:read_location             — Cannot access raw location data
  admin:*                        — No administrative access
```

### 15.2 Rate Limiting

```
Guardian API endpoints:
  GET  /guardian/dashboard          — 30 req/hour
  GET  /guardian/alerts             — 60 req/hour
  POST /guardian/alerts/acknowledge — 30 req/hour
  GET  /guardian/timeline           — 30 req/hour
```

### 15.3 Audit Trail (All Access Logged)

```
Every guardian dashboard view, alert read, and
setting change is written to the immutable audit
log with: actor_id, action, resource, timestamp,
IP address, user agent.
```

---

## 16. Ethical Safeguards

### 16.1 Avoiding the Surveillance Trap

| Anti-Surveillance Measure | Implementation |
|---|---|
| No real-time monitoring | Data is aggregated in 6-hour windows |
| No content access | Metadata only, per platform constraint |
| No location tracking | Clusters only (home/school/other) |
| No emotion inference | Behavioral patterns, not emotional labels |
| No app names | Categories only |
| User controls access | User can revoke guardian at any time |
| Transparency log visible | User sees every guardian access event |
| Age-based termination | Guardian access ends at 18 unless renewed |
| Positive framing required | All alerts must include positive context or not be sent |
| No punitive language | Alert templates are reviewed for neutrality |

### 16.2 Child Autonomy

The guardian feature must not undermine the user's sense of agency:

1. User must consent before guardian is connected (age 13+)
2. User sees exactly what guardian sees (no hidden data sharing)
3. User can add context to alerts ("This was exam week")
4. User receives same behavioral insights on their own dashboard
5. User can initiate conversations about what guardian sees

### 16.3 Guardian Trust

Guardians must trust that PRISM will alert them when it matters — without overwhelming them:

1. False-positive rate target: <15% of delivered alerts
2. Critical alert delivery guarantee: within 5 minutes of detection
3. Alert language is always factual, never speculative
4. Guardian can adjust sensitivity without affecting user experience
5. Guardian feedback ("This was a false alarm") improves the system

### 16.4 Bias Prevention

The detection engine must not encode cultural, socioeconomic, or demographic bias:

| Risk | Mitigation |
|---|---|
| Cultural differences in routine | Baseline is personal, not population-based |
| Socioeconomic activity variance | No assumption about "normal" activity levels |
| Different family structures | Guardian = any trusted adult, not necessarily parent |
| Age-appropriate behavior variance | Baselines adapt to developmental stages |
| Disability accommodations | Custom baseline periods for users with disabilities |

---

## 17. Implementation Roadmap

### Phase 14A — Guardian Core (Week 1–2)

| Task | Description |
|---|---|
| Expand RBAC | Add `guardian` role with scoped permissions to existing auth system |
| Guardian connection model | Extend ConsentGrant table with `guardian_connection` type |
| Guardian invite flow | Email/SMS invitation with privacy disclosure |
| Guardian API routes | `/guardian/dashboard`, `/guardian/alerts`, `/guardian/timeline` |
| Trend engine | 14-day rolling window deviation detection across modalities |
| Alert generator | Template-based alert creation from validated trends |

### Phase 14B — Guardian Dashboard UI (Week 3–4)

| Task | Description |
|---|---|
| Guardian Dashboard page | React Native screen matching spec layout |
| Status widget | 5-tier status indicator with calm visual design |
| Alert card component | Expandable alert with acknowledge, conversation starter |
| Timeline component | Scrollable timeline with positive/negative event markers |
| Stability chart | 7-day trend graph component |
| Positive recognition | Dedicated section showing improvements |
| Conversation starters | Contextual, non-alarming conversation prompts |

### Phase 14C — Notification & Polish (Week 5–6)

| Task | Description |
|---|---|
| Email notification | SendGrid integration for digest and urgent alerts |
| Alert batching | Deduplication and batching logic |
| Sensitivity controls | Guardian-configurable alert frequency |
| Quiet hours | Time-windowed alert suppression |
| Transparency log UI | Both user and guardian can view access history |
| Audit trail | All guardian access events logged |

---

## 18. Future Enhancements

### Phase 15+ — Guardian Intelligence

| Enhancement | Description |
|---|---|
| Predictive trend forecasting | ML-based projection of behavioral trajectory |
| Guardian conversation coaching | AI-suggested conversation approaches based on behavioral context |
| Multi-guardian coordination | Shared guardian dashboards with role-based views |
| Clinician integration | Secure sharing of behavioral trends with authorized therapists |
| Guardian wellness check | Periodic check on guardian's own stress/wellbeing (they need support too) |
| Cultural adaptation | Localized alert language and conversation starter templates |
| Emergency contact escalation | Automatic notification chain if guardian doesn't acknowledge critical alert |
| Behavioral milestone celebrations | Recognition of sustained positive changes over months |

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| Behavioral baseline | 14-day rolling average of personal behavioral metrics |
| Contributing factors | Human-readable list of specific behavioral observations that triggered an alert |
| Dual consent | Requirement that both user and guardian explicitly approve data sharing |
| Life-event awareness | System capability to suppress alerts during known events (exam week, vacation) |
| Metadata-only | PRISM's core constraint — no message content, audio, video, or screenshots |
| Personal baseline | Individual's own historical patterns, never compared to population norms |
| Trend validation | Requirement that behavioral change is sustained (≥3 days) before alerting |
| Transparency log | User-visible record of all guardian data access events |

---

## Appendix B — Conversation Starter Templates

For each alert category, PRISM provides suggested conversation approaches:

| Scenario | Suggested Approach |
|---|---|
| Late-night screen time | "I noticed you've been up late — how are you feeling during the day?" |
| Reduced activity | "Want to go for a walk together this weekend?" |
| Sleep disruption | "I've noticed some changes in your sleep. Is anything on your mind?" |
| Social withdrawal | "I haven't seen you connect with friends much lately. Everything okay?" |
| General check-in | "Hey, I just wanted to check in. How's life been lately?" |
| Positive recognition | "I noticed things seem to be going well. That's great to see." |
| Routine improvement | "It looks like you're getting back into a good rhythm. How does it feel?" |

---

**Document Status**: DESIGN REVIEW — Ready for engineering review and implementation planning.

**Next Steps**:
1. Engineering review of detection thresholds and alert frequency targets
2. UX review of guardian dashboard wireframes
3. Privacy review of data access boundaries
4. Legal review of consent workflow for COPPA/GDPR compliance
5. Clinical advisor review of alert language and escalation criteria
