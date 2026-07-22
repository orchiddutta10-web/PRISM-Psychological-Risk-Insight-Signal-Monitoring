# Chapter 16: Hardware Architecture

## 16.1 Embedded Node Overview

The SentinelMind hardware node is implemented as a firmware sketch targeting the ESP32 and ESP8266 microcontroller families, which were selected for their integrated Wi-Fi connectivity, hardware timer peripherals, analog-to-digital conversion capability, and extensive ecosystem support. The firmware is authored in C++ for the Arduino framework and is organized into six translation units: the main control loop (`sentinelmind_node.ino`), a configuration header (`Config.h`), a Wi-Fi connection manager (`WiFiManager.h`), a pulse sensor signal processor (`PulseSensor.h`), a galvanic skin response processor (`GSRSensor.h`), and a data batching and transmission manager (`TransmitManager.h`).

The node operates as a **networked data acquisition device**, sampling two physiological sensors at 100 Hz, performing on-device signal processing to extract heart rate and skin conductance metrics, batching these measurements into 1-second windows, and transmitting them to the Flask backend via HTTP POST. This architecture was chosen to minimize backend computational load and network overhead — the server receives pre-processed features rather than raw ADC streams, reducing bandwidth requirements by approximately two orders of magnitude.

---

## 16.2 Hardware Configuration and Pin Mapping

The firmware supports two target platforms through conditional compilation via preprocessor directives:

**Table 16.1: Pin Configuration by Target Platform**

| Signal | ESP32 | ESP8266 |
|--------|-------|---------|
| Pulse Sensor (analog input) | GPIO34 (ADC1_CH6) | A0 (shared) |
| GSR Sensor (analog input) | GPIO35 (ADC1_CH7) | A0 (shared) |
| Status LED | GPIO2 | LED_BUILTIN |
| ADC Resolution | 12-bit (0-4095) | 10-bit (0-1023) |
| ADC Voltage Reference | 3.3 V | 3.3 V |

The ESP32 implementation uses ADC1 channels 6 and 7, which are accessible via GPIO34 and GPIO35 respectively. These pins are configured with 11 dB attenuation (`analogSetAttenuation(ADC_11db)`), providing a measurement range of 0 to approximately 3.3 V. The ESP8266 variant is limited to a single analog input (A0) with 10-bit resolution and would require an external multiplexer or additional ADC for dual-sensor operation.

---

## 16.3 Timer-Driven Sampling Architecture

### 16.3.1 Motivation

The system enforces a **hardware-timer-driven sampling rate** to ensure deterministic inter-sample intervals independent of main-loop execution variability. Software-based timing methods — such as `delay()` or `millis()` polling in the loop — are susceptible to drift and jitter caused by variable execution paths, particularly when conditional network operations or serial I/O occur. For physiological signals, consistent inter-sample intervals are critical for frequency-domain analysis: a 100 Hz nominal rate with 5 ms jitter would introduce aliasing artifacts that degrade downstream HRV and GSR spectral feature extraction.

### 16.3.2 Timer Implementation

The firmware employs the `Ticker` library, which wraps the ESP timer peripheral in a lightweight callback interface. The sampling tick interval is configured as `SAMPLE_INTERVAL_MS = 10`, yielding a nominal sampling frequency of 100 Hz.

```
Ticker sampleTicker;
volatile bool   samplingFlag = false;
volatile uint32_t tickCount  = 0;

void IRAM_ATTR onSampleTick() {
    samplingFlag = true;
    tickCount++;
}

void setup() {
    sampleTicker.attach_ms(SAMPLE_INTERVAL_MS, onSampleTick);
}
```

The interrupt service routine (`onSampleTick`) is constrained to the absolute minimum work required: setting a volatile flag and incrementing a counter. This design follows the principle of keeping ISR execution time as short as possible to avoid blocking other interrupt-driven subsystems (Wi-Fi stack, TCP/IP stack, serial RX). The actual sensor reading, filtering, and feature extraction are deferred to the main loop, which checks the flag and executes the processing pipeline when a tick is detected:

```python
# Pseudo-code — main loop sampling guard
if samplingFlag:
    samplingFlag = false
    pulseSensor.readAndProcess()
    gsrSensor.readAndProcess()
```

This architecture decouples timing precision (guaranteed by the hardware timer) from processing duration (which may vary with loop iteration). As long as the combined processing time remains below 10 ms — which it does, as the operations are simple integer arithmetic and filter updates — the system maintains real-time behavior.

---

## 16.4 Pulse Sensor Signal Processing

### 16.4.1 Sensing Principle

The Pulse Sensor Ampled module operates on the principle of photoplethysmography (PPG): an infrared LED illuminates the skin, and a photodiode detects variations in light absorption caused by blood volume changes during the cardiac cycle. The module's amplifier stage biases the output to approximately VCC/2 with a pulsatile AC component of approximately 10-20% of the supply voltage.

### 16.4.2 Signal Processing Pipeline

The `PulseSensor` class (`PulseSensor.h`) implements a five-stage processing pipeline:

**Stage 1 — Analog-to-Digital Conversion**: The microcontroller's ADC samples the sensor voltage at 100 Hz, producing a raw 12-bit value (0-4095 on ESP32). No external anti-aliasing filter is required because the sensor module's analog bandwidth is intrinsically limited.

**Stage 2 — Moving Average Filter**: A 5-tap moving average filter attenuates 50/60 Hz power-line interference and high-frequency sensor noise. The filter is implemented as a circular buffer with arithmetic mean computation:

```cpp
_maBuffer[_maIdx] = (float)_raw;
_maIdx = (_maIdx + 1) % PULSE_MA_WINDOW;    // PULSE_MA_WINDOW = 5
// sum and average
_filtered = sum / PULSE_MA_WINDOW;
```

The 5-tap window at 100 Hz provides a cutoff frequency of approximately 20 Hz, preserving the cardiac pulse waveform (typically 0.5-4 Hz) while rejecting mains hum.

**Stage 3 — Adaptive Threshold Tracking**: The filtered signal's minimum and maximum are tracked using an asymmetric decay mechanism that adapts to signal amplitude changes over time:

```cpp
if (_filtered > _signalMax) {
    _signalMax = _filtered;
} else {
    _signalMax -= (_signalMax - _filtered) * 0.005f;   // slow decay
}
if (_filtered < _signalMin) {
    _signalMin = _filtered;
} else {
    _signalMin += (_filtered - _signalMin) * 0.005f;
}
```

The decay factor of 0.005 means the tracked extreme values converge toward the current signal at a rate of approximately 0.5% per sample, reaching 63% of a step change in about 200 samples (2 seconds). This asymmetry allows the tracker to respond immediately to genuine changes (a beat that exceeds the previous maximum) while slowly forgetting stale values during signal quiescence.

A minimum dynamic range of 15 ADC counts (approximately 12 mV on ESP32) is enforced to prevent noise-floor triggering when the sensor is disconnected.

**Stage 4 — Beat Detection**: A beat is registered when the filtered signal crosses above an adaptive threshold:

```cpp
float threshold = _signalMin + PULSE_THRESHOLD_RATIO * range;
// PULSE_THRESHOLD_RATIO = 0.60

if (!_inRefractory && _prevFiltered <= threshold && _filtered > threshold) {
    // Beat detected
}
```

The threshold is placed at 60% of the dynamic range, a value empirically determined to provide robust detection across varying signal amplitudes. A 250 ms refractory period is enforced after each beat to prevent double-triggering on the dicrotic notch — the secondary pressure wave that follows the systolic peak in the PPG waveform.

**Stage 5 — BPM Computation**: The inter-beat interval (IBI) is measured in milliseconds and validated against physiologically plausible bounds (30-220 BPM, corresponding to intervals of 273-2000 ms). Valid IBIs are smoothed via an exponential moving average:

```cpp
_bpm = _bpm * 0.6f + _lastBPM * 0.4f;
```

The 60/40 weighting provides a balance between responsiveness to genuine rate changes and suppression of beat-to-beat noise.

### 16.4.3 Confidence Heuristic

The reported confidence is a function of the tracked signal range, which correlates with sensor contact quality and motion artifact level:

| Signal Range (ADC counts) | Confidence |
|--------------------------|------------|
| > 200 | 0.95 |
| 100-200 | 0.85 |
| 50-100 | 0.70 |
| 30-50 | 0.55 |
| < 30 | 0.30 |

---

## 16.5 GSR Sensor Signal Processing

### 16.5.1 Sensing Principle

The galvanic skin response (GSR) sensor measures the electrical conductance of the skin between two electrodes, which varies with sweat gland activity controlled by the sympathetic nervous system. The sensor is configured as a voltage divider: the skin forms an unknown resistance (R_skin) in series with a fixed 10 kΩ reference resistor (R_fixed) between VCC (3.3 V) and ground. The ADC measures the voltage at the midpoint of the divider:

```
Vout = VCC * R_fixed / (R_skin + R_fixed)
```

Solving for skin resistance and converting to conductance in microSiemens:

```
R_skin = R_fixed * (VCC / Vout - 1)
G_µS = 1,000,000 / R_skin
```

### 16.5.2 Signal Processing Pipeline

**Stage 1 — ADC Read and Moving Average Filter**: Identical to the pulse sensor front-end: a 5-tap moving average filter attenuates high-frequency noise.

**Stage 2 — Conductance Computation**: The filtered ADC code is converted to a voltage, then to conductance through the voltage divider equation. Physical bounds are enforced:

| Condition | Action |
|-----------|--------|
| Vout < 1 mV | Clamp to 1 mV (prevents division by zero) |
| Vout > VCC - 1 mV | Clamp to VCC - 1 mV (prevents short-circuit) |
| R_skin < 100 Ω | Clamp to 100 Ω (physically implausible) |
| R_skin > 10 MΩ | Clamp to 10 MΩ (open-circuit detection) |

The resulting conductance typically ranges from 0.1 µS (dry skin, high resistance) to 20 µS (sweaty or stressed skin, low resistance).

**Stage 3 — Tonic/Phasic Decomposition**: The conductance signal is separated into two physiologically meaningful components:

- **Tonic (SCL — Skin Conductance Level)**: The slow-moving baseline, extracted via a single-pole infinite impulse response (IIR) low-pass filter with alpha = 0.001:

  ```cpp
  _tonic = _lastTonic + GSR_TONIC_ALPHA * (_conductance - _lastTonic);
  ```

  At 100 Hz sampling, this coefficient corresponds to a cutoff frequency of approximately:

  ```
  f_c ≈ alpha * fs / (2π) ≈ 0.001 * 100 / 6.28 ≈ 0.016 Hz
  ```

  This cutoff separates the slow (minutes-hours) baseline drift from the faster (seconds) phasic responses.

- **Phasic (SCR — Skin Conductance Response)**: The residual signal above the tonic baseline, representing rapid sympathetic arousal events:

  ```cpp
  _phasic = _conductance - _tonic;
  if (_phasic < 0.0f) _phasic = 0.0f;
  ```

---

## 16.6 Wi-Fi Connection Management

### 16.6.1 Connection State Machine

The `WiFiManager` class implements a finite state machine with six states governing the network connection lifecycle:

```
                  ┌──────────┐
                  │   IDLE   │
                  └────┬─────┘
                       │ begin()
                       ▼
               ┌───────────────┐
         ┌──── │  CONNECTING   │
         │     └───────┬───────┘
         │             │ WL_CONNECTED
         │             ▼
         │     ┌───────────────┐
         │     │  CONNECTED    │◄──────────────┐
         │     └───────┬───────┘               │
         │             │ WL_DISCONNECTED        │
         │             ▼          maintain()    │
         │     ┌───────────────┐  reconnected   │
         ├────►│ RECONNECTING  ├────────────────┘
         │     └───────┬───────┘
         │             │ max retries exceeded
         │             ▼
         │     ┌───────────────┐
         └────►│    FAILED     │
               └───────────────┘
```

**Figure 16.1:** Wi-Fi connection state machine.

### 16.6.2 Initial Connection

The `begin()` method performs a blocking connection attempt with a maximum duration of `WIFI_RETRY_MS × WIFI_MAX_RETRIES = 500 ms × 40 = 20 seconds`. During this phase, the built-in LED blinks at 80 ms intervals to provide visual feedback. If connection succeeds, the state transitions to CONNECTED and the LED remains solidly lit. If all retries are exhausted, the system proceeds to the FAILED state but continues to serve locally — the hardware node can buffer data indefinitely and transmit when connectivity is restored.

### 16.6.3 Runtime Monitoring

The `maintain()` method is invoked on every loop iteration (~1 ms) and evaluates `WiFi.status()` to detect link degradation:

| Status Code | Action |
|-------------|--------|
| `WL_CONNECTED` | Reset retry counter, LED solid on |
| `WL_DISCONNECTED` | Initiate reconnection, LED slow blink |
| `WL_CONNECTION_LOST` | Initiate reconnection |
| `WL_NO_SSID_AVAIL` | Initiate reconnection |
| `WL_CONNECT_FAILED` | Initiate reconnection |

Reconnection employs a non-blocking retry mechanism: `WiFi.disconnect(false)` followed by `WiFi.begin()`, throttled to one attempt per `WIFI_RETRY_MS` (500 ms). Status messages are printed to serial every 10 retries to avoid console flooding.

---

## 16.7 Data Batching and Transmission

### 16.7.1 Ring Buffer Architecture

Sensor readings are stored in a fixed-size circular buffer before transmission:

```cpp
SensorReading _buffer[BATCH_MAX_READINGS];   // BATCH_MAX_READINGS = 100
uint8_t _head, _tail, _count;
```

The buffer supports constant-time insertion and eviction. When the buffer is full (`_count == BATCH_MAX_READINGS`), the oldest entry is overwritten, implementing a lossy sliding window that ensures the most recent data is always available for transmission.

### 16.7.2 Transmission Cycle

Every `TRANSMIT_INTERVAL_MS` (default: 1000 ms), the `tryTransmit()` method drains the ring buffer and issues an HTTP POST request. The transmission window of 1 second at 100 Hz sampling yields approximately 100 readings per batch.

### 16.7.3 JSON Serialization

The batch is serialized to JSON using the `ArduinoJson` library (StaticJsonDocument<8192>). The payload structure is:

```json
{
  "device_id": "sm-node-001",
  "sample_rate_hz": 100,
  "firmware": "1.0.0",
  "readings": [
    {
      "ts": 1710501234.567,
      "pulse_raw": 2048,
      "hr_bpm": 72.3,
      "hr_conf": 0.92,
      "ibi_ms": 830.0,
      "gsr_raw": 1024,
      "gsr_us": 4.52,
      "gsr_tonic_us": 4.48,
      "gsr_phasic_us": 0.04
    }
  ]
}
```

The 8,192-byte allocation accommodates the full batch plus JSON overhead. A typical payload of 100 readings occupies approximately 6,000-7,000 bytes.

### 16.7.4 HTTP Client

Transmission uses `HTTPClient` with a 3-second timeout. The request includes a `X-Device-ID` header for server-side routing. On successful HTTP 200/201 responses, the transmit success counter (`_txOk`) is incremented; on failure (timeout, connection refused, non-2xx status), the failure counter (`_txFail`) is incremented and the readings remain in the buffer for the next cycle.

---

## 16.8 LED Status Indication

The built-in LED provides immediate visual feedback on system state:

| Pattern | Interval | Indicated State |
|---------|----------|-----------------|
| Solid off | — | Initializing |
| Fast blink | 80 ms | Wi-Fi connecting |
| Solid on | — | Wi-Fi connected, normal operation |
| Slow blink | 400 ms | Wi-Fi reconnecting after link loss |

The LED is driven by the `_setLedPattern()` method within the `WiFiManager` class, which uses non-blocking `millis()` timing to avoid interfering with the sampling Ticker.

---

## 16.9 Memory and Performance Budget

**Table 16.2: Static Memory Allocation by Component**

| Component | RAM (approx.) | Flash (approx.) |
|-----------|--------------|-----------------|
| Main loop + Ticker | 200 B | 2 KB |
| PulseSensor (state + buffer) | 100 B | 1.5 KB |
| GSRSensor (state + buffer) | 100 B | 1.5 KB |
| TransmitManager (ring buffer) | 100 × 28 B = 2.8 KB | 2 KB |
| JSON document | 8 KB | — |
| WiFi stack (ESP32 SDK) | ~40 KB | ~100 KB |
| HTTP client | 2 KB | 10 KB |
| **Total (estimated)** | **~53 KB** | **~117 KB** |

The ESP32 provides 520 KB of SRAM and 4 MB of flash, leaving substantial headroom for future expansion. The ESP8266, with 80 KB of usable SRAM, requires more careful management, particularly the 8 KB JSON allocation which represents 10% of available memory.

---

## 16.10 Network Protocol

The hardware node communicates with the Flask backend via HTTP/1.1 over TCP port 5000. The communication pattern is **unidirectional** — the node pushes data to the server without expecting any response beyond the HTTP status code. This simplifies the firmware state machine and eliminates the need for request-response synchronization across the network.

The endpoint `POST /api/v1/hardware/stream` is defined in `hardware.py` and returns a JSON acknowledgment:

```json
{
  "status": "success",
  "device": "sm-node-001",
  "ingested": 100,
  "message": "Ingested 100 hardware readings from sm-node-001."
}
```

The server-side handler parses each reading in the batch, appends it to the `SensorService.data_history` ring buffer, and runs anomaly detection heuristics on the incoming values. Readings with HR exceeding 110 BPM, GSR exceeding 10 µS, or GSR exceeding 15 µS trigger warning- and critical-severity anomaly log entries respectively, which are then visible on the dashboard.
