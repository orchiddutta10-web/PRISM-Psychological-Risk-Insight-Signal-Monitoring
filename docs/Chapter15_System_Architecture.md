# Chapter 15: System Architecture

## 15.1 Architectural Overview

SentinelMind V3.0 employs a **service-oriented, multi-tier architecture** designed for real-time physiological monitoring, machine-learning-driven stress classification, and multi-modal sensor fusion. The system is decomposed into five principal tiers: the **Presentation Layer**, the **API Gateway Layer**, the **Service Layer**, the **Machine Learning Pipeline**, and the **Hardware Abstraction Layer**. Each tier exhibits strict separation of concerns, enabling independent scalability, testability, and future replacement of subcomponents — particularly the transition from simulated sensor inputs to live hardware feeds.

The architecture is instantiated through a **Flask Application Factory** pattern (`app/__init__.py:7`), which decouples application construction from configuration and allows environment-specific instantiation. This pattern was selected over a monolithic module-level application object to support the three deployment profiles codified in Table 15.1.

**Table 15.1: Deployment Configuration Profiles**

| Profile | DEBUG | TESTING | Database | Simulator Noise |
|---------|-------|---------|----------|-----------------|
| Development | True | False | SQLite (file) | 0.08 |
| Testing | True | True | SQLite (memory) | 0.00 |
| Production | False | False | Configurable via `DATABASE_URL` | 0.05 |

The configuration hierarchy is defined in `config.py:9-58`. The `Config` base class establishes default parameters, while `DevelopmentConfig`, `TestingConfig`, and `ProductionConfig` each override relevant values. Environment variables take precedence over defaults, following the twelve-factor application methodology.

---

## 15.2 System Context and Component Diagram

Figure 15.1 illustrates the system context, depicting the four external actors that interact with the SentinelMind platform, and the internal component boundaries.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SENTINELMIND V3.0                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐   ┌──────────────────┐   ┌────────────────────────┐  │
│  │ Web      │   │  API Gateway     │   │  Presentation Layer    │  │
│  │ Browser  │◄──│  (Flask Routes)  │──►│  (Dashboard HTML/JS)   │  │
│  └──────────┘   │                  │   └────────────────────────┘  │
│                 │  /health         │                               │
│  ┌──────────┐   │  /api/v1/sensors │   ┌────────────────────────┐  │
│  │ ESP32    │──►│  /api/v1/ml      │   │  Service Layer         │  │
│  │ Hardware │   │  /api/v1/hardware│──►│  SensorService         │  │
│  └──────────┘   │  /api/v1/phone   │   │  MLService             │  │
│                 │  /api/v1/         │   │  LogService            │  │
│  ┌──────────┐   │  dashboard       │   └────────────────────────┘  │
│  │ Smartphone│──►│                  │                               │
│  │ (Phone)  │   └──────────────────┘   ┌────────────────────────┐  │
│  └──────────┘                           │  ML Pipeline            │  │
│                                         │  feature_extractor     │  │
│  ┌──────────┐                           │  preprocess (DSP)     │  │
│  │ Voice    │                           │  fusion_model          │  │
│  │ Assistant│──► SensorService          │  (PyTorch)             │  │
│  └──────────┘                           └────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Hardware Abstraction Layer                                  │  │
│  │  BiosensorSimulator (math-based) · PulseSensor (ADC)        │  │
│  │  GSRSensor (ADC) · WiFiManager · TransmitManager            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Figure 15.1:** System context and high-level component architecture.

The four external actors are:

1. **Web Browser** — Consumes the live monitoring dashboard (`dashboard.html`), which polls REST endpoints at 1-second intervals for real-time sensor and prediction updates.
2. **ESP32/ESP8266 Hardware Node** — Transmits batched physiological readings (100 Hz sampling, 1-second batch window) via HTTP POST to the hardware ingestion endpoint.
3. **Smartphone Client** — Transmits privacy-preserving aggregated behavioral feature vectors (keystroke dynamics, app activity patterns, GPS telemetry) at 5-minute intervals to the phone ingestion endpoint.
4. **Local Voice Assistant** — A standalone Python application that interfaces directly with the service layer for intent-driven biosensor queries.

---

## 15.3 Design Patterns

The system employs five principal design patterns, each selected to address specific architectural concerns arising from the real-time, multi-modal nature of physiological monitoring.

### 15.3.1 Singleton Pattern (Service Instancing)

The `SensorService`, `MLService`, and `LogService` classes are implemented as singletons via `__new__` guard (`sensor_service.py:10-16`, `ml_service.py:13-19`, `log_service.py:9-15`). This pattern was chosen because each service manages a shared, mutable state — the sensor data ring buffer, the loaded ML model reference, and the in-memory log deques, respectively — that must be consistent across all API route handlers and background tasks within a single process. The singleton guarantees a single point of truth for the system's operational state.

The implementation pattern is consistent across all three services:

```python
_instance = None

def __new__(cls, *args, **kwargs):
    if not cls._instance:
        cls._instance = super().__new__(cls, *args, **kwargs)
        cls._instance._initialized = False
    return cls._instance

def __init__(self):
    if self._initialized:
        return
    # ... initialization logic ...
    self._initialized = True
```

A double-initialization guard (`_initialized` flag) prevents the constructor from re-executing on subsequent calls, a subtle but critical detail since Python's `__init__` is invoked after `__new__` regardless of whether the instance already exists.

### 15.3.2 Application Factory Pattern

The `create_app()` function in `app/__init__.py:7-49` implements the Flask Application Factory pattern. This was chosen over a global `app = Flask(__name__)` for three reasons:

1. **Configuration Isolation**: Each deployment profile (development, testing, production) constructs the application with different parameters — most critically, the simulator noise level and database URI. Testing requires an in-memory SQLite database and deterministic sensor output; production requires a persistent database and minimal noise.
2. **Testability**: The factory returns a fresh application instance on each invocation. The pytest fixture `app()` in `conftest.py:6-15` calls `create_app('testing')` before each test, ensuring test isolation without module-level side effects.
3. **Blueprint Registration**: All route blueprints are registered within the factory body, allowing the URL prefix (`/api/v1`) to be configured centrally rather than hard-coded in individual route files.

The factory also performs eager initialization of the ML model (`app/__init__.py:44-47`), loading the classifier within an application context before the first request can arrive. This prevents a cold-start latency spike on the initial prediction call.

### 15.3.3 Strategy Pattern (ML Inference Fallback)

The `MLService.predict_state()` method implements the Strategy pattern with two concrete strategies and a fallback chain (`ml_service.py:53-133`):

1. **Primary Strategy — ML Model**: If a trained scikit-learn classifier exists at `DEFAULT_MODEL_PATH`, the service deserializes it via `joblib.load()` and delegates prediction to `model.predict()` and `model.predict_proba()`. This path is used when a model has been trained and exported to disk.
2. **Fallback Strategy — Heuristic Rule Engine**: When no model file is present (the default state for a fresh deployment), the system employs a deterministic bio-signal rule engine that computes a stress score from three physiological axes:
   - **Heart Rate**: Mean HR > 95 BPM contributes 0.4; > 80 BPM contributes 0.2.
   - **Heart Rate Variability**: RMSSD < 25 ms contributes 0.4; < 35 ms contributes 0.2.
   - **Galvanic Skin Response**: Mean GSR > 8.0 µS contributes 0.3; > 5.0 µS contributes 0.15.

   The aggregate stress score is clamped to [0.01, 0.99] and mapped to one of three states (REST, STRESSED, EXCITED) with calibrated probability distributions.

A third strategy — the **Fusion Model** — is available via `predict_fusion()` when a PyTorch TorchScript module is deployed. This strategy fuses four temporal modalities (keystroke, app activity, GPS telemetry, biometric time-series) via bidirectional GRU encoders and cross-modal attention, as detailed in Section 15.6.

### 15.3.4 Ring Buffer Pattern

Five distinct ring buffers exist throughout the system:

| Buffer | Location | Capacity | Element Type |
|--------|----------|----------|-------------|
| Sensor history | `SensorService.data_history` | 1000 | Sensor reading dict |
| Anomaly log | `LogService.anomaly_log` | 100 | Anomaly dict |
| Voice log | `LogService.voice_log` | 100 | Voice interaction dict |
| Transmit buffer | `TransmitManager._buffer` | 100 | SensorReading struct |
| Phone windows | `phone.device_buffers` | 2016 | PhoneLogPayload |

All five use the `collections.deque(maxlen=N)` mechanism or an equivalent fixed-size array, which provides O(1) append and automatic eviction of the oldest element when the capacity is exceeded. This is essential for a continuous monitoring system where memory must remain bounded regardless of uptime.

### 15.3.5 State Machine Pattern

Two state machines govern critical subsystems:

**Physiological State Machine** (`simulator.py:16-38`): The `BiosensorSimulator` maintains a `current_state` attribute that transitions among REST, STRESSED, and EXCITED. Each state defines a distinct parameter vector (heart rate baseline, HRV variance, GSR baseline, SCR probability and amplitude) that drives the mathematical signal generation model. State transitions are triggered through the `POST /api/v1/sensors/state` endpoint.

**Wi-Fi State Machine** (`WiFiManager.h`): The embedded firmware manages connection lifecycles through six states — IDLE, CONNECTING, CONNECTED, DISCONNECTED, RECONNECTING, and FAILED. The `maintain()` method, called on every loop iteration, evaluates the current Wi-Fi status code and transitions accordingly, with exponential back-off retry logic.

---

## 15.4 Data Flow Architecture

### 15.4.1 Sensor Data Pipeline

Figure 15.2 traces the path of a single sensor reading from physical acquisition to dashboard visualization.

```
 ADC Read               100 Hz               1 s Batch
 ESP32 GPIO34 ──→ PulseSensor       ──→ TransmitManager      HTTP POST
 ESP32 GPIO35 ──→ GSRSensor         ──→ _sendBatch()        ────────→
                    readAndProcess()     _httpPost()                   │
                      (timer ISR         StaticJsonDoc                  │
                       driven)           <8192>                         │
                                                                        ▼
                                                                 ┌──────────┐
                                                                 │   Flask   │
                                                                 │ /hardware │
                                                                 │ /stream   │
                                                                 └────┬─────┘
                                                                      │
                                              ┌───────────────────────┤
                                              │                       │
                                              ▼                       ▼
                                      ┌──────────────┐       ┌──────────────┐
                                      │ SensorService │       │ _log_        │
                                      │ data_history  │       │ anomalies()  │
                                      │ (ring buffer) │       └──────────────┘
                                      └───────┬───────┘
                                              │
                              ┌───────────────┼───────────────┐
                              │               │               │
                              ▼               ▼               ▼
                       ┌──────────┐    ┌──────────┐    ┌──────────┐
                       │ Dashboard│    │ ML       │    │ Future   │
                       │ /status  │    │ /predict │    │ Pipeline │
                       │ (1s poll)│    │ (on req) │    │          │
                       └──────────┘    └──────────┘    └──────────┘
```

**Figure 15.2:** End-to-end sensor data flow from hardware ADC to dashboard.

The pipeline exhibits three temporal resolutions: **fine-grained** (100 Hz sampling at the microcontroller), **batched** (1-second aggregation for network transmission), and **polled** (1-second dashboard refresh). This multi-resolution approach decouples acquisition bandwidth from network bandwidth and browser rendering capacity.

### 15.4.2 Behavioral Data Pipeline

The smartphone behavioral pipeline operates at a 5-minute window granularity, running entirely on-device for privacy preservation (see Section 15.7). The server-side component maintains a per-device ring buffer and assembles 24-hour daily tensors on demand:

```
 Phone              POST /phone/log              Server
 ──────             ────────────────             ──────
 On-device          { device_id,                  device_buffers[device_id]
 aggregation          window_start_unix,           .append(payload)
 (5 min windows)      window_end_unix,
                      keystroke: { 8 feats },     ──→ assemble_daily_tensor()
                      app: { 10 feats },                 │
                      gps: { 7 feats }                   │
                    }                                    ▼
                                                  FusedDailyTensor
                                                  keystroke: (288, 8)
                                                  app:       (288, 10)
                                                  gps:       (288, 7)
                                                  biometric: (288, 7)
                                                       │
                                                       ▼
                                              SentinelFusionModel
                                              (PyTorch TorchScript)
```

### 15.4.3 Request Lifecycle

A typical API request (e.g., `GET /api/v1/dashboard/status`) traverses the following layers:

1. **Flask Routing**: The `dashboard_bp` matches the URL and dispatches to `get_status()`.
2. **Controller Logic**: The route handler orchestrates calls to `SensorService`, `MLService`, and `LogService`.
3. **Service Processing**: `SensorService.get_latest_reading()` delegates to `BiosensorSimulator.get_current_metrics()`, which computes the mathematical model at the current timestamp.
4. **ML Inference**: `MLService.predict_state()` invokes the strategy chain (fusion → sklearn → heuristic).
5. **Feature Extraction**: `extract_gsr_features()` and `extract_hrv_features()` compute statistical descriptors from the rolling 30-sample buffer.
6. **Serialization**: The composite response is serialized to JSON via Flask's `jsonify()`.
7. **Rendering**: The dashboard JavaScript client receives the response and updates DOM elements via `requestAnimationFrame`-aligned batch updates.

---

## 15.5 API Blueprint Structure

The API is organized as a hierarchy of Flask Blueprints, registered at configuration-defined URL prefixes:

**Table 15.2: API Blueprint Registry**

| Blueprint | Prefix | Routes | Service Dependencies |
|-----------|--------|--------|---------------------|
| `sensors_bp` | `/api/v1/sensors` | `GET /latest`, `GET /wave`, `POST /state`, `GET /history` | `SensorService` |
| `ml_bp` | `/api/v1/ml` | `GET|POST /predict` | `SensorService`, `MLService`, `feature_extractor` |
| `dashboard_bp` | `/api/v1/dashboard` | `GET /status`, `GET /stream`, `GET /anomalies`, `GET /voice-logs` | `SensorService`, `MLService`, `LogService`, `feature_extractor` |
| `hardware_bp` | `/api/v1/hardware` | `POST /stream` | `SensorService`, `MLService`, `LogService` |
| `phone_bp` | `/api/v1/phone` | `POST /log`, `GET /daily-tensor`, `GET /device-count` | `SensorService`, `LogService`, `behavioral_schema` |

Blueprint aggregation is performed in `app/api/v1/__init__.py`, which creates a parent blueprint (`api_v1_bp`) and attaches all children via `register_blueprint()`. The parent blueprint is then registered on the Flask application with the configured `API_V1_PREFIX`.

---

## 15.6 Machine Learning Pipeline Architecture

### 15.6.1 Heuristic Rule Engine

The fallback classifier implements a deterministic rule set based on established psychophysiological research. Heart rate and heart rate variability are the primary discriminators for autonomic arousal, while galvanic skin response provides an orthogonal measure of sympathetic activation. The classification operates in two stages:

**Stage 1 — Stress Score Computation**: Three independent factors contribute to an aggregate stress score:

```
stress_score = 0

if mean_hr > 95:   stress_score += 0.4
elif mean_hr > 80: stress_score += 0.2

if rmssd < 25:     stress_score += 0.4
elif rmssd < 35:   stress_score += 0.2

if mean_gsr > 8.0: stress_score += 0.3
elif mean_gsr > 5.0: stress_score += 0.15
```

**Stage 2 — State Assignment**: The clamped stress probability and auxiliary rules produce the final classification:

| Condition | Predicted State | Probability Distribution |
|-----------|----------------|------------------------|
| stress_prob ≥ 0.55 | STRESSED | REST: 1 - p - 0.05, EXCITED: 0.05, STRESSED: p |
| mean_hr > 85 and mean_gsr > 4.5 | EXCITED | REST: 0.20, EXCITED: 0.60, STRESSED: 0.20 |
| otherwise | REST | REST: 1 - p, EXCITED: 0.10, STRESSED: max(p-0.1, 0) |

Probabilities are normalized to sum to 1.0 in all cases.

### 15.6.2 Multi-Modal Fusion Model

The `SentinelFusionModel` (`fusion_model.py`) extends the system's classification capability to five mental-health states by fusing four temporal data modalities. The architecture consists of three principal components:

**TemporalEncoder**: Each modality is processed by an independent bidirectional GRU with two layers, LayerNorm, dropout, and a linear projection. The encoder compresses a (B, 288, F) input tensor to a (B, 64) context vector by extracting the final hidden state from the last GRU layer. Bidirectional processing ensures that each time step's representation incorporates information from both past and future in the 24-hour window.

**CrossModalAttention**: The four modality context vectors (M=4, each dimension 64) are stacked to form a (B, 4, 64) tensor and passed through a multi-head self-attention layer (4 heads). This mechanism learns a weighted combination of modalities that can vary per sample — for instance, attending primarily to GPS features when isolating depressive states, while weighting keystroke features for cognitive fatigue detection. The architecture follows the standard Transformer encoder pattern with residual connections, LayerNorm, and a feed-forward network.

**SensorFeatureEncoder**: A separate MLP processes the 7-element static biometric feature vector that the existing heuristic engine uses. This provides a skip connection from the proven feature set into the fused representation, which is then concatenated with the cross-modal attention output to form a 128-dimensional feature vector for the final classification head.

The complete architecture yields approximately 168,000 trainable parameters, making it suitable for on-device deployment via TorchScript.

### 15.6.3 Training Pipeline

The training script (`train_fusion.py`) generates synthetic training data using class-specific behavioral templates. Each template encodes known psychophysiological correlates:

| Class | HR | GSR | Typing Speed | Backspace Rate | Mobility Radius | Home Time | Late Night Usage |
|-------|-----|-----|-------------|----------------|----------------|-----------|-----------------|
| REST | 68 | 3.0 | 5.5 cps | 4% | 1.2 km | 55% | 2 min |
| STRESSED | 98 | 9.0 | 3.2 cps | 18% | 0.6 km | 75% | 15 min |
| EXCITED | 88 | 7.0 | 7.8 cps | 6% | 3.5 km | 35% | 5 min |
| DEPRESSIVE ISOLATION | 62 | 2.0 | 3.5 cps | 10% | 0.05 km | 98% | 35 min |
| ANXIOUS PACING | 90 | 6.5 | 4.0 cps | 28% | 2.2 km | 60% | 25 min |

Each template is perturbed with Ornstein-Uhlenbeck noise processes to generate realistic intra-day variability while preserving class-specific signatures. The training loop employs AdamW optimization with cosine annealing learning rate scheduling, gradient clipping at unit norm, and an 80/20 train-validation split. Focal loss (gamma = 2.0) is used in place of standard cross-entropy to mitigate class imbalance.

---

## 15.7 Privacy Architecture

The smartphone behavioral data pipeline implements privacy-by-design principles at three levels:

1. **On-Device Aggregation**: Raw keystroke sequences, GPS coordinate pairs, and installed application names are never written to disk or transmitted. Only statistical aggregates (means, standard deviations, rates, counts) computed over 5-minute windows leave the device.

2. **Temporal Coarsening**: The 5-minute window granularity prevents precise reconstruction of individual events. A keystroke flight time distribution reveals typing rhythm without exposing typed content; location variance reveals mobility patterns without exposing visited addresses.

3. **Feature Selection**: The feature set is deliberately constrained to behavioral markers with established clinical relevance. Phone features that could enable re-identification (unique app signatures, precise location clusters) are excluded.

The server-side `_log_anomaly_hints()` function in `phone.py` operates exclusively on these aggregated features, detecting high-level behavioral markers such as backspace rates exceeding 25% (cognitive fatigue indicator), home time ratios exceeding 95% with sub-100-meter mobility radius (depressive isolation indicator), and late-night usage exceeding 30 minutes (sleep disruption indicator). No raw data is ever stored.

---

## 15.8 Deployment Architecture

The system is designed for single-machine deployment on a local server (e.g., a Raspberry Pi or workstation running the Flask application), with the ESP32 hardware node and smartphone clients connecting over the local network. The Flask development server (Werkzeug) is suitable for development and testing, while Gunicorn is recommended for production deployment behind a reverse proxy such as Nginx.

The embedded firmware stores no credentials in plaintext beyond the Wi-Fi SSID and password in `Config.h`, which are intended to be configured per-deployment. All HTTP communication occurs over plain HTTP in the current implementation; production deployments should enable TLS by replacing `WiFiClient` with `WiFiClientSecure` in `TransmitManager.h` and serving the Flask application behind an HTTPS-terminating reverse proxy.
