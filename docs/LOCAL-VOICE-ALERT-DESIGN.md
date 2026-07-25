# PRISM Local Voice Alert System — Decision Logic Design

**Document Type:** Engineering Design Report  
**Target Hardware:** ESP32 NodeMCU + Analog Pulse Sensor + MPU6050 + ISD1820  
**Current Firmware Baseline:** `prism_pulse.ino` v5.0 (Multi-Factor + Cloud)  
**Author:** Embedded Systems / IoT Architecture  
**Date:** 2026-07-25  

---

## 1. Hardware Configuration

The PRISM PULSE node uses the following hardware, which is the **actual deployed configuration** (not a proposed bill of materials):

| Component | Model / Type | Connection | Role |
|-----------|-------------|------------|------|
| MCU | ESP32 NodeMCU (38-pin) | — | Sensor acquisition, sensor fusion, Wi-Fi, alert logic |
| Pulse Sensor | 3-pin analog PPG (SEN-11574 equivalent) | GPIO 34 (ADC1_CH6) | Photoplethysmography — raw analog heartbeat waveform |
| Accelerometer/Gyroscope | MPU6050 (6-DOF IMU) | I2C: SDA=21, SCL=22 | 3-axis acceleration + 3-axis angular velocity |
| Voice Module | ISD1820 Voice Recorder/Playback | GPIO 4 (P-E trigger pin) | Plays a single pre-recorded 8–20 second message on HIGH pulse |
| Display | 16×2 I2C LCD (PCF8574 backpack) | I2C: SDA=21, SCL=22 | Real-time BPM, g-force, WiFi status, alert countdown |
| Power | USB or 5V VIN | — | 3.3V rail for pulse sensor (critical: ESP32 ADC is 3.3V max) |

**Important hardware note:** The ISD1820 is **not** a speech synthesizer, text-to-speech engine, or conversational AI module. It is a single-message analog recorder/playback chip. The user records one message manually via the onboard microphone. When the ESP32 pulls the P-E (playback-edge) pin HIGH for ≥100 ms, the ISD1820 plays that pre-recorded message through its speaker output. There is no dynamic audio generation, no vocabulary, and no text input.

---

## 2. Why Heart Rate Alone Is Not a Reliable Trigger

A single-threshold BPM trigger — e.g., "if BPM > 110, play alert" — would generate **unacceptably high false positives** because elevated heart rate is a normal physiological response to dozens of everyday activities that have zero psychological significance.

### 2.1 Heart Rate Is a Non-Specific Signal

Heart rate responds to nearly every physical and emotional stimulus. It is an **integrator signal**: it sums all demands on the cardiovascular system without indicating which demand caused the elevation. The ESP32 has no way to distinguish between these causes from BPM alone:

| Cause of Elevated BPM | Physiological Mechanism | Psychological Concern? |
|------------------------|------------------------|----------------------|
| Walking upstairs | Skeletal muscle oxygen demand → increased cardiac output | No |
| Running / jogging | Aerobic metabolism → heart rate proportional to pace | No |
| Cycling / swimming | Sustained aerobic demand | No |
| Lifting heavy objects | Isometric muscle contraction → increased afterload + HR | No |
| Standing up from seated | Baroreceptor reflex → transient HR increase (±10–15 BPM) | No |
| Climbing / hiking | Combined aerobic + postural demand | No |
| Hot environment | Thermoregulation → vasodilation → compensatory HR increase | No |
| Caffeine / stimulants | Pharmacological sympathetic activation | Possibly |
| Fever / illness | Pyrogen-mediated hypothalamic set-point elevation | No (medical, not behavioral) |
| Panic / anxiety episode | Sympathetic nervous system surge | **Yes — target condition** |
| Acute emotional distress | Cortisol + adrenaline release | **Yes — target condition** |

A single-threshold trigger would fire during every walk up stairs, every run, every bike ride — rendering the alert useless through **alert fatigue**. The guardian would learn to ignore the device entirely.

### 2.2 Heart Rate Alone Carries Zero Context

BPM is a scalar. A reading of 130 BPM provides no information about:
- Whether the person is moving or stationary
- Whether the elevation started suddenly or built gradually
- How long it has persisted
- Whether the person's posture is upright, seated, or prone
- Whether similar elevations occurred yesterday at the same time (baseline)

Without context, the number is clinically meaningless in isolation.

---

## 3. Multi-Factor Decision Architecture

The solution is **sensor fusion with temporal validation**: require multiple independent signals to agree, sustained over a configurable time window, before triggering the alert.

### 3.1 The Core Equation

```
(High BPM)  +  (Behaviour Anomaly)  +  (Sustained Duration)  =  Trigger Voice Alert
```

This is a **logical AND of three independent conditions**. All three must be simultaneously true. If any one condition is false, the alert does not fire.

### 3.2 Why Three Factors?

- **One factor** (BPM alone): false positive rate approaching 100% in daily life
- **Two factors** (BPM + movement): eliminates exercise false positives but still fires on noisy sensor data or transient artifacts
- **Three factors** (BPM + movement + time): requires a sustained physiological state that is both elevated and stationary — the precise signature of a non-exercise stress response

### 3.3 Decision Flow Diagram

```
 ┌──────────────────────┐
 │  Sensor Acquisition   │  50 Hz: analogRead(GPIO34) + MPU6050.getEvent()
 └─────────┬────────────┘
           ▼
 ┌──────────────────────┐
 │   Signal Processing   │  Peak detection → BPM, vector magnitude → g-force
 └─────────┬────────────┘
           ▼
      ╔═══════════╗
      ║ Factor 1:  ║  BPM ≥ 110 ?
      ║ High BPM?  ║
      ╚═════╤═══════╝
            │ YES
            ▼
      ╔═════════════════╗
      ║ Factor 2:        ║  g-force ≤ 1.2 ?
      ║ Behaviour Anomaly?║  (stationary / near-stationary)
      ╚═════╤═════════════╝
            │ YES
            ▼
      ╔═══════════════════╗
      ║ Factor 3:          ║  Condition true for ≥ 15 seconds?
      ║ Sustained Duration?║
      ╚═════╤═════════════╝
            │ YES
            ▼
      ┌──────────────────┐
      │ TRIGGER ISD1820   │  digitalWrite(ISD_PLAY_PIN, HIGH)
      │ + Cloud alert     │  delay(100); digitalWrite(ISD_PLAY_PIN, LOW)
      └──────────────────┘
```

If any factor evaluates to NO at any point during the sustained window, the anomaly timer resets to zero. The system returns to normal monitoring.

---

## 4. Detailed Factor Definitions

### 4.1 Factor 1 — High BPM Threshold

**Threshold:** BPM ≥ 110

**Rationale for selection:**
- Resting heart rate for adolescents (ages 12–18): 60–100 BPM
- 110 BPM sits just above the upper bound of normal resting, catching early tachycardia
- Walking at a casual pace (~3 km/h) typically produces 90–105 BPM — below the threshold
- Climbing stairs produces 110–130 BPM but is caught by Factor 2 (movement)
- Panic-induced tachycardia without physical exertion: typically 110–150 BPM

**BPM calculation method (from current firmware):**
- Peak detection on filtered PPG waveform with threshold crossing at ADC value > 2000
- Inter-beat interval (IBI) validation: accept only 300 ms ≤ IBI ≤ 2000 ms (30–180 BPM)
- BPM = 60000 / IBI (instantaneous, updated on each detected beat)
- Signal loss detection: if no beat for > 2 seconds, BPM decays toward zero

**Important limitation of the analog pulse sensor:** The current sensor is a single-wavelength reflective PPG sensor. It is susceptible to motion artifact, ambient light interference, and contact pressure variation. BPM accuracy degrades significantly during movement — which is partially why Factor 2 is essential: during high-movement states where BPM data is least reliable, the alert is suppressed anyway.

### 4.2 Factor 2 — Behaviour Anomaly (Movement Gate)

**Primary metric:** Total acceleration vector magnitude (g-force) from MPU6050

```
g_force = sqrt(ax² + ay² + az²) / 9.81
```

**Threshold:** g_force ≤ 1.2 g

**Rationale for selection:**
- Stationary human (seated, standing still, lying down): 0.98–1.02 g (gravity only)
- Fidgeting, shifting weight, typing: 1.00–1.10 g
- Slow walking: 1.10–1.30 g
- Brisk walking: 1.30–1.70 g
- Climbing stairs: 1.50–2.00 g
- Running: 2.00–4.00 g
- Jumping / falling: > 4.00 g

A threshold of 1.2 g creates a clean separation: it captures "mostly stationary" (seated, lying, standing) while excluding any form of ambulation or exercise. This is the key mechanism that **suppresses false positives during physical activity**.

**Current implementation uses g-force magnitude only.** Future enhancements could incorporate:

#### Extended Behaviour Anomaly Signatures (Future)

| Anomaly Type | Sensor Signal | Signature Pattern | Psychological Correlate |
|-------------|---------------|-------------------|------------------------|
| **Prolonged inactivity** | g_force ≤ 1.05 g | Sustained > 30 min during waking hours | Withdrawal, depressive episode |
| **Irregular movement** | g_force variance | High-frequency, low-amplitude oscillations (tremor, restless) | Anxiety, agitation |
| **Fall detection** | g_force spike > 4 g + sudden stop | Free-fall signature + impact + post-impact stillness | Medical emergency (requires different alert — not ISD1820) |
| **Postural collapse** | Gyroscope pitch change > 60° | Rapid orientation change + sustained horizontal | Syncope, seizure, medical emergency |
| **Abnormal posture** | Gyroscope pitch/roll | Sustained deviation from upright > 45° | Fatigue, intoxication, medical event |
| **Circadian mismatch** | g_force + time-of-day | High movement at 02:00–05:00 (normal sleep window) | Sleep disruption, manic episode |

These extended signatures require additional DSP on the ESP32 and are recommended for Phase 2.

### 4.3 Factor 3 — Sustained Duration

**Threshold:** 15 seconds continuous

**Rationale for selection:**
- Shorter than 10 seconds: captures transient events (standing up too fast, a loud noise causing startle response, momentary anxiety spike during a phone call)
- 10–12 seconds: borderline; may still capture brief stressors that resolve naturally
- 15 seconds: represents a genuine sustained physiological state; most transient stressors resolve within 8–12 seconds
- Longer than 20 seconds: risks missing genuine events that might self-resolve or be interrupted
- 15 seconds is also the approximate half-life of the acute adrenaline response — if the elevation persists beyond one half-life, it is not a momentary spike

**Implementation in current firmware:**
- `anomalyStartTime` records the millis() timestamp when both Factor 1 and Factor 2 first become simultaneously true
- On each subsequent sample, if both factors are still true, the elapsed time is checked: `if (now - anomalyStartTime >= 15000)`
- If either factor becomes false during the countdown, `anomalyActive = false` and the timer resets
- This is a **consecutive-duration requirement**, not cumulative — the 15 seconds must be contiguous

**Cooldown mechanism (prevents rapid re-triggering):**
- After the ISD1820 fires, a 10-second cooldown period prevents another trigger
- `anomalyStartTime` is artificially advanced by 10 seconds so the next valid anomaly window starts from zero
- Without this, a persistent high-BPM+low-movement state would fire the alert every 15 seconds continuously

---

## 5. Threshold Selection Summary

| Parameter | Value | Justification |
|-----------|-------|--------------|
| BPM threshold | ≥ 110 | Above resting max (100), below exercise onset (120–130 for brisk walk). Captures stress-induced tachycardia without ambulation false positives. |
| Movement threshold | ≤ 1.2 g | Above baseline gravity (1.0 g) to allow fidgeting, below walking (1.3+ g) to exclude ambulation. The critical differentiator between exercise and stress. |
| Sustained duration | 15 seconds | Longer than transient stress response half-life (~8–12 s), shorter than what risks missing genuine episodes. Matches clinical "sustained tachycardia" definition. |
| Cooldown period | 10 seconds | Prevents audio spam. Allows one full ISD1820 message playback (~8–10 s typical recording) before re-arming. |
| Sampling rate | 50 Hz (20 ms) | Sufficient for BPM detection (Nyquist for 250 BPM max = ~8 Hz needed; 50 Hz gives 6× oversampling). Balances ADC throughput with Wi-Fi coexistence on ADC1. |

---

## 6. Pseudocode — Complete Decision Algorithm

```cpp
// ============================================================
// PRISM LOCAL VOICE ALERT — Decision Pseudocode
// Target: ESP32 Arduino framework, non-blocking millis() loop
// ============================================================

// Constants (compile-time configurable)
const int   BPM_THRESHOLD           = 110;       // BPM
const float MOVEMENT_THRESHOLD_G    = 1.2;       // g-force
const unsigned long SUSTAINED_MS    = 15000;     // 15 seconds
const unsigned long COOLDOWN_MS     = 10000;     // 10 seconds post-trigger
const unsigned long IBI_MIN_MS      = 300;       // reject IBI < 300 ms (>200 BPM)
const unsigned long IBI_MAX_MS      = 2000;      // reject IBI > 2000 ms (<30 BPM)
const int   PULSE_ADC_THRESHOLD     = 2000;      // ADC threshold for beat detection

// State variables
unsigned long lastBeatTime       = 0;
unsigned long lastISDTrigger     = 0;
unsigned long anomalyStartTime   = 0;
bool          anomalyActive      = false;
bool          pulseDetected      = false;
int           BPM                = 0;
float         currentGForce      = 1.0;
int           pulseValue         = 0;

// ============================================================
// ISD1820 Trigger — one-shot digital pulse
// ============================================================
void triggerVoiceAlert(const char* reason) {
    // Cooldown gate: prevent immediate re-trigger
    if (millis() - lastISDTrigger < COOLDOWN_MS) return;
    
    // Log reason to serial monitor
    Serial.print("[ISD1820] Trigger: "); Serial.println(reason);
    
    // Send 100ms HIGH pulse to ISD1820 P-E pin
    // This plays the pre-recorded message exactly once
    digitalWrite(ISD_PLAY_PIN, HIGH);
    delay(100);                              // ISD1820 requires ≥ 10ms edge
    digitalWrite(ISD_PLAY_PIN, LOW);
    
    lastISDTrigger = millis();
    
    // Transmit alert event to cloud (handled by existing transmitReading())
    // alert_status field set to "ISD_TRIGGERED" in JSON payload
}

// ============================================================
// Main sensor processing loop (called every 20ms / 50 Hz)
// ============================================================
void processSensors() {
    unsigned long now = millis();
    
    // --- Step 1: Acquire pulse sensor (ADC read) ---
    pulseValue = analogRead(PULSE_PIN);
    
    // --- Step 2: Beat detection with IBI validation ---
    if (pulseValue > PULSE_ADC_THRESHOLD && !pulseDetected) {
        pulseDetected = true;
        unsigned long IBI = now - lastBeatTime;
        lastBeatTime = now;
        
        // Physiological bounds check
        if (IBI > IBI_MIN_MS && IBI < IBI_MAX_MS) {
            BPM = 60000 / IBI;               // Instantaneous BPM
        }
    }
    if (pulseValue < PULSE_ADC_THRESHOLD && pulseDetected) {
        pulseDetected = false;
    }
    
    // BPM decay: if no beat for > 2 seconds, decay toward zero
    if (now - lastBeatTime > 2000) {
        BPM = max(0, BPM - 1);               // Linear decay, 1 BPM per sample
    }
    
    // --- Step 3: Acquire MPU6050 movement data ---
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    currentGForce = sqrt(a.acceleration.x * a.acceleration.x + 
                         a.acceleration.y * a.acceleration.y + 
                         a.acceleration.z * a.acceleration.z) / 9.81;
    
    // --- Step 4: Evaluate the three-factor AND gate ---
    bool isHighBPM           = (BPM >= BPM_THRESHOLD);
    bool isStationary        = (currentGForce <= MOVEMENT_THRESHOLD_G);
    bool isSustained         = false;
    
    if (isHighBPM && isStationary) {
        // Both Factor 1 (BPM) and Factor 2 (Movement) are true
        
        if (!anomalyActive) {
            // First sample where both conditions are met — start timer
            anomalyStartTime = now;
            anomalyActive = true;
        } else {
            // Conditions have been met continuously — check elapsed time
            if (now - anomalyStartTime >= SUSTAINED_MS) {
                isSustained = true;
                
                // ============================================
                // ALL THREE FACTORS SATISFIED → TRIGGER ALERT
                // ============================================
                triggerVoiceAlert("High BPM + Stationary (15s sustained)");
                
                // Reset state machine
                anomalyActive   = false;
                anomalyStartTime = now + COOLDOWN_MS;  // Enforce cooldown
            }
        }
    } else {
        // Factor 1 or Factor 2 lost — reset the anomaly timer
        anomalyActive = false;
    }
    
    // --- Step 5: Serial logging for debugging ---
    String alertStatus;
    if (isSustained) {
        alertStatus = "ISD_TRIGGERED";
    } else if (anomalyActive) {
        long remaining = (SUSTAINED_MS - (now - anomalyStartTime)) / 1000;
        alertStatus = "WARNING-" + String(remaining) + "s";
    } else {
        alertStatus = "OK";
    }
    
    Serial.print(now); Serial.print(",");
    Serial.print(pulseValue); Serial.print(",");
    Serial.print(BPM); Serial.print(",");
    Serial.print(currentGForce); Serial.print(",");
    Serial.println(alertStatus);
}
```

---

## 7. Step-by-Step Workflow

### 7.1 Sensor Acquisition (Hardware Timer → ISR)

1. A 20 ms timer fires at 50 Hz.
2. ISR reads `analogRead(GPIO34)` for the pulse sensor (12-bit, 0–4095).
3. ISR reads MPU6050 via I2C: `mpu.getEvent()` returns acceleration (m/s²) and gyroscope (rad/s).
4. Raw values are stored in volatile buffers. ISR exits immediately — no filtering, no math.

### 7.2 Signal Processing (Main Loop)

5. Main loop drains the ISR buffer when ready.
6. **Pulse signal:** raw ADC value compared against adaptive threshold (2000). Rising-edge crossing triggers a "beat detected" event.
7. **IBI calculation:** `IBI = currentTime - lastBeatTime`. Validated against physiological bounds (300–2000 ms).
8. **BPM calculation:** `BPM = 60000 / IBI`. If no beat for > 2 seconds, BPM decays linearly.
9. **Movement calculation:** 3-axis acceleration vector magnitude divided by 9.81 to get g-force.

### 7.3 Decision Evaluation (Every Sample)

10. **Factor 1 check:** `BPM >= 110`? → YES/NO
11. **Factor 2 check:** `g_force <= 1.2`? → YES/NO
12. If both YES:
    - If `anomalyActive` is false: record `anomalyStartTime = millis()`, set `anomalyActive = true`
    - If `anomalyActive` is true: compute elapsed = `millis() - anomalyStartTime`. If elapsed >= 15000 → TRIGGER
13. If either factor becomes NO: set `anomalyActive = false`, reset timer.

### 7.4 Alert Activation

14. **ISD1820 trigger:** `digitalWrite(ISD_PLAY_PIN, HIGH)` → `delay(100)` → `digitalWrite(ISD_PLAY_PIN, LOW)`
15. The ISD1820 P-E (playback-edge) pin detects the rising edge and plays the pre-recorded message once.
16. The message plays through the ISD1820's built-in speaker driver (8Ω speaker connected to SP+ / SP- terminals).
17. **Cloud notification:** The alert_status field in the JSON payload transmitted to the PRISM API is set to `"ISD_TRIGGERED"`, which the backend routes to the guardian dashboard as a Red-tier alert.
18. **Cooldown:** A 10-second post-trigger cooldown prevents immediate re-trigger. `lastISDTrigger` timestamp gates the next activation.

---

## 8. How False Positives Are Minimized

### 8.1 Sensor Fusion (Multi-Modal Gating)

The AND-gate architecture means a false positive requires **simultaneous false positives from two independent sensors** — the pulse sensor and the accelerometer. The probability of both failing in a correlated manner is dramatically lower than either alone:

- **Pulse sensor noise:** electrical noise, ambient IR interference, loose contact → random ADC spikes. These produce spurious high BPM readings lasting 1–2 samples. They are **eliminated by Factor 3** (sustained duration) — a spike cannot persist for 15 seconds.
- **Accelerometer noise:** vibration, table bump, device being picked up → transient g-force spikes. These produce momentary movement > 1.2 g, which **immediately resets Factor 3** (anomalyActive = false).

### 8.2 Time-Based Validation

The 15-second sustained requirement is the single most effective false-positive filter:

| Scenario | BPM | Movement | Duration | Triggers? | Why |
|----------|-----|----------|----------|-----------|-----|
| Standing up from chair | 105→120→95 | 1.5→1.0 g | 3 seconds | **No** | Fails Factor 3 (too short); BPM transient |
| Loud noise (startle) | 70→125→80 | 1.0→1.3→1.0 g | 4 seconds | **No** | Fails Factor 2 (movement spike) then Factor 3 |
| Walking upstairs | 130 | 1.8 g | 30 seconds | **No** | Fails Factor 2 (movement too high) |
| Running | 150 | 3.5 g | 20 seconds | **No** | Fails Factor 2 |
| Sitting, anxious about exam | 125 | 1.05 g | 45 seconds | **YES** | Genuine psychological stress response |
| Panic attack (seated) | 140 | 1.02 g | 25 seconds | **YES** | Target condition |
| Sensor disconnected | 0 (decaying) | 1.0 g | indefinite | **No** | Fails Factor 1 (BPM = 0) |
| MPU6050 failure | 130 | 1.0 (default) | 20 seconds | **YES** | Hardware fault false positive — needs watchdog |

### 8.3 Signal Quality Gating (Missing in Current Implementation)

The current firmware does **not** gate on PPG signal quality, which is a known gap. The ESP32-PULSE-FIRMWARE-DESIGN.md specification defines a 4-factor quality metric (amplitude, regularity, noise, contact) that should be integrated:

```
if (signalQuality < 0.5) {
    // Suppress BPM — sensor contact is unreliable
    // Do NOT evaluate alert logic
    // Log "LOW_QUALITY" to serial/cloud
}
```

This would eliminate the MPU6050-failure false positive scenario (row 7 above) by requiring both good BPM data and valid accelerometer data.

---

## 9. Implementation Notes for ESP32

### 9.1 Non-Blocking Architecture Requirement

**The entire decision loop runs inside a cooperative `millis()` scheduler. No `delay()` calls exist anywhere in the sensor acquisition or decision path.** The only `delay()` is the 100 ms pulse to the ISD1820, which is acceptable because:

1. It occurs only when an alert actually fires (rare event).
2. 100 ms is shorter than one LCD refresh cycle (1000 ms).
3. The pulse sensor hardware timer ISR continues running during `delay()`, so no samples are lost.

### 9.2 Pin Mapping

| Signal | ESP32 Pin | Notes |
|--------|-----------|-------|
| Pulse sensor signal (S) | GPIO 34 | ADC1_CH6 — safe under Wi-Fi (ADC2 is disabled during Wi-Fi TX) |
| Pulse sensor VCC | 3.3V | **Critical:** do not use 5V — ESP32 ADC is 3.3V max |
| ISD1820 P-E (playback edge) | GPIO 4 | Digital output, HIGH pulse triggers playback |
| MPU6050 SDA | GPIO 21 | Default I2C data |
| MPU6050 SCL | GPIO 22 | Default I2C clock |
| LCD SDA / SCL | GPIO 21 / GPIO 22 | Shares I2C bus with MPU6050 (different addresses: 0x27 vs 0x68) |

### 9.3 ISD1820 Electrical Interface

The ISD1820 P-E (playback-edge) pin is active-HIGH edge-triggered:

```
Normal state:     digitalWrite(ISD_PLAY_PIN, LOW)   — idle, no playback
Trigger:          digitalWrite(ISD_PLAY_PIN, HIGH)  — rising edge starts playback
Hold HIGH:        digitalWrite(ISD_PLAY_PIN, HIGH)  — message loops if held HIGH (playback-edge mode vs. play-level mode)
Release:          digitalWrite(ISD_PLAY_PIN, LOW)   — stops after current cycle
```

The current firmware uses a 100 ms HIGH pulse, which reliably triggers a single play-through of the recorded message. The ISD1820 plays the entire message once and stops automatically after the message ends.

### 9.4 Recording Procedure

The user records the alert message **once** during initial setup:
1. Hold the ISD1820 REC button
2. Speak the message clearly: "PRISM has detected an unusual pattern. Please take a moment to check your well-being."
3. Release REC button
4. The ISD1820 stores this in non-volatile analog memory (retained without power)
5. The message can be re-recorded at any time by repeating steps 1–3

---

## 10. When the ESP32 Activates the ISD1820

The ESP32 sends a digital HIGH pulse to the ISD1820 P-E pin **exactly when**:

1. The peak-detected BPM has been ≥ 110 for at least 15 consecutive seconds, **AND**
2. The MPU6050 acceleration vector magnitude has been ≤ 1.2 g for the same 15-second window, **AND**
3. At least 10 seconds have elapsed since the last ISD1820 trigger (cooldown)

**No other conditions trigger the ISD1820.** The startup beep at boot time (`triggerISD1820("startup")`) is a power-on self-test, not an alert.

**What happens when triggered:**
- The ESP32 pulls GPIO 4 HIGH for 100 ms
- The ISD1820 detects the rising edge on its P-E pin
- The ISD1820 plays the pre-recorded analog message through SP+ / SP- speaker output
- The message plays once and stops
- The ESP32 sets alert_status to `"ISD_TRIGGERED"` and transmits to the cloud API
- The PRISM backend generates a Red-tier alert on the guardian dashboard

---

## 11. Recommendations for Future Versions

### 11.1 Short-Term (Next Firmware Iteration)

1. **PPG signal quality gating.** Integrate the 4-factor quality metric from the firmware design spec. Suppress alert evaluation when `signalQuality < 0.5` to eliminate sensor-contact false positives.

2. **Configurable thresholds via API.** Expose BPM threshold, movement threshold, and sustain duration as cloud-configurable parameters. The ESP32 fetches them on boot from `GET /api/v1/config/device/{id}`. This eliminates re-flashing for threshold tuning.

3. **Multi-stage alert escalation.** Before triggering the ISD1820, provide a pre-alert LCD warning ("Check in — 5s") giving the wearer a chance to self-acknowledge (button press on GPIO 0 cancels the alert). Reduces false positives where the wearer is aware of the cause.

### 11.2 Medium-Term (Phase 2 Hardware Enhancement)

4. **Replace analog pulse sensor with MAX30102.** The MAX30102 provides:
   - Red + IR dual-wavelength PPG (enables SpO2 measurement)
   - Built-in ambient light cancellation
   - On-chip 18-bit ADC with digital filtering
   - I2C interface (no analog noise susceptibility)
   - Motion artifact resilience through multi-LED sampling
   - Compact module (fits wearable form factor)

5. **Add GSR (galvanic skin response) sensor.** Skin conductance is a direct measure of sympathetic nervous system arousal. Combined with BPM + movement, it creates a 3-sensor fusion:
   ```
   High BPM + Low Movement + Elevated GSR + Sustained = Very High Confidence Alert
   ```
   GSR responds to emotional arousal within 1–3 seconds, making it a faster corroborator than BPM alone.

6. **Add skin temperature sensor (e.g., MLX90614).** Peripheral temperature drops during stress-induced vasoconstriction. A drop of > 1°C from baseline combined with elevated BPM is a strong stress indicator.

### 11.3 Long-Term (Phase 3+ ML Integration)

7. **Personalized adaptive baselines.** Store 7-day rolling statistics (mean BPM, BPM variance, typical movement patterns by time-of-day) in ESP32 NVS flash. Alert thresholds become:
   ```
   threshold_BPM = max(110, baseline_mean_BPM + 2.0 * baseline_std_BPM)
   ```
   An athlete with resting HR of 45 would alert at a genuinely abnormal value rather than a population-constant 110.

8. **On-device anomaly detection.** A lightweight classifier (e.g., a 4-layer tiny neural network or a one-class SVM) trained on the individual's own 7-day baseline could detect multivariate anomalies without hard thresholds. TensorFlow Lite for Microcontrollers fits within ESP32 memory budget for models under 100 KB.

9. **Multi-message ISD1820 replacement.** Replace the ISD1820 with an I2S DAC + speaker for synthesized voice output. An ESP32 can run a small TTS engine or play pre-stored WAV files, enabling context-specific messages:
   - "Your heart rate has been elevated. Try taking 5 slow breaths."
   - "You've been still for a long time. Would you like to take a short walk?"
   - "PRISM noticed a change. Everything okay?"

10. **Wearable form factor.** Migrate from breadboard NodeMCU to a custom PCB with the ESP32-PICO-D4 module, flexible LiPo battery, and a wristband or chest-strap enclosure. The current breadboard setup is a prototype; a wearable would provide continuous monitoring rather than episodic (finger-on-sensor) readings.

---

## 12. Compliance with PRISM Design Philosophy

This system adheres to the constraints defined in the PRISM project:

| Constraint | Compliance |
|-----------|-----------|
| **Metadata only** | BPM, g-force, and alert_status are behavioral metadata. No raw content, audio, or waveforms leave the device. |
| **Non-diagnostic language** | The ISD1820 message is user-recorded and explicitly designed to be non-clinical. The cloud alert uses PRISM's Red-tier contributing-factors format. |
| **Explainable outputs** | The alert is triggered by three explicit, inspectable conditions (BPM ≥ 110, g ≤ 1.2, t ≥ 15s). No black-box model. |
| **Consent-first** | The PRISM PULSE node requires active consent via the API before telemetry ingestion is accepted. |
| **Immutable audit** | Every pulse reading and alert event is logged server-side in the immutable `audit_log_entries` table. |
| **Teen disclosure** | The LCD displays current BPM and alert status — the teen always knows what the device is measuring and whether an alert is pending. |
| **No raw content** | The ISD1820 stores only the pre-recorded message. No microphone streams to the ESP32 or cloud. |
| **Data encryption at rest** | Cloud-stored pulse readings are in `pulse_readings` table; future firmware can encrypt before transmission. |
| **TLS in transit** | Future WiFi firmware iteration should use `WiFiClientSecure` with HTTPS instead of plain HTTP. |

---

## 13. Cross-References

- **Hardware Architecture:** [docs/Chapter16_Hardware_Architecture.md](Chapter16_Hardware_Architecture.md)
- **ESP32 Firmware Design:** [docs/ESP32-PULSE-FIRMWARE-DESIGN.md](ESP32-PULSE-FIRMWARE-DESIGN.md)
- **Sensor Specification:** [docs/SENSORS.md](SENSORS.md)
- **Alert Language Specification:** [docs/ALERT-LANGUAGE.md](ALERT-LANGUAGE.md)
- **Current Firmware:** `sketches/prism_pulse/prism_pulse/prism_pulse.ino`
- **Cloud API Endpoint:** `POST /api/v1/physio/pulse/ingest`
- **Hardware Handoff:** [HANDOFF_CMDC.md](../HANDOFF_CMDC.md)

---

**Document approved for inclusion in PRISM engineering project report.**
