# ESP32 Pulse System — Firmware Design Document

**Project:** PRISM — Phase 2 (ESP32 Pulse System)
**Document Type:** Firmware Architecture & Engineering Specification
**Status:** Design Freeze — Ready for Implementation
**Platform:** ESP32 DevKit (38-pin), Arduino framework (ESP32 Core ≥ 2.0), FreeRTOS

---

## 1. Scope and Constraints

### 1.1 What This Firmware Does

Reads an analog photoplethysmography (PPG) signal from a Pulse Sensor Amped SEN-11574, detects heartbeats, computes a smoothed beats-per-minute (BPM) value with a signal-quality metric, displays it on a 16×2 LCD, and transmits summarized physiological telemetry to the PRISM backend over Wi-Fi every 5–10 seconds.

### 1.2 What This Firmware Does NOT Do

The pulse sensor is a single optical sensor. It can only measure volumetric blood-flow changes. **It cannot detect, infer, or classify any mental, emotional, or psychological state.** Accordingly, this firmware:

- NEVER computes or transmits "stress," "anxiety," "mood," "emotion," or any risk/diagnostic label.
- Transmits exactly two physiological fields: `heart_rate_bpm` and `signal_quality`, plus device identity and timestamp.
- Displays ONLY two LCD lines: `PRISM MONITOR` and `BPM: NNN`.

Any higher-level interpretation happens server-side, outside this document's scope.

### 1.3 Fixed Hardware (Not Changeable)

| Component | Connection | Role |
|---|---|---|
| ESP32 Dev Board (38-pin) | — | MCU, Wi-Fi radio |
| Pulse Sensor Amped SEN-11574 | GPIO 34 (ADC1_CH6) | Analog PPG input |
| 16×2 LCD (HD44780, I²C backpack PCF8574) | GPIO 21 (SDA), GPIO 22 (SCL) | Display |
| Sound module (buzzer/speaker) | GPIO 25 (reserved) | Present, unused this phase |
| USB cable to laptop | — | Power, programming, serial monitor only |

Laptop has no runtime role. The firmware must operate identically if the laptop is unplugged (provided alternative power).

### 1.4 Pin Budget

```
ESP32 38-PIN MAP (used pins only)

        ┌───────────────────────┐
  EN ───┤                       ├─── GPIO 23
 GPIO36─┤                       ├─── GPIO 22  → LCD SCL
 GPIO39─┤                       ├─── GPIO 1 (TX0)
 GPIO34─┤  ← PULSE SENSOR SIG   ├─── GPIO 3 (RX0)
 GPIO35─┤                       ├─── GPIO 21  → LCD SDA
 GPIO32─┤                       ├─── GPIO 19
 GPIO33─┤                       ├─── GPIO 18
 GPIO25─┤  → SOUND (reserved)   ├─── GPIO 5
 GPIO26─┤                       ├─── GPIO 17
 GPIO27─┤                       ├─── GPIO 16
 GPIO14─┤                       ├─── GPIO 4
 GPIO12─┤                       ├─── GPIO 2  → onboard LED (heartbeat blink)
  GND ──┤                       ├─── GPIO 15
  VIN ──┤                       ├─── GND
        └───────────────────────┘

Pulse Sensor:  RED → 3V3   BLACK → GND   PURPLE → GPIO34
LCD (I²C):     VCC → VIN(5V)  GND → GND  SDA → GPIO21  SCL → GPIO22
Sound module:  SIG → GPIO25  VCC → 3V3   GND → GND   (reserved, not driven)
```

Rationale: GPIO 34–39 are input-only ADC1 pins — GPIO 34 keeps analog capture on ADC1 (safe under Wi-Fi, unlike ADC2 which Wi-Fi disables). GPIO 21/22 are the default I²C bus. GPIO 25 is DAC-capable and suits a later audio phase. GPIO 2 drives the onboard LED as a zero-cost live heartbeat indicator.

---

## 2. System Architecture

```
Pulse Sensor Amped
       │ analog, 500 Hz
       ▼
┌─────────────────────────────────────────────────────────────┐
│  ESP32                                                       │
│                                                              │
│  ┌──────────────┐   ┌────────────────┐   ┌───────────────┐  │
│  │ PulseSampler │──▶│ BeatDetector   │──▶│ BPMAggregator │  │
│  │  (500 Hz ISR)│   │ (adaptive thr) │   │ (EMA + median)│  │
│  └──────────────┘   └────────────────┘   └───────┬───────┘  │
│                                                  │ BPM, Q    │
│                          ┌───────────────────────┤           │
│                          ▼                       ▼           │
│                   ┌────────────┐         ┌──────────────┐    │
│                   │  Display   │         │  ApiClient   │    │
│                   │ (LCD 1 Hz) │         │ (every 5–10s)│    │
│                   └────────────┘         └──────┬───────┘    │
│                          ▲                      │            │
│                   ┌──────┴──────┐        ┌──────▼───────┐    │
│                   │ Scheduler   │        │ WiFiManager  │    │
│                   │ (millis FSM)│        │ (state mach.)│    │
│                   └─────────────┘        └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │                      │
                          ▼                      ▼
                    16×2 LCD              PRISM REST API
                    "PRISM MONITOR"       POST /api/v1/physio/ingest
                    "BPM: 078"
```

Module boundaries follow single-responsibility: sampling, detection, aggregation, presentation, connectivity, transport. Each compiles as its own translation unit.

---

## 3. Signal Chain and Beat Detection

### 3.1 Sampling

- **Rate:** 500 Hz (2 ms period) via a hardware timer ISR. The SEN-11574's useful band is ~0.5–5 Hz; 500 Hz gives comfortable oversampling for clean peak localization (±2 ms IBI resolution → ±0.25 BPM error at 70 BPM).
- **ISR duty:** read `analogRead(GPIO34)` (12-bit, 0–4095), push into a lock-free circular buffer (256 entries = 512 ms), set a "sample ready" flag. Nothing else in the ISR — no filtering, no math, no serial.
- **ADC config:** `analogSetPinAttenuation(GPIO34, ADC_11db)` for full ~3.3 V range; `analogReadResolution(12)`.

### 3.2 Filtering Pipeline (applied in loop, not ISR)

Each 2 ms sample passes through a two-stage filter chain. All filters are O(1) per sample, integer-friendly, and free of heap allocation.

**Stage 1 — Median-of-5 (impulse removal):**
```
out = median(in[i-2..i+2])
```
Kills single-sample spikes from electrical noise or contact taps, which otherwise create false peaks. A median filter, not a mean, is used here precisely because pulse-sensor glitches are impulses, not Gaussian noise — a mean would smear a spike into a fake slope.

**Stage 2 — Exponential Moving Average, α = 0.18 (low-pass smoothing):**
```
lpf[i] = lpf[i-1] + α · (median_out − lpf[i-1])
```
Smooths the PPG waveform for reliable threshold crossing without shifting the peak position significantly (α = 0.18 at 500 Hz gives an effective cutoff ≈ 8–10 Hz, above the pulse band but below mains/muscle noise).

**Why not a heavier FIR?** A 5-tap moving average is an acceptable fallback if EMA tuning proves touchy, but EMA needs one float of state versus a 5-sample ring, has better phase behavior at this oversampling ratio, and costs one multiply-add per sample. A full FIR/IIR is unjustifiable on a single-core 240 MHz part doing trivial work — but would be the first upgrade if a second high-noise sensor is added.

### 3.3 Beat Detection Algorithm

Operates on the filtered waveform in 600 ms windows (300 samples).

**1. Baseline estimation:**
Track the waveform's DC offset with a slow EMA (β = 0.01 per window):
```
baseline = baseline + β · (window_mean − baseline)
```
This follows sensor settling, finger-pressure changes, and ambient-light drift without reacting to individual beats.

**2. Adaptive threshold:**
```
range = window_max − window_min
threshold = baseline + 0.55 · range
```
The 0.55 factor sits just above mid-waveform, capturing the steep systolic upstroke while ignoring the diastolic tail and dicrotic notch (the classic false-double-beat source on this sensor).

**3. Peak detection with refractory period:**
```
if signal crosses threshold upward AND (now − last_beat) > REFRACTORY_MS:
      candidate beat at crossing time (interpolated)
```
- **REFRACTORY_MS = 300 ms** → hard-caps detections at 200 BPM, eliminating double-fires on the notch.
- Linear interpolation between the two samples straddling the threshold gives sub-sample beat timing (±1 ms).

**4. Inter-beat interval (IBI):**
```
IBI[n] = t[n] − t[n−1]
```

**5. Outlier rejection (before BPM use):**
```
accept IBI[n] only if:
   333 ms ≤ IBI[n] ≤ 2000 ms        (30–180 BPM bounds)
   AND |IBI[n] − median(IBI[last 5])| ≤ 0.35 · median
```
Physiologically impossible IBIs and >±35 % jumps versus the recent median are discarded as motion artifacts, not written to the IBI history.

**6. BPM calculation:**
```
BPM_inst = 60000 / mean(IBI over accepted beats in last 8 s window)
```

**7. Smoothing:**
Two-layer: median-of-5 on the instantaneous BPM series (rejects single bad windows), then EMA α = 0.3 (settles in ~2 s without perceptible lag on the LCD).

**8. Loss-of-signal:**
If no accepted beat for 3.5 s → `bpm_valid = false`, LCD shows `BPM: ---`, quality decays toward 0.

### 3.4 Signal Quality Metric (0.00–1.00)

Quality is a bounded product of four sub-scores, each 0–1, updated every second:

```
Q = q_amp · q_reg · q_noise · q_contact
```

| Sub-score | Measures | Degrades when |
|---|---|---|
| `q_amp` | Peak-to-peak amplitude vs learned-good amplitude | Poor contact, low perfusion (Q↓ proportionally) |
| `q_reg` | IBI regularity: `1 − σ(IBI)/μ(IBI)` | Inconsistent beats, arrhythmia-like artifact patterns |
| `q_noise` | Fraction of samples clipped or median-filter-flagged | Motion artifact, electrical noise |
| `q_contact` | `q_amp` trending near zero for >2 s, or DC rail (≈0 or ≈4095) | Sensor off finger / saturated |

Rules: Q decays at 0.2/s toward its computed value (no jumps), recovers at 0.5/s. A hard floor: if `q_contact < 0.3`, Q is clamped ≤ 0.2 so the backend learns "placement is bad" regardless of how clean the (meaningless) waveform looks.

Typical thresholds for firmware behavior: Q ≥ 0.8 good; 0.5–0.8 acceptable; < 0.5 BPM reported but flagged unreliable; Q < 0.2 → `bpm_valid = false`.

---

## 4. LCD Logic

**Content (exactly two lines, nothing else):**
```
PRISM MONITOR
BPM: 078
```
- Line 1: static string, written once at boot.
- Line 2: `BPM: ` + three-digit zero-padded value; `BPM: ---` when `bpm_valid == false`.

**Update policy:**
- Refresh at **1 Hz maximum**, and only when the displayed string actually changes (compare new vs cached line; skip `lcd.print` if identical). HD44780 I²C writes are slow (~30 ms for a full line); change-gated updates eliminate both flicker and I²C bus waste.
- Zero-padding via `snprintf(buf, sizeof(buf), "BPM: %03d", bpm)` — keeps the field width constant so no stale characters remain (no `lcd.clear()` in the loop, which is the #1 flicker cause).
- I²C address probed at boot: try `0x27`, fall back to `0x3F`. If neither ACKs, `display_ok = false` and firmware continues (see §8).

---

## 5. Wi-Fi State Machine

```
                ┌──────────────┐
     boot ─────▶│     INIT     │
                └──────┬───────┘
                       ▼
                ┌──────────────┐   success   ┌───────────────┐
                │  CONNECTING  │────────────▶│   CONNECTED   │◀──┐
                │ (10 s t/out) │             │ (RSSI monitor)│   │
                └──────┬───────┘             └───────┬───────┘   │
                       │ timeout                     │ loss      │
                       ▼                             ▼           │
                ┌──────────────┐   backoff    ┌───────────────┐  │
                │ BACKOFF_WAIT │─────────────▶│ RECONNECTING  │──┘
                │ 1→2→4→8→15 s │              │ (10 s t/out)  │
                └──────┬───────┘              └───────────────┘
                       │ >5 min continuous failure
                       ▼
                ┌──────────────┐
                │ OFFLINE_HOLD │  (keep sampling; retry every 60 s)
                └──────────────┘
```

Key behaviors:
- `WiFi.mode(WIFI_STA)`, `WiFi.setAutoReconnect(false)` — the state machine owns reconnection; Arduino auto-reconnect fights custom backoff.
- All state transitions are timestamped with `millis()`; no blocking `while(WiFi.status() != WL_CONNECTED)` loops anywhere.
- Connectivity check every 5 s in CONNECTED: `WiFi.status()` plus a lightweight reachability assumption — an API failure also counts as evidence of degraded connectivity and triggers one immediate re-evaluation (but does not itself force reconnect).
- RSSI logged every 30 s for field debugging.

---

## 6. Cloud Communication

### 6.1 Transmission Policy

- **Interval:** every **5 s** when `bpm_valid && Q ≥ 0.5`; every **10 s** otherwise (and zero-BPM/off-finger states transmit at 10 s with the real Q so the backend sees placement issues).
- **No raw ADC ever leaves the device.** Only the summarized payload below.

### 6.2 Payload

```json
{
  "device_id": "PRISM_NODE_001",
  "timestamp": "2026-07-25T16:30:00Z",
  "heart_rate_bpm": 78,
  "signal_quality": 0.91
}
```
Serialized with ArduinoJson into a 192-byte stack buffer (measured payload ≈ 110–130 bytes). `device_id` and endpoint path come from `config.h`.

### 6.3 HTTP Workflow

```
POST {API_BASE}/api/v1/physio/ingest
Headers:
  Content-Type: application/json
  Authorization: Bearer {DEVICE_JWT}
Body: payload above
Timeout: 3000 ms connect, 3000 ms read
```

- `timestamp` is ISO-8601 UTC. If NTP sync succeeded, use real time; otherwise use `millis()`-relative epoch and mark the packet via a config-flagged fallback field offset by boot time (documented in code; the backend tolerates either since it stamps server-side too).
- **NTP:** synced once at CONNECTED via `configTime(0, 0, "pool.ntp.org")`; no RTC on board.

### 6.4 Error Handling and Retry

| Response | Action |
|---|---|
| 200/201 | Success; clear pending retry; note server-OK for Wi-Fi health |
| 4xx (any) | Do **not** retry — log body, treat as configuration error, backoff 60 s |
| 5xx | Retry once after 5 s, then drop the sample (never queue stale vitals) |
| Timeout / TCP fail | One retry next cycle; count toward connectivity evidence |

- **Offline buffering:** vitals telemetry is deliberately NOT queued. A 5-day-old BPM is worthless and a privacy liability. Only a rolling "latest packet" is kept in RAM (one packet, 192 B). If the design is later extended to store-and-forward, cap at 12 packets in RTC RAM with oldest-drop.
- `HTTPClient` reused via a static instance; `http.end()` called on every exit path to avoid socket leaks — the classic ESP32 heap decay over multi-day uptime.

---

## 7. Main Loop Scheduling (Non-Blocking)

Everything is interval-scheduled off `millis()` deltas; `delay()` appears only in `setup()`.

```
┌─ Task ────────────────────┬─ Period ─┬─ Budget ──────────────────────────┐
│ Timer ISR (sample)        │ 2 ms     │ < 20 µs, ISR-safe buffer push     │
│ Filter + beat detect      │ 20 ms    │ ~150 µs (50 samples per pass)     │
│ BPM/Q aggregate           │ 1000 ms  │ < 1 ms                            │
│ LCD update                │ 1000 ms  │ ≤ 30 ms only when text changes    │
│ Wi-Fi FSM tick            │ 5000 ms  │ < 1 ms (state reads)              │
│ API transmit              │ 5–10 s   │ ≤ 3 s worst case (timeout-bound)  │
│ Onboard LED heartbeat     │ on beat  │ toggle GPIO 2                     │
└─────────────────────────────────────────────────────────────────────────┘
```

Sketch of the cooperative scheduler:

```cpp
loop() {
  pulseSampler.drainISRBuffer();            // always-first: never let buffer fill
  if (due(lastDetect,    20))  beatDetector.process();
  if (due(lastAggregate, 1000)) { bpmAggregator.update(); display.tick(); }
  if (due(lastWifi,      5000)) wifiManager.tick();
  if (due(lastTx, txInterval))  apiClient.transmit(...);
  soundModule.tick();                       // reserved no-op this phase
}
```

`due(last, interval)` is the standard `millis() - last >= interval` overflow-safe idiom. No FreeRTOS tasks are used in this phase: worst-case blocking is the 3 s API timeout, which is acceptable because sampling continues via the hardware-timer ISR regardless of what `loop()` is doing. If a future phase adds camera or audio, the sampler ISR means the design already survives a second busy task on the other core.

---

## 8. Error Handling Matrix

| Fault | Detection | Firmware Behavior |
|---|---|---|
| Sensor disconnected | ADC rails at 0 or 4095 for >2 s | `q_contact = 0`, `bpm_valid = false`, LCD `BPM: ---`, keep transmitting Q |
| Wi-Fi unavailable | FSM timeout | Offline operation continues; LCD unaffected; 60 s retry cadence |
| Invalid BPM | Outlier rules (§3.3) | IBI discarded; not propagated; Q drops via `q_reg` |
| API unavailable | HTTP timeout/5xx | Single retry, drop, continue (§6.4) |
| LCD init failure | I²C no-ACK on 0x27/0x3F | `display_ok=false`; all display calls no-op; serial still logs BPM; LED heartbeat unaffected |
| Buffer overflow | ISR ring overwrite counter | Logged; overwrite-oldest policy; quality penalty via `q_noise` if sustained |
| Memory pressure | `ESP.getFreeHeap()` sampled 1/min | Warn log at < 40 kB; HTTP client recreated; no dynamic allocation in steady state |
| Watchdog | Task WDT enabled (8 s) | Any hung loop pass reboots cleanly into INIT state |

---

## 9. Performance Budget

| Metric | Value | Basis |
|---|---|---|
| Sampling frequency | 500 Hz | 2 ms timer ISR |
| CPU usage | ~3–5 % core 0 | dominated by I²C LCD writes; detector math trivial |
| RAM (static) | ≈ 6.5 KB | 1 KB sample ring + filter state + JSON buffer + LCD/I²C libs |
| Flash footprint | ≈ 850 KB | Arduino core + Wi-Fi + HTTPClient + ArduinoJson |
| Network bandwidth | ≈ 25 B/s avg | ~130 B packet / 5 s + TCP/TLS overhead absent (HTTP) |
| JSON packet size | 110–130 B | measured shape above |
| LCD refresh | 1 Hz max, change-gated | 2 lines × 16 chars via I²C ≈ 30 ms worst |
| Uptime target | > 72 h continuous | no heap churn in steady state; WDT as backstop |

---

## 10. Module Design

### 10.1 `config.h`
Central compile-time configuration — the only file touched when moving between environments.
- **Responsibilities:** Wi-Fi SSID/pass, `API_BASE`, `DEVICE_ID`, `DEVICE_JWT`, pin map, timing constants (sample rate, tx interval, refractory), BPM bounds, threshold factors.
- **Conventions:** all constants `constexpr`, grouped by module, prefixed (`PULSE_*`, `WIFI_*`, `API_*`). Secrets live here only for prototype; production moves them to NVS/provisioning.

### 10.2 `pulse_sensor.h / pulse_sensor.cpp`
- **Responsibilities:** timer ISR, sample ring buffer, median+EMA filter chain, adaptive-threshold beat detection, IBI validation.
- **Public API:** `begin()`, `drainISRBuffer()`, `process()`, `latestBeatIBI()`, `waveformStats()`, `overflowCount()`.
- **Dependencies:** `config.h` only. Knows nothing about BPM display or networking.

### 10.3 `display.h / display.cpp`
- **Responsibilities:** LCD init with address probe, change-gated line writes, `BPM: %03d` / `---` formatting.
- **Public API:** `begin()` (returns bool), `showBPM(int bpm, bool valid)`, `tick()`.
- **Dependencies:** LiquidCrystal_I2C, `config.h`.

### 10.4 `wifi_manager.h / wifi_manager.cpp`
- **Responsibilities:** the §5 state machine, NTP kick-off, RSSI logging, connectivity evidence from API results.
- **Public API:** `begin()`, `tick()`, `isConnected()`, `reportApiOutcome(bool ok)`, `state()`.
- **Dependencies:** WiFi.h, `config.h`.

### 10.5 `api_client.h / api_client.cpp`
- **Responsibilities:** JSON serialization, POST workflow, retry policy, NTP-relative timestamps.
- **Public API:** `begin()`, `transmit(int bpm, float quality)`, `lastHttpStatus()`.
- **Dependencies:** HTTPClient, ArduinoJson, `wifi_manager` (for connectivity checks), `config.h`.

### 10.6 `utilities.h`
Overflow-safe `due(millis_last, interval)`, `median3/5` templates, moving-average structs, `clamp`, ISO-8601 formatter. Header-only, no state.

### 10.7 `main.cpp`
`setup()` ordering: serial → display (optional-OK) → pulse sampler → Wi-Fi → NTP → scheduler init. `loop()` is only the §7 scheduler plus a `BpmAggregator` glue step (10 lines). No business logic lives in `main.cpp`.

---

## 11. Engineering Best Practices

- **Naming:** files/modules `snake_case`; classes `PascalCase`; constants `UPPER_SNAKE`; member fields `trailing_underscore` style avoided — plain `camelCase` with `m_` prefix banned (repo consistency).
- **Logging:** one `LOG(level, fmt, ...)` macro over `Serial.printf`, compile-time leveled (`DEBUG/INFO/WARN/ERROR`); production builds set `LOG_LEVEL=INFO`. Every state transition and every API outcome logged at INFO; per-sample data never logged (would flood the 115200 UART and skew timing).
- **Constants:** nothing magic-numbered — every threshold, interval, and pin in `config.h` with a one-line justification comment.
- **Compile-time configuration:** `#define PRISM_ENV_DEV` switches log level, API host, and NTP pool; a single `platformio.ini` env per target.
- **Testing methodology:** (1) unit-test the filter/detector/quality math on the host by compiling `pulse_sensor.cpp` against a sample-waveform replay harness; (2) hardware-in-loop: replay recorded PPG via DAC from a second board into GPIO 34 and assert BPM within ±2; (3) fault-injection: yank sensor mid-run, kill Wi-Fi AP, block API port — verify §8 behaviors; (4) soak: 24 h run watching `ESP.getFreeHeap()` and overflow counter.
- **Maintainability/scalability:** modules are header/interface-clean; adding a GSR channel later means a new `gsr_sensor.cpp` and one line in the scheduler — no edits to existing files beyond `config.h` and the payload builder (OCP-style).
- **Uptime hygiene:** no `String` class in steady state, no heap allocation after `setup()`, `HTTPClient` lifecycle managed per §6.4, task WDT armed.

---

## 12. Compliance Checklist (Self-Review)

- [x] Hardware exactly as fixed; laptop is power/serial only — firmware runs standalone.
- [x] LCD shows only `PRISM MONITOR` / `BPM: NNN` — no mood, stress, risk, or diagnostic text anywhere in firmware.
- [x] Transmits only `heart_rate_bpm`, `signal_quality`, `device_id`, `timestamp` — no raw ADC, no inferred states.
- [x] Non-blocking loop; ISR-based sampling survives 3 s network stalls.
- [x] Noise resilience: median + EMA filtering, adaptive threshold, refractory, IBI bounds, outlier rejection, 4-factor quality metric.
- [x] Impossible-reading rejection: 30–180 BPM bounds, ±35 % IBI jump gate, loss-of-signal timeout.
- [x] Wi-Fi FSM with timeout, backoff, offline hold; API errors never block the sensor loop.
- [x] All error paths in §8 preserve core function (sense + display) under any single failure.

**Document approved for implementation. Day 1 firmware tasks (Section 11, PRISM prototype plan) may begin against this specification.**
