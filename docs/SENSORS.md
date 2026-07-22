# PRISM Sensor Specification

**Version**: 1.0  
**Status**: FROZEN for Phase 1 MVP  
**Effective Date**: 2026-07-23

---

## Executive Summary

This document defines all sensors collected by PRISM in Phase 1 MVP, their sampling rates, data retention, and permission models. The rule is **metadata only**: PRISM never captures raw content (text, audio, video, images, screenshots). All collected data undergoes feature extraction immediately; raw waveforms and original readings are discarded unless explicitly marked for retention.

---

## Sensor Matrix

| Sensor | Type | Sampling | Retained | Permission | Notes |
|--------|------|----------|----------|-----------|-------|
| GPS (Location) | Behavioral | 1/min | 90 days | `ACCESS_FINE_LOCATION` | Lat/long/accuracy only |
| Keystroke Timing | Behavioral | 1/event | 90 days | `GET_TASKS` | Inter-keystroke intervals; no content |
| App Usage | Behavioral | 1/switch | 90 days | `GET_USAGE_STATS` | Category + duration; no content |
| Accelerometer | Behavioral | 10 Hz | 3 days | `BODY_SENSORS` | Raw X/Y/Z; discarded after feature extraction |
| Screen State | Behavioral | 1/event | 90 days | Device API | Lock/unlock, on/off |
| Sleep Window | Derived | Continuous | 90 days | Composite | Calculated from accel + screen + typing |
| GSR (Galvanic Skin Response) | Physiological | 4 Hz | 24 hours | `BODY_SENSORS` (future) | **Synthetic generator in MVP** |
| PPG (Photoplethysmography) | Physiological | 1 Hz | 24 hours | `BODY_SENSORS` (future) | **Synthetic generator in MVP** |
| Voice Embedding | Physiological | 1/session | 7 days | `RECORD_AUDIO` | Speaker ID only; audio discarded immediately |

---

## Behavioral Sensors

### 1. Location (GPS)

**What is captured:**
- Latitude (decimal degrees)
- Longitude (decimal degrees)
- Horizontal accuracy (meters)
- Timestamp (UTC)
- **NOT captured**: Altitude, bearing, speed, address labels

**Sampling:**
- Interval: 60 seconds when app is active
- When off: Ingestion stops immediately on app close (no background collection)

**Data retention:**
- Raw GPS readings: 90 days
- Derived location clusters (home, school): Indefinite (unless deleted by user)

**Permission Model:**
- **Android**: `android.permission.ACCESS_FINE_LOCATION`
- **iOS**: `CLLocationManager.accuracyAuthorization == .fullAccuracy`
- **Guardian visibility**: Street-level clustering only ("Home", "School", "Other"); never individual lat/long shown

**Fallback:**
- If location permission denied or unavailable: skip collection (do not synthesize)
- No location data = no location anomalies alerted

---

### 2. Keystroke Timing

**What is captured:**
- **Inter-keystroke interval (milliseconds)**: Time between key-up and key-down events
- Timestamp of event
- Input field type (text, password, email, URL, number) — no content
- **NOT captured**: What was typed, copied, pasted, or any string content

**Sampling:**
- Event-driven: Captured every keystroke
- Aggregation: Sent as batches every 30 seconds or when 100 keystrokes accumulated

**Data retention:**
- Raw keystroke intervals: 90 days
- Derived typing-speed metrics: Indefinite

**Permission Model:**
- **Android**: `android.permission.GET_TASKS` (task stack inspection)
- **iOS**: `UIApplication.shared.windows` (input state observation)
- **Guardian visibility**: "Typing speed changed" or "Late-night typing detected" — no actual intervals shown

**Fallback:**
- If keyboard access denied: skip collection
- External keyboards (Bluetooth): Not captured (only on-device keyboards instrumented)

---

### 3. App Usage

**What is captured:**
- **App package name or bundle ID**: Identifier of running app
- **Category**: Inferred from package name (Social, Messaging, Games, Productivity, Entertainment, etc.)
- **Event type**: `OPEN`, `CLOSE`, `BACKGROUND`, `FOREGROUND`
- **Duration**: Seconds app was in foreground
- **Timestamp**: UTC
- **NOT captured**: App content, notifications, messages, in-app behavior

**Sampling:**
- Event-driven: Captured on every app switch
- Aggregation: Sent as batches every 60 seconds

**Data retention:**
- Raw app events: 90 days
- Derived app-usage categories (% time in Social vs. Gaming): 90 days
- Risk registry matches: Indefinite (for compliance)

**Permission Model:**
- **Android**: `android.permission.GET_USAGE_STATS` (requires explicit user grant)
- **iOS**: `DeviceActivityNames` (Screen Time API; requires parental consent)
- **Guardian visibility**: Time spent in categories ("30% in Social", "2 hours gaming"); not individual app names

**Fallback:**
- If permission denied: skip app usage collection
- Work profile apps (Android): Not captured in personal profile

---

### 4. Device Accelerometer

**What is captured:**
- **X, Y, Z acceleration vectors** (m/s²) at 10 Hz sampling
- Timestamp (milliseconds since epoch)
- Device orientation (portrait/landscape) for context
- **NOT captured**: Gyroscope, magnetometer, or other motion sensors

**Sampling:**
- Continuous while app is active
- 10 Hz = 600 samples/minute = 36,000 samples/hour

**Data retention:**
- Raw accelerometer readings: **3 days only** (high data volume)
- Derived stillness/movement metrics: 90 days
- Example: "Immobile for 8 hours starting 23:00" (summary)

**Feature Extraction:**
- **Stillness score**: Variance of acceleration over 60-second windows
- **Movement index**: High-acceleration peaks per hour
- Used for sleep-window inference and anomaly detection

**Permission Model:**
- **Android**: `android.permission.BODY_SENSORS`
- **iOS**: `CMMotionManager` (no explicit permission required but disclosed in consent flow)

**Fallback:**
- If permission denied: Use screen-off + keystroke gaps as proxy for sleep (less accurate)

---

### 5. Screen State

**What is captured:**
- **Event type**: `SCREEN_ON`, `SCREEN_OFF`, `DEVICE_LOCKED`, `DEVICE_UNLOCKED`
- **Timestamp**: UTC with millisecond precision
- **Duration**: Milliseconds since last state change
- **NOT captured**: What appeared on screen, notifications, or any visual content

**Sampling:**
- Event-driven: Triggered immediately on state change
- No batching; each event sent separately

**Data retention:**
- Raw screen events: 90 days
- Derived "sleep window" (off + locked): 90 days

**Permission Model:**
- **Android**: System broadcast receiver (no explicit permission)
- **iOS**: `UIApplicationDelegate.applicationDidBecomeActive()` (no permission)

**Fallback:**
- Screen state is always available; no fallback needed

---

## Physiological Sensors (MVP = Synthetic)

### 6. GSR (Galvanic Skin Response)

**What is captured (Phase 1 MVP):**
- **Synthetic mock readings** simulating GSR response (~0.1 to 100 microsiemens)
- Timestamp (UTC)
- **Sampling Rate**: 4 Hz (every 250 ms)
- **NOT captured**: Actual biological signals

**Sampling:**
- Continuous while app is active (simulated)
- When permission granted (future): Real hardware readings from PRISM Node wearable

**Data retention:**
- Synthetic readings: Discarded after feature extraction (do not retain raw)
- Derived GSR stats (mean, std-dev per minute): 24 hours only

**Feature Extraction:**
- Mean GSR per minute
- Std-dev of GSR per minute
- Peak GSR events (>X microsiemens)
- Used for arousal/stress inference

**Permission Model:**
- **Android (Future)**: `android.permission.BODY_SENSORS` (for real hardware)
- **iOS (Future)**: HealthKit `HKQuantityTypeIdentifierElectrodermalActivity`
- **MVP**: No permission required (synthetic only)

**Fallback:**
- If hardware unavailable or permission denied: Use synthetic generator
- Never fall back to null (always provide synthetic baseline)

---

### 7. PPG (Photoplethysmography)

**What is captured (Phase 1 MVP):**
- **Synthetic mock heart-rate readings** (simulating HR 50–180 bpm)
- Derived **inter-beat intervals** (milliseconds between heartbeats)
- Timestamp (UTC)
- **Sampling Rate**: 1 Hz (every 1 second)
- **NOT captured**: Raw photoplethysmographic waveforms

**Sampling:**
- Continuous while app is active (simulated)
- When hardware available (future): Camera-based PPG or dedicated wearable sensor

**Data retention:**
- Synthetic readings: Discarded after feature extraction
- Derived HRV stats (SDNN, RMSSD): 24 hours only
- **Heart rate does NOT appear in alerts** (privacy: too personal for guardians in MVP)

**Feature Extraction:**
- Heart rate (beats per minute)
- SDNN (standard deviation of normal-to-normal intervals)
- RMSSD (root mean square of successive differences)
- Used for stress/arousal inference (guardian never sees raw HR)

**Permission Model:**
- **Android (Future)**: `android.permission.BODY_SENSORS`
- **iOS (Future)**: HealthKit `HKQuantityTypeIdentifierHeartRate`
- **MVP**: No permission required (synthetic only)

**Fallback:**
- If hardware unavailable or permission denied: Use synthetic generator
- Never fall back to null

---

### 8. Voice Embedding (Speaker ID)

**What is captured:**
- **Speaker embedding vector**: 512-dimensional fixed-size representation of speaker identity
- Timestamp (UTC)
- Session duration (seconds)
- **Audio itself**: Completely discarded immediately after embedding extraction
- **NOT captured**: Speech content, emotion, words, tone, or any linguistic information

**Sampling:**
- Event-driven: Triggered on voice check-in (teen initiates voice session with companion)
- One embedding per voice session

**Data retention:**
- Raw audio: Deleted immediately after embedding extraction (never stored)
- Speaker embeddings: 7 days
- Used only for speaker verification (confirm teen is the same person across sessions)

**Feature Extraction:**
- Speaker identity confidence (0–1 score)
- Speaker consistency check (alert if different person detected)
- **NOT extracted**: Emotion, stress, sentiment, or any psychological trait

**Permission Model:**
- **Android**: `android.permission.RECORD_AUDIO`
- **iOS**: `NSMicrophoneUsageDescription` (with explicit prompt)
- **Guardian visibility**: "Teen completed voice check-in" only; no audio or embedding shown

**Fallback:**
- If permission denied: Text-only companion mode (no voice sessions)
- If embedding extraction fails: Retry on next check-in

---

## Derived Sensors

### 9. Sleep Window (Calculated)

**What is captured:**
- **Inferred sleep window**: Start timestamp, end timestamp, confidence (0–1)
- Calculation method: Composite of accelerometer stillness + screen-off + keystroke gaps
- **NOT captured**: Actual sleep stage (MVP: binary "asleep/awake" only)

**Calculation:**
- Stillness: Acceleration variance < threshold for 60+ minutes
- Screen-off: Device locked for 60+ minutes
- Typing gap: No keystrokes for 120+ minutes
- **Rule**: If all 3 signals agree, mark as probable sleep

**Data retention:**
- Inferred sleep windows: 90 days
- Used for anomaly detection ("Unusual sleep pattern detected")

**Confidence Scoring:**
- High (0.8–1.0): All 3 signals confirm
- Medium (0.5–0.8): 2 of 3 signals confirm
- Low (<0.5): 1 of 3 signals confirm; not used for alerts

---

## Sensor Exclusion List

The following sensors are **explicitly NOT collected** (even if available):

- ❌ **Gyroscope**: Rotation-based activity (too precise for gesture inference)
- ❌ **Magnetometer/Compass**: Bearing and orientation
- ❌ **Ambient Light Sensor**: Room brightness (privacy risk)
- ❌ **Temperature/Humidity**: Environmental context
- ❌ **Barometer**: Altitude (location privacy)
- ❌ **Microphone**: Audio content (voice embedding only, audio discarded immediately)
- ❌ **Camera**: Photo/video content (any frames)
- ❌ **NFC/Bluetooth Scanning**: Device discovery
- ❌ **WiFi Scanning**: Network names and MAC addresses
- ❌ **Clipboard**: Pasted content
- ❌ **Installed App List**: Package names of non-running apps
- ❌ **Browser History**: URLs visited
- ❌ **Call/SMS Logs**: Call duration, recipient, message content
- ❌ **Contact List**: User's contacts
- ❌ **Calendar Events**: Appointment content
- ❌ **Email/Messages**: Any message content

---

## Data Volume Estimates

| Sensor | Events/Hour | Bytes/Event | Storage/Day |
|--------|-------------|-------------|------------|
| GPS | 60 | 50 | ~72 MB |
| Keystroke | ~3,000 | 20 | ~1.4 GB |
| App Usage | ~30 | 100 | ~72 MB |
| Accelerometer | 36,000 | 50 | ~1.7 GB |
| Screen | ~50 | 30 | ~36 MB |
| GSR (synthetic) | 14,400 | 30 | ~1 GB |
| PPG (synthetic) | 3,600 | 20 | ~172 MB |
| **TOTAL** | — | — | **~4.5 GB/day per teen** |

**Retention Cost**: 4.5 GB/day × 90 days = **405 GB per teen per 90-day window**

---

## Sensor Permission Flow (Android Example)

```
Onboarding
    ↓
[Teen sees monitored metrics list]
    ↓
[Teen grants consent]
    ↓
[Guardian grants consent]
    ↓
[App requests permissions from OS]
    - Location (GPS)
    - GET_USAGE_STATS
    - BODY_SENSORS
    - RECORD_AUDIO
    ↓
[Sensor collection begins]
```

**Important**: Permissions are requested AFTER dual consent, not before.

---

## Sensor Fallback Strategy

| Sensor | Permission Denied | Behavior |
|--------|---|---|
| GPS | Skip collection; no location anomalies | Continue other sensors |
| Keystroke | Use accelerometer/screen as proxy | Continue other sensors |
| App Usage | Skip collection | Continue other sensors |
| Accelerometer | Use screen-off + keystroke gaps for sleep | Reduced accuracy |
| Screen | (Always available) | N/A |
| GSR | Use synthetic generator | MVP uses synthetic anyway |
| PPG | Use synthetic generator | MVP uses synthetic anyway |
| Voice | Disable voice check-in; text-only mode | Teen can still chat |

---

## Cross-References

- **Privacy Specification**: [PRIVACY-SPEC.md](PRIVACY-SPEC.md)
- **MVP Scope**: [MVP-SCOPE.md](MVP-SCOPE.md)
- **Architecture**: [architecture.md](architecture.md)
- **Android Permissions**: [PRD.md](PRD.md#permissions)

---

**Signed Off By**:
- [ ] Privacy Officer
- [ ] Engineering Lead
- [ ] Platform Lead (Android/iOS)

**Last Reviewed**: 2026-07-23  
**Next Review**: Upon Phase 1 completion
