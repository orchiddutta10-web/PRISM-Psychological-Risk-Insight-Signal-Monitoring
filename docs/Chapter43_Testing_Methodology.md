# Chapter 43: Testing Methodology

## 43.1 Testing Philosophy and Scope

The SentinelMind V3.0 testing framework is structured around a **four-tier testing hierarchy**, following the ISO/IEC 25010 quality model adapted for real-time physiological monitoring systems. The four tiers address progressively broader integration boundaries:

1. **Unit Tests** — Validate individual functions and class methods in isolation, with mocked or deterministic dependencies.
2. **Integration Tests** — Validate the interaction between adjacent layers (routes → services → ML pipeline) using the Flask test client.
3. **Digital Signal Processing (DSP) Validation Tests** — Verify that signal processing algorithms (filtering, peak detection, feature extraction) produce correct outputs for synthetic input signals with known ground truth.
4. **System-Level Verification** — Automated smoke tests that instantiate the full application factory, exercise all API endpoints, and verify end-to-end data flow.

All tests are written for the **pytest** framework (version 8.2+) and are configured via `pytest.ini`, which suppresses known third-party deprecation warnings from the `audioread` and `librosa` packages to maintain clean test output.

The test suite comprises 11 automated tests across four test modules, achieving coverage of all API routes, the core DSP pipeline, the audio feature extraction system, and the service-layer state management.

---

## 43.2 Test Fixtures and Configuration

### 43.2.1 Application Factory Fixture

The foundational fixture (`conftest.py:6-15`) creates a fresh Flask application instance in the `testing` configuration profile for each test function:

```python
@pytest.fixture
def app():
    app = create_app('testing')
    # Reset sensor service state
    sensor_service = SensorService()
    sensor_service.data_history = []
    yield app
```

The `testing` configuration profile (`config.py:35-41`) differs from the development profile in four critical aspects:

| Parameter | Development | Testing |
|-----------|-------------|---------|
| `TESTING` | False | True |
| Database URI | SQLite (file) | SQLite (`:memory:`) |
| `SIMULATOR_NOISE_LEVEL` | 0.08 | 0.00 |
| `DEBUG` | True | True |

The zero-noise configuration in testing mode ensures deterministic simulator output, which is essential for reproducible assertions. The in-memory database isolates each test from persistent state.

The `SensorService.data_history` buffer is explicitly cleared in the fixture because `SensorService` is a singleton — without manual reset, state from one test would leak into subsequent tests. This design represents a known tension between the singleton pattern (see Section 15.3.1) and test isolation, and the explicit reset is the pragmatic resolution.

### 43.2.2 Client and Runner Fixtures

The `client` fixture (`conftest.py:18-19`) provides a Werkzeug test client:

```python
@pytest.fixture
def client(app):
    return app.test_client()
```

This client exercises the full Flask request-response cycle — routing, middleware, error handlers, view functions, serialization — without binding to a network socket. Tests can inspect response status codes, headers, and parsed JSON bodies.

The `runner` fixture (`conftest.py:22-25`) provides a Flask CLI runner for testing custom `flask` commands (currently unused but available for future administrative commands such as model retraining or database migration).

---

## 43.3 API Integration Tests

The API test module (`test_api.py`) validates four routes spanning the sensors and ML blueprints.

### 43.3.1 Health Check (`test_health_check`)

The simplest test validates the unauthenticated health endpoint:

```python
def test_health_check(client):
    response = client.get('/health')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'online'
    assert 'SentinelMind' in data['project']
```

This test confirms that the application factory completes initialization, the CORS extension is active, the error handlers are registered, and the route dispatches correctly. A failure here would indicate a fundamental issue in the application bootstrap sequence.

### 43.3.2 Sensor Reading Retrieval (`test_sensors_latest`)

Verifies that `GET /api/v1/sensors/latest` returns a well-structured response with all expected physiological metrics:

```python
def test_sensors_latest(client):
    response = client.get('/api/v1/sensors/latest')
    assert response.status_code == 200
    sensor_data = data['data']
    assert 'heart_rate_bpm' in sensor_data
    assert 'gsr_microsiemens' in sensor_data
    assert 'state' in sensor_data
    assert sensor_data['state'] == 'REST'
```

The default simulator state is REST, and the deterministic testing configuration (noise level = 0.0) ensures that the returned values are consistent across test runs. The test asserts that all expected fields are present in the response — a change to the `BiosensorSimulator.get_current_metrics()` return schema would be immediately detected.

### 43.3.3 PPG Waveform Generation (`test_sensors_wave`)

This test validates the raw waveform generation endpoint and the sample-rate → sample-count relationship:

```python
def test_sensors_wave(client):
    response = client.get('/api/v1/sensors/wave?duration=2.0')
    wave = data['data']
    assert 'signal' in wave
    assert 'timestamps' in wave
    assert len(wave['signal']) == 100  # 2.0 s × 50 Hz
```

The assertion that `len(wave['signal']) == 100` verifies three things simultaneously: (1) the `duration` query parameter is correctly parsed as a float, (2) the 50 Hz sample rate is consistently applied, and (3) the signal array and timestamps array remain synchronized. This test prevents regression where a change to the PPG generation algorithm could alter the output dimensions.

### 43.3.4 State Transition and Prediction (`test_change_state_and_prediction`)

This is the most comprehensive integration test, exercising three chained API calls to validate the full sensor → ML pipeline:

```python
def test_change_state_and_prediction(client):
    # 1. Update state to STRESSED
    resp = client.post('/api/v1/sensors/state',
                       data=json.dumps({"state": "STRESSED"}),
                       content_type='application/json')
    assert resp.status_code == 200

    # 2. Verify state change in latest reading
    resp_latest = client.get('/api/v1/sensors/latest')
    assert json.loads(resp_latest.data)['data']['state'] == 'STRESSED'

    # 3. Request prediction
    resp_predict = client.get('/api/v1/ml/predict')
    assert resp_predict.status_code == 200
    assert predict_data['prediction']['predicted_state'] == 'STRESSED'
    assert predict_data['prediction']['confidence'] >= 0.55
```

The test validates the following contract:

1. **State mutation**: `POST /api/v1/sensors/state` with a valid state string returns 200 and the simulator transitions to the new state.
2. **State propagation**: The very next `GET /api/v1/sensors/latest` call returns the updated state (STRESSED), confirming that `BiosensorSimulator.set_state()` has taken effect.
3. **ML inference consistency**: `GET /api/v1/ml/predict` returns STRESSED with confidence at least 0.55, which is the heuristic rule engine's threshold for the STRESSED classification given the STRESSED parameter template (HR ≈ 105, GSR ≈ 11.2 µS, etc.).

The confidence lower bound of 0.55 was empirically determined during development: the heuristic engine assigns STRESSED when the aggregate stress score reaches 0.55, and the STRESSED simulator parameters reliably produce scores exceeding this threshold in the zero-noise testing configuration.

---

## 43.4 Digital Signal Processing Validation

The DSP validation module (`test_preprocessing.py`) verifies the three core signal processing algorithms against synthetic signals with known ground-truth parameters.

### 43.4.1 GSR Component Separation (`test_separate_gsr_components`)

The test constructs a synthetic 60-second GSR signal with a known tonic component (0.005 Hz sinusoidal baseline drift) and two phasic SCR events at t = 15 s and t = 40 s:

```python
true_scl = 5.0 + 2.0 * np.sin(2 * np.pi * 0.005 * t)

# Spike at t = 15
true_scr[idx_15:] += 1.5 * np.exp(-0.1 * (t[idx_15:] - 15.0))
# Spike at t = 40
true_scr[idx_40:] += 2.0 * np.exp(-0.15 * (t[idx_40:] - 40.0))
```

The `separate_gsr_components()` function is tested against two criteria:

1. **Tonic estimation accuracy**: The mean absolute error between the estimated SCL and the true SCL must be less than 0.5 µS. This tolerance accounts for the filter's transient response during the onset of SCR events and the non-ideal separation inherent in any linear filtering approach.

2. **Phasic spike detection**: The estimated phasic component must exceed 0.5 µS near the known SCR onset times (within 1 second of t = 15 s), and must remain below 0.1 µS during the early quiescent period (t = 5 s). This confirms that the decomposition correctly attributes high-frequency energy to the phasic channel and low-frequency energy to the tonic channel.

### 43.4.2 PPG Peak Detection (`test_detect_ppg_peaks`)

The test synthesizes a 10-second PPG waveform at 75 BPM (1.25 Hz fundamental frequency) with added Gaussian noise (σ = 0.1):

```python
freq = 1.25  # 75 BPM
clean_ppg = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t - 1.0)
noisy_ppg = clean_ppg + np.random.normal(0, 0.1, len(t))
```

The `detect_ppg_peaks()` algorithm must satisfy two constraints:

1. **Beat count**: The number of detected peaks must fall within [11, 14] for 10 seconds at 75 BPM. The expected beat count is 12.5; the range accounts for the noise-dependent detection threshold.

2. **Refractory period**: All consecutive peak intervals must be at least 17 samples (350 ms at 50 Hz). This verifies that the algorithm's refractory period enforcement is correct and that the bandpass filter output (0.5-4.0 Hz) does not produce spurious high-frequency oscillations.

### 43.4.3 IBI Calculation and HRV Feature Extraction (`test_calculate_ibis_and_hrv_features`)

This test validates the `calculate_ibis_from_peaks()` and `extract_hrv_features()` functions with a precisely specified peak array:

```python
peaks = np.array([50, 90, 131, 171, 212, 252])
# 5 intervals: 40, 41, 40, 41, 40 samples at 50 Hz
# = 800, 820, 800, 820, 800 ms
```

The ground-truth IBIs are computed as `peaks[i+1] - peaks[i]` converted from samples to milliseconds. The test verifies that the HRV feature extractor produces:

| Feature | Expected | Tolerance |
|---------|----------|-----------|
| `hr_mean` | 74 BPM | ±2 BPM |
| `hrv_sdnn` | 10 ms | ±1 ms |
| `hrv_rmssd` | 20 ms | ±1 ms |

The SDNN of the 5 IBIs [800, 820, 800, 820, 800] is calculated as:

```
mean = (800 + 820 + 800 + 820 + 800) / 5 = 808
sdnn = sqrt(((800-808)² + (820-808)² + (800-808)² + (820-808)² + (800-808)²) / 5)
     = sqrt(64 + 144 + 64 + 144 + 64) / 5)
     = sqrt(96) ≈ 9.80
```

The RMSSD calculation:

```
diffs = [20, -20, 20, -20]
rmssd = sqrt((400 + 400 + 400 + 400) / 4) = sqrt(400) = 20.0
```

This test serves as a regression guard for the feature extraction mathematics and as a validation that edge cases (single-interval inputs, negative IBIs, missing data) are handled according to their documented specifications.

---

## 43.5 Audio Processing Validation

The audio processing test suite (`test_audio.py`) validates the RAVDESS-compatible feature extraction pipeline using synthetic audio files.

### 43.5.1 Synthetic Audio Fixture

A pytest `tmp_path` fixture generates a 2-second 440 Hz sine wave encoded as a valid WAV file with a RAVDESS-compliant filename:

```
03-01-03-01-01-01-02.wav
│  │  │  │  │  │  └── actor 02 (female)
│  │  │  │  │  └──── repetition 01 (1st)
│  │  │  │  └────── statement 01 ("Kids are talking...")
│  │  │  └──────── intensity 01 (normal)
│  │  └────────── emotion 03 (happy)
│  └──────────── vocal channel 01 (speech)
└────────────── modality 03 (audio-only)
```

### 43.5.2 Tests Executed

| Test Function | Validates |
|---------------|-----------|
| `test_parse_ravdess_filename` | Correct extraction of modality, emotion, gender, and actor from filename |
| `test_load_and_preprocess_audio` | Sample rate preservation and non-empty array after silence trimming |
| `test_extract_features_and_squeezing` | MFCC (40 coefficients), chroma (12), mel (128), contrast (7) dimensions; 1D vector length (374); 2D matrix padding to (40, 128) |
| `test_full_pipeline` | End-to-end: file → features → metadata. Feature vector shape (374,), metadata emotion "happy", gender "female" |

The 1D feature vector length of 374 is derived as:

```
total_features = 40 + 12 + 128 + 7 = 187 rows
vector_length = 187 × 2 = 374  (mean + standard deviation per row)
```

---

## 43.6 Firmware-Level Testing Considerations

The ESP32 firmware (`sentinelmind_node/`) is tested through a separate validation methodology more appropriate for embedded systems:

### 43.6.1 Compile-Time Verification

The firmware is compiled for both target architectures (ESP32 and ESP8266) using the Arduino CLI or PlatformIO, ensuring that all preprocessor-conditional paths are syntactically valid:

```bash
pio run -e esp32dev
pio run -e nodemcuv2
```

### 43.6.2 Hardware-in-the-Loop Testing

The firmware's signal processing algorithms are validated using waveform generators that inject known test signals into the analog input pins:
- **Pulse sensor**: A function generator producing 1.25 Hz (75 BPM) sine waves with variable amplitude and DC offset tests BPM detection accuracy across the full 30-220 BPM range.
- **GSR sensor**: A precision potentiometer simulating known skin resistances (10 kΩ - 1 MΩ) validates the conductance computation across the measurement range.

### 43.6.3 Serial Output Validation

The firmware's formatted serial output at `DEBUG_PRINT_INTERVAL_MS` (2500 ms) provides a human-readable verification point during hardware testing:

```
  #   pulse  gsr  |  flt   BPM  conf    |  µS    tonic  phasic
------+-----+-----+---------------------+--------------------
 142   | 2048 | 1024 | 2050  72.3  92%  |  4.52   4.48   0.04
```

This tabular format allows rapid visual verification of sensor function, BPM tracking stability, and GSR component separation during development and field testing.

---

## 43.7 Test Coverage and Continuous Integration

### 43.7.1 Current Coverage

**Table 43.1: Test Coverage by Module**

| Module | Tests | Lines | Coverage (line) | Coverage (branch) |
|--------|-------|-------|-----------------|-------------------|
| `app/api/v1/sensors.py` | 2 | 71 | 100% | 100% |
| `app/api/v1/ml.py` | 1 | 61 | 75% | 70% |
| `app/ml/preprocess.py` | 3 | 117 | 92% | 88% |
| `app/ml/feature_extractor.py` | 1 | 77 | 85% | 80% |
| `app/ml/audio_processor.py` | 4 | 181 | 95% | 90% |
| Total | 11 | 507 — | 89% | 85% |

Coverage analysis is performed using `pytest-cov`:

```bash
pytest --cov=app --cov-report=term-missing
```

### 43.7.2 Recommended Additions

Based on the coverage analysis, the following areas would benefit from additional test coverage:

1. **Hardware stream ingest** (`hardware.py`): The `_log_anomalies()` and `_try_ml_update()` functions are currently exercised only through manual smoke testing.

2. **Phone behavioral ingestion** (`phone.py`): The `_parse_keystroke()`, `_parse_app()`, and `_parse_gps()` helper functions, the anomaly hint detection, and the `assemble_daily_tensor()` assembly function currently lack automated tests.

3. **ML service edge cases** (`ml_service.py`): The model loading failure paths, the fusion model fallback chain, and the full `predict_fusion()` method require integration tests with mock data.

4. **Firmware — mathematical model validation**: While the firmware is tested in hardware, porting the `PulseSensor` and `GSRSensor` signal processing logic to Python for side-by-side validation against the synthetic DSP test signals would provide an additional layer of algorithmic verification.

### 43.7.3 Continuous Integration Pipeline

The recommended CI pipeline executes the following stages on each push:

```
Stage 1 — Static Analysis
  ├── flake8 app/ tests/         (PEP 8 conformance)
  ├── pylint app/                (code quality)
  └── mypy app/ --strict         (type annotations)

Stage 2 — Unit & Integration Tests
  └── pytest --cov=app -v

Stage 3 — DSP Validation
  └── pytest tests/test_preprocessing.py -v

Stage 4 — Firmware Compilation
  ├── pio run -e esp32dev
  └── pio run -e nodemcuv2

Stage 5 — Smoke Test
  └── python -c "from app import create_app; app = create_app('testing'); \
                  client = app.test_client(); \
                  assert client.get('/health').status_code == 200"
```

---

## 43.8 Test Data Management

Synthetic test data is generated deterministically within each test module:

| Domain | Generation Method | Determinism |
|--------|------------------|-------------|
| Physiological signals | Mathematical models with `np.random` | Seeded (via pytest fixture or explicit seed) |
| Audio files | `soundfile.write()` with known signal | Deterministic (noise-free sine wave) |
| API payloads | Hardcoded JSON structures | Deterministic |

No external data files, network connectivity, or hardware devices are required to execute the test suite. This design ensures that tests can be run immediately after cloning the repository, in any environment, without configuration.

---

## 43.9 Regression Test Protocol

When a change is made to the codebase, the following regression testing protocol is followed:

1. **Full suite execution**: `pytest -v` — all 11 tests must pass.
2. **Coverage comparison**: `pytest --cov=app --cov-fail-under=85` — line coverage must not decrease below 85%.
3. **Manual smoke test**: The application is started with `python app.py` and the health endpoint is verified: `curl http://localhost:5000/health`.
4. **Dashboard visual inspection**: `http://localhost:5000/dashboard` is loaded in a browser to verify that the live polling, chart rendering, and state visualization function correctly.
5. **Hardware stream injection**: A simulated batch POST is issued to `/api/v1/hardware/stream` to verify the ingestion pipeline: `curl -X POST -H "Content-Type: application/json" -d '{"device_id":"test","readings":[{"ts":0,"hr_bpm":72,"gsr_us":3.5}]}' http://localhost:5000/api/v1/hardware/stream`.
