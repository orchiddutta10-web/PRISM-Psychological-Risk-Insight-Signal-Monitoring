<<<<<<< HEAD
# PRISM — Repository Overview

Short description
- PRISM is a consent-first behavioral telemetry ingestion and guardian alerting platform.

Local development quickstart

1. Start supporting services (Postgres, Redis) and API/dashboard with Docker Compose:

```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism'
docker-compose up --build
```

2. Or run services locally:
- API:
```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism\services\api'
C:/path/to/python -m pip install -r requirements.txt
C:/path/to/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
- Dashboard:
```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism\apps\dashboard'
npm install
npm run dev
# Dashboard dev server available at http://localhost:3000
```

Key local URLs
- API root: http://localhost:8000/
- API docs (Swagger): http://localhost:8000/docs
- Dashboard: http://localhost:3000/

Why the site might not be visible
- Services are not running — verify `docker-compose ps` or check the terminal with `uvicorn` / `next dev` output.
- Port conflicts or firewall blocking — ensure Windows firewall allows `node.exe` and `python.exe` through, or use `netstat -ano | findstr 8000` to confirm listening PID.
- Running inside Docker but accessing from emulator/device — use host IP (e.g., `10.0.2.2` for Android emulator) or publish ports in Docker Compose.
- WebSocket endpoints (`/api/v1/events/ws`) are not accessible via simple GET requests — you must use a WebSocket client. If you see warnings about WebSocket support, install `uvicorn[standard]` or `websockets`.

Testing
- Run API tests:
```powershell
Set-Location 'c:\Users\Jyotishmoy Gogoi\prism\services\api'
C:/path/to/python -m pytest app/tests/test_api.py
```

Repository structure highlights
- `services/api` — FastAPI backend
- `apps/dashboard` — Next.js dashboard
- `infra/docker-compose.yml` — local integration for Postgres, Redis, API, dashboard
- `docs/` — ADRs and runbooks (added)

Contributing
- Follow existing code style and run tests before opening PRs.
- Add ADRs for significant architectural changes.

=======
# SentinelMind V3.0 Backend

SentinelMind V3.0 is a highly scalable, service-oriented Flask backend designed to process high-frequency biosensor signals (such as Galvanic Skin Response/GSR and Photoplethysmogram/Pulse) and perform real-time stress classification using machine learning.

## Features
- **Application Factory Pattern**: Clean, modular structure decoupling configuration, blueprints, and core logic.
- **Biosensor Simulator**: High-fidelity simulator modeling autonomic states (`REST`, `STRESSED`, `EXCITED`) using mathematical signal waveforms and noise components. Enables development without physical hardware.
- **Decoupled Service Layer**: Decoupled routes, service rules, and ML pipelines ensuring easy scalability and replacement of simulators with real sensors later.
- **Scientific DSP & HRV Pipeline**: Built-in stubs for Butterworth filters (SciPy) and HRV metric calculations (SDNN, RMSSD) in Pandas/NumPy.
- **Comprehensive API Tests**: Full test suite built on Pytest.

---

## Directory Structure

```
sentinelmind/
├── app.py                  # Application entry point
├── config.py               # Config classes (dev, testing, production)
├── requirements.txt        # Python dependency manifest
├── README.md               # Setup & usage manual
├── app/
│   ├── __init__.py         # Flask App Factory setup
│   ├── api/
│   │   ├── __init__.py     # Parent Blueprint registration
│   │   └── v1/
│   │       ├── __init__.py # Aggregated API v1 Blueprint
│   │       ├── sensors.py  # Endpoints for mock/real sensor streams
│   │       └── ml.py       # Endpoints for stress predictions
│   ├── core/
│   │   ├── __init__.py
│   │   └── exceptions.py   # Global HTTP error handling
│   ├── services/
│   │   ├── __init__.py
│   │   ├── sensor_service.py # Interfacing simulator or databases
│   │   └── ml_service.py     # Handling ML loading & prediction fallbacks
│   ├── ml/
│   │   ├── __init__.py
│   │   ├── preprocess.py   # Butterworth filtering algorithms (SciPy)
│   │   └── feature_extractor.py # HRV & GSR statistical feature extraction
│   └── utils/
│       ├── __init__.py
│       └── simulator.py    # Math generator of physiological waves
└── tests/
    ├── __init__.py
    ├── conftest.py         # Pytest fixtures and mock client
    └── test_api.py         # Unit & integration testing suites
```

---

## Getting Started

### 1. Setup Environment
Ensure you have Python 3.8+ installed. Set up a virtual environment and install the dependencies:

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Running the Server
Launch the development server:

```bash
python app.py
```
By default, the server runs on `http://localhost:5000`.

### 3. Running Tests
Run the test suite using `pytest`:

```bash
pytest -v
```

---

## API Documentation

### 1. Health Status
- **Endpoint**: `GET /health`
- **Response**:
  ```json
  {
    "environment": "development",
    "project": "SentinelMind V3.0",
    "status": "online"
  }
  ```

### 2. Retrieve Latest Sensor Snapshot
- **Endpoint**: `GET /api/v1/sensors/latest`
- **Response**:
  ```json
  {
    "status": "success",
    "data": {
      "timestamp": 178393848.12,
      "state": "REST",
      "heart_rate_bpm": 64.21,
      "inter_beat_interval_ms": 934.4,
      "gsr_microsiemens": 3.42,
      "eda_tonic_scl": 3.41,
      "eda_phasic_scr": 0.01
    }
  }
  ```

### 3. Override Simulator Physiological State
Use this endpoint to change the autonomic state of the user to test prediction robustness.
- **Endpoint**: `POST /api/v1/sensors/state`
- **Body**:
  ```json
  {
    "state": "STRESSED"
  }
  ```
- **Allowed States**: `REST`, `STRESSED`, `EXCITED`

### 4. Fetch Predicted Stress State
Uses the current buffer window of sensor readings to predict the user's stress level.
- **Endpoint**: `GET /api/v1/ml/predict`
- **Response**:
  ```json
  {
    "status": "success",
    "samples_analyzed": 30,
    "features": {
      "mean_gsr": 11.23,
      "std_gsr": 0.05,
      "mean_scl": 11.20,
      "max_scr": 0.03,
      "mean_hr": 104.5,
      "sdnn": 1.45,
      "rmssd": 20.3
    },
    "prediction": {
      "predicted_state": "STRESSED",
      "confidence": 0.85,
      "probabilities": {
        "REST": 0.1,
        "EXCITED": 0.05,
        "STRESSED": 0.85
      },
      "engine": "Heuristic Rule-Engine (Fallback)"
    }
  }
  ```
>>>>>>> c49b7b585948868711fdd82bfadc47730d561003
