# PRISM Alert Language Specification

**Version**: 1.0  
**Status**: FROZEN for Phase 1 MVP  
**Effective Date**: 2026-07-23

---

## Executive Summary

This document defines how PRISM presents alerts to guardians. The core principle is **explainability without diagnosis**: every alert includes human-readable "contributing factors" explaining what changed, never claiming clinical labels or psychological conditions. Alerts are graded on a 3-tier system: **Sage** (baseline), **Amber** (attention), **Red** (high concern).

---

## Alert Philosophy

### What Alerts ARE
- 🟢 **Explainable**: Every alert includes specific reasons why (e.g., "Change in late-night keystroke timing (+30%)")
- 🟢 **Non-diagnostic**: Never claim a condition (no "depression", "anxiety", "ADHD", "suicidal ideation")
- 🟢 **Behavioral**: Describe deviations from the teen's own baseline, not population norms
- 🟢 **Actionable**: Suggest next steps for the guardian (e.g., "Consider checking in about their sleep")
- 🟢 **Transparent**: Teen sees the same alert framework as guardian

### What Alerts are NOT
- ❌ **Black-box**: No hidden machine learning scores without explanation
- ❌ **Diagnostic**: Never imply professional diagnosis
- ❌ **Alarming**: Language is calm, neutral, and respectful
- ❌ **Stigmatizing**: No labels that shame or blame the teen
- ❌ **Private**: Never breach teen's privacy by revealing specific app names or locations

---

## Alert Tier System

### Tier 1: Sage (Green) — Baseline Normal

**When**: No deviations detected; everything is within expected range

**Icon**: 🟢 Circle (peaceful, steady)

**Template**:
```
✅ All Quiet

Behavioral metrics are within your teen's typical range.
Last check: [timestamp]
Everything looks as expected.
```

**Examples**:
- "Sleep window (22:30–07:00) matches 7-day average."
- "Keystroke speed and app usage consistent with typical patterns."
- "No unusual location clustering detected."

**Guardian Action**: None required. This is a daily reassurance message.

**Frequency**: Optional (can opt-in to daily summaries or disable entirely)

---

### Tier 2: Amber (Yellow) — Attention Warranted

**When**: Noticeable deviation from baseline; warrants a gentle check-in

**Icon**: 🟡 Triangle (caution, gentle alert)

**Template**:
```
⚠️ [Brief Title]

[Supporting observation in plain language]

What changed:
• [Contributing factor 1]
• [Contributing factor 2]
• [Contributing factor 3]

Suggested next step:
[Concrete, non-alarming suggestion]

Teen's perspective:
[If teen has voluntary context, show it here]
```

**Examples**:

#### Example 1: Sleep Disruption
```
⚠️ Later Bedtime This Week

Your teen's sleep window has shifted later than usual.

What changed:
• Sleep started 1–2 hours later (average 23:30 → 01:00–02:00)
• Earlier rise time (06:30 → 05:30)
• Net sleep duration down by 2 hours/night

Suggested next step:
"Hey, I noticed you've been going to bed later. Everything okay? Anything keeping you up?"

Teen's perspective:
[Teen can add context: "Summer break, staying up with friends"]
```

#### Example 2: App Usage Pattern
```
⚠️ More Time in Social Media

Your teen has spent more time in social media apps this week.

What changed:
• Social media time increased 60% vs. last week (6h/day → 10h/day)
• Shift toward evening hours (19:00–01:00)
• Reduced productivity app usage (homework-related apps ↓ 30%)

Suggested next step:
"I noticed you've been on social media a lot. Want to talk about what's going on?"

Teen's perspective:
[Teen can add context: "Prepping for a photo shoot", "Scrolling to relax"]
```

#### Example 3: Typing Pattern Change
```
⚠️ Unusual Typing Rhythm

Your teen's keystroke patterns have changed noticeably.

What changed:
• Typing speed increased 40% (average 65 WPM → 91 WPM)
• More typing activity at night (23:00–02:00)
• Typing bursts longer than usual (20–30 sec → 1–2 min)

Suggested next step:
"Your typing patterns have changed lately. Are you working on a big project or just stressed about something?"

Teen's perspective:
[Teen can add context: "College essays", "Gaming with friends"]
```

**Guardian Actions**:
1. Read contributing factors
2. (Optional) View teen's context if they shared one
3. Send suggested conversation starter
4. Wait 1–2 days to observe if pattern continues
5. If Amber persists >3 days, may escalate to Red

**Frequency**: 1–3 per week (configurable)

---

### Tier 3: Red (Red) — High Concern

**When**: Sustained, severe deviations suggesting risk; requires prompt guardian action

**Icon**: 🔴 Circle (urgent, requires attention)

**Template**:
```
🔴 [Urgent Title]

[Brief, factual description of serious change]

What changed:
• [Contributing factor 1 — specific, quantified]
• [Contributing factor 2]
• [Contributing factor 3]

Immediate next steps:
1. [Direct conversation prompt]
2. [Resource link: hotline, counselor, etc.]
3. [Escalation option: contact PRISM support]

Teen's perspective:
[If available]
```

**Examples**:

#### Example 1: Sudden Immobility
```
🔴 Extreme Inactivity Alert

Your teen has been immobile for an extended period (7+ hours, 02:00–09:00).

What changed:
• No movement detected for 7 continuous hours
• Typical immobility window is 8 hours (sleep); this is unusual time of day
• Mobile app shows online but no interaction (unlocks every 2–3 hours)

Immediate next steps:
1. Check in directly: "Hey, just checking on you. Are you okay?"
2. If no response in 10 minutes, try calling or visiting
3. Resources: Crisis text line (text HOME to 741741), Suicide & Crisis Lifeline (988)

Teen's perspective:
[No recent context shared]

This pattern can indicate:
• Sleep disruption (all-nighter)
• Crisis or emotional distress
• Device left unattended

Learn more: When to escalate to professional support
```

#### Example 2: Companion Crisis Detection
```
🔴 Crisis Keywords Detected

Your teen mentioned concerning topics in a private conversation.

What changed:
• Hardcoded safety keywords detected in conversation
• Examples: "want to hurt myself", "everyone hates me", "no point"
• Detection is automatic and immediate (no LLM analysis)

Immediate next steps:
1. Reach out to your teen directly: "I care about you and want to understand what's going on."
2. Encourage professional support (school counselor, therapist)
3. Call the 988 Suicide & Crisis Lifeline for guidance
4. Resources: Crisis Text Line (text HOME to 741741)

Teen's perspective:
[Available in encrypted message from companion chat]

Next action:
We've also notified PRISM support. They will reach out within 1 hour.
```

#### Example 3: Multi-Factor Risk
```
🔴 Sustained Pattern Change

Multiple behavioral signals indicate elevated concern over 3+ days.

What changed:
• Sleep window disrupted: 4–5 hours/night (vs. normal 8–9)
• Keystroke speed doubled (concentration may be impaired)
• App usage shifted heavily to social media (14h+ daily, late-night peaks)
• Location: Stayed home 95% of time (vs. typical out 6 hours/day)

Immediate next steps:
1. Have an open conversation: "I've noticed several changes. I'm here if you want to talk."
2. Ask directly but non-judgmentally: "Are you struggling with something?"
3. Offer professional support (therapist, school counselor, pediatrician)
4. Crisis resources: 988 Lifeline, Crisis Text Line (text HOME to 741741)

Teen's perspective:
[If shared]

This pattern can indicate:
• Depression or mood disorder
• Anxiety or stress
• Substance use or sleep deprivation
• Social conflict or bullying

Important: These are behavioral deviations, not diagnoses. A qualified professional should evaluate.
```

**Guardian Actions**:
1. **Immediate** (next 10 minutes): Direct check-in with teen
2. **Within 1 hour**: Consider calling a crisis helpline for guidance
3. **Within 24 hours**: Schedule professional evaluation (counselor, pediatrician)
4. **Ongoing**: Monitor for continued pattern; escalate if worsens

**Frequency**: 0–1 per week (goal: avoid alert fatigue)

---

## Contributing Factors Format

All alerts (Sage, Amber, Red) include contributing factors. The format is:

### Standard Format

```
What changed:
• [Metric name]: [Old value] → [New value] ([% or absolute change])
• [Metric name]: [Old value] → [New value] ([% or absolute change])
• [Metric name]: [Specific observation]
```

### Quantification Rules

| Metric | Unit | Example |
|--------|------|---------|
| Sleep | Hours | "Sleep duration: 8h → 5h (↓ 38%)" |
| Typing | WPM or % | "Keystroke speed: 60 WPM → 85 WPM (↑ 42%)" |
| App usage | Hours or % | "Social media: 6h/day → 10h/day (↑ 67%)" |
| Location | Categories | "Time home: 60% → 95% (↑ 35 pp)" |
| Movement | Yes/No | "Immobility window: 8h → 7.5h (no change)" |
| App switches | Count | "App switches: 40/hour → 80/hour (↑ 100%)" |

### Never Include

❌ Raw GPS coordinates  
❌ Specific app names (only categories)  
❌ Text content from keyboard, chats, or messages  
❌ Psychological interpretations ("Your teen is depressed")  
❌ Percentage changes that are statistically insignificant (<10%)

---

## Language Guardrails

### Tone Checklist

Every alert message is reviewed for:

- [ ] **Calm**: Uses neutral, non-alarming language
- [ ] **Respectful**: Does not shame, blame, or judge the teen
- [ ] **Clear**: Uses simple words; no jargon
- [ ] **Accurate**: States only observed facts, no speculation
- [ ] **Actionable**: Suggests a concrete next step
- [ ] **Transparent**: Teen can see the same information

### Prohibited Phrases

❌ "Your teen is depressed."  
❌ "Suicidal behavior detected."  
❌ "Signs of substance abuse."  
❌ "Mental breakdown."  
❌ "Dangerous behavior."  
❌ "Severely abnormal."  
❌ "Your teen is a risk."  

### Recommended Phrases

✅ "Your teen's sleep pattern has changed."  
✅ "We noticed unusual activity at night."  
✅ "Changes in keystroke timing."  
✅ "App usage pattern shifted."  
✅ "Check in with your teen."  
✅ "Consider talking with a professional."  
✅ "Here are some resources."

---

## No-Alert Criteria

Alerts are NOT generated in these cases (even if anomalies exist):

| Scenario | Reason |
|----------|--------|
| One-time deviation | Single night of poor sleep; needs 3+ days to trigger |
| Known life event | Guardian or teen marked event (vacation, exam week, visiting relative) |
| Permission denied | Sensor data unavailable (not an anomaly) |
| Synthetic data only | MVP: no alerts from fake GSR/PPG generators |
| <10% deviation | Natural variance; statistcally insignificant |
| Within confidence interval | Anomaly model confidence <60% |
| Recent consent | First 7 days after consent (baseline-building period) |

---

## Alert Timing & Delivery

### Send Alert When
- Amber: Immediately upon detection (1–5 min delay acceptable)
- Red: Immediately upon detection (no delay; critical)
- Sage: Daily summary (optional; 06:00 UTC default)

### Do NOT Send Alert When
- Teen is sleeping (if known sleep window)
- Guardian is sleeping (if available)
- >3 identical alerts in same hour (batch into one)
- Alert fatigue detected (>5 alerts in one week; de-emphasize)

### Delivery Channels (MVP)
1. **Primary**: Dashboard inbox
2. **Secondary**: Email (daily digest, no real-time)
3. **Future**: SMS push notification, Slack

---

## Test Cases for Alert System

| Test | Input | Expected Alert | Contributing Factors |
|------|-------|---|---|
| Sleep disruption | Sleep: 9h → 4h for 3 days | Amber | "Sleep duration ↓ 56%", "Time to bed ↑ 2 hours" |
| Baseline day | Sleep 8h, typing 65 WPM, app usage normal | Sage | None; all normal |
| Crisis keywords | Companion: "I want to hurt myself" | Red | "Crisis keyword detected", "Immediate escalation" |
| One-time event | Late night (23:30 bedtime); next day 22:00 | No alert | "Insufficient data" |
| Permission denied | GPS permission revoked | No alert | "GPS collection disabled" |

---

## Crisis Escalation Flow

```
Teen mentions crisis keywords in companion chat
    ↓
Hardcoded classifier detects (regex + exact phrases)
    ↓
Red alert generated immediately
    ↓
Guardian notified (dashboard + email)
    ↓
PRISM system calls crisis hotline integration (future)
    ↓
Trusted adult notified (if available)
    ↓
Teen offered crisis resources (988 Lifeline, Crisis Text Line)
    ↓
Follow-up within 24 hours (wellness check)
```

---

## Alert Customization (Guardian Settings)

Guardians can customize:

- [ ] **Alert frequency**: Daily, weekly, or only critical
- [ ] **Alert tiers**: Show Sage/Amber/Red or Red-only
- [ ] **Contributing factors detail**: Detailed or summary-only
- [ ] **Delivery channels**: Email, dashboard, push, SMS
- [ ] **Quiet hours**: No alerts between [22:00–08:00]
- [ ] **Sensitivity**: Less frequent (conservative) or more frequent (sensitive)

**Example**: Guardian sets "weekly digest, Red-only, quiet hours 22:00–08:00"
→ Receives Red alerts immediately, Amber/Sage in weekly digest, no night alerts

---

## Companion Phrase Examples

All companion persona messages include:

1. **Disclosure**: "I'm an AI assistant, not a therapist or doctor."
2. **Support frame**: "I'm here to listen and help you think through this."
3. **No diagnosis**: "These feelings are valid. A real counselor can offer better support."
4. **Crisis escalation**: "If you're thinking of hurting yourself, please text 988 or call 988 Lifeline."

---

## Cross-References

- **MVP Scope**: [MVP-SCOPE.md](MVP-SCOPE.md)
- **Privacy Specification**: [PRIVACY-SPEC.md](PRIVACY-SPEC.md)
- **Sensor Specification**: [SENSORS.md](SENSORS.md)
- **Consent Lifecycle**: [CONSENT-LIFECYCLE.md](CONSENT-LIFECYCLE.md)
- **Design System**: [design-system.md](design-system.md)

---

**Signed Off By**:
- [ ] Product Lead
- [ ] UX/Design Lead
- [ ] Privacy Officer
- [ ] Mental Health Advisor (external consultant)

**Last Reviewed**: 2026-07-23  
**Next Review**: Upon Phase 1 completion or alert changes
