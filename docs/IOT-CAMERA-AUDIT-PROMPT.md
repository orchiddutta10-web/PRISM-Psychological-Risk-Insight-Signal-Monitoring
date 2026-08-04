# PRISM IoT End-to-End Audit Prompt

## Mission

Perform a fully automated, evidence-based end-to-end audit of the PRISM IoT pipeline running on the Raspberry Pi 4 Model B. Treat the **Raspberry Pi camera subsystem as a first-class component**, not a peripheral. The audit must verify sensor telemetry **and** the complete video pipeline from hardware through to the live dashboard.

## Non-negotiable constraints

- No message content, screenshots, video frames, or raw media are captured or stored.
- Only metadata, telemetry, and configuration may be collected.
- Every finding must include the exact command used, the actual output, and a recommended minimal fix.
- Do not invent hardware models. Use the exact model numbers listed below, or mark as `UNKNOWN` if a model cannot be determined.

## IoT component models

| Component | Model |
|---|---|
| Host SBC | Raspberry Pi 4 Model B |
| ESP32 board | `<fill in exact model>` |
| Pulse sensor | `<fill in exact model>` |
| LCD module | `<fill in exact model>` |
| Audio module | `<fill in exact model>` |
| Camera | `<fill in exact model>` |
| Power supply | `<fill in exact model>` |

## Primary goal pipeline

```text
Pulse Sensor
      ↓
ESP32 Firmware
      ↓
Wireless Communication
      ↓
Raspberry Pi 4 Backend
      ↓
API / MQTT / WebSocket
      ↓
Frontend Dashboard
      ↓
Live User Interface

Raspberry Pi Camera
      ↓
libcamera / V4L2
      ↓
Video Processing / Streaming
      ↓
Backend
      ↓
Frontend Dashboard
      ↓
Live Camera Feed
```

## Phase 1 — Inventory and hardware baseline

Locate every hardware component in the IoT chain and record:

- exact model and revision
- serial number or unique identifier (if available, metadata only)
- firmware/bootloader version
- connection interface (USB/UART/I2C/SPI/CSI/Wi-Fi/Bluetooth)
- power source and measured voltage/current (if possible)

Verify the camera is physically present and connected.

## Phase 2 — ESP32 firmware audit

For the ESP32 pulse-sensor firmware:

- Verify build compiles without warnings.
- Check pin mapping matches the documented hardware.
- Confirm non-blocking loop architecture.
- Validate BPM calculation and peak detection.
- Confirm LCD updates do not block telemetry.
- Verify audio alert trigger behavior.
- Confirm serial output format matches the Raspberry Pi bridge parser.

## Phase 3 — Wireless communication audit

- Confirm ESP32 connects to the configured Wi-Fi network.
- Verify data reaches the Raspberry Pi bridge.
- Check packet format, frequency, and ordering.
- Verify reconnect and retry logic.
- Confirm no hardcoded credentials in source or logs.

## Phase 4 — Raspberry Pi backend audit

- Verify `prism_edge` service starts on boot.
- Check Python environment and dependency versions.
- Verify bridge parses ESP32 telemetry correctly.
- Confirm data is forwarded to the API with valid JWT.
- Check offline queue behavior.
- Verify health and status endpoints.

## Phase 4A — Raspberry Pi camera audit

Treat the camera as a first-class pipeline. Locate and verify the complete Raspberry Pi camera subsystem.

### Determine automatically

- camera model
- CSI or USB interface
- driver in use
- libcamera configuration
- V4L2 compatibility
- device permissions
- kernel modules
- startup configuration

### Hardware verification

- camera detected
- cable orientation
- interface enabled
- supported resolutions
- supported frame rates
- autofocus (if supported)
- image quality
- thermal stability

### Raspberry Pi configuration

- camera interface enabled
- firmware compatibility
- GPU memory allocation (if required)
- device tree configuration
- boot configuration
- permissions

### Camera pipeline

Determine automatically whether the project uses:

- libcamera
- Picamera2
- OpenCV
- FFmpeg
- GStreamer
- Motion
- MJPEG Streamer
- custom implementation

### Audit the pipeline for

- initialization
- frame acquisition
- buffering
- latency
- dropped frames
- reconnect logic
- error handling
- memory usage
- CPU utilization

### Backend integration

- camera service startup
- stream availability
- API endpoints
- authentication
- MJPEG/WebRTC/WebSocket/RTSP implementation
- timeout handling
- graceful recovery

### Frontend integration

- live video rendering
- refresh latency
- browser compatibility
- reconnect behavior
- loading states
- stream interruption handling
- synchronization with sensor telemetry

### End-to-end camera validation

```text
Camera
      
Driver
      ↓
Frame Capture
      ↓
Processing
      ↓
Backend
      ↓
Streaming Endpoint
      ↓
Dashboard
      ↓
Live Camera Feed
```

For each stage document:

- expected input
- actual input
- expected output
- actual output
- validation method
- identified issues
- recommended minimal fix

## Phase 5 — API / MQTT / WebSocket audit

- Verify telemetry ingestion endpoints accept and store pulse data.
- Confirm JWT auth is required and valid.
- Check schema validation for incoming events.
- Verify WebSocket/MQTT topics for real-time updates.
- Confirm camera stream endpoints are reachable and authenticated.
- Check rate limiting and timeout handling.

## Phase 6 — End-to-end validation

```text
Pulse Sensor
      ↓
ADC
      
ESP32
      ↓
Wireless
      ↓
Backend
      ↓
Dashboard

Camera
      ↓
Frame Capture
      ↓
Backend
      ↓
Streaming Service
      ↓
Dashboard
```

Verify that:

- sensor updates continue while video is streaming
- camera streaming does not block telemetry
- dashboard displays synchronized sensor and camera data
- CPU, RAM, and network utilization remain within acceptable limits
- latency stays acceptable under simultaneous telemetry and video streaming

## Phase 7 — Frontend dashboard audit

- Verify sensor telemetry renders on the dashboard.
- Verify live camera feed renders.
- Check refresh intervals and reconnection behavior.
- Confirm mobile and desktop compatibility.
- Verify role-based access control.

## Phase 8 — Performance audit

- ESP32 loop timing and CPU usage
- Raspberry Pi CPU/RAM/network usage under load
- API response times
- Database query performance
- Dashboard build and runtime performance
- Camera frame rate consistency
- Frame drops
- Video latency
- Encoder efficiency
- Bandwidth usage
- CPU usage during streaming
- GPU usage (if applicable)
- Synchronization between video and telemetry
- Thermal throttling during prolonged operation

## Phase 9 — Security review

- No hardcoded secrets in firmware or source.
- JWT authentication on all protected routes.
- RBAC enforced on guardian dashboard routes.
- TLS in transit.
- Sensitive fields encrypted at rest.
- Immutable audit logging for every data access.
- Unauthorized camera access prevention.
- Exposed video endpoints checked.
- Stream authentication verified.
- HTTPS/TLS support confirmed where applicable.
- RTSP/WebSocket security reviewed.
- Camera permission configuration verified.

## Deliverables

Produce a single markdown report with:

### 1. Executive summary

- overall status
- critical issues count
- warnings count
- pass/fail per phase

### 2. Hardware inventory

| Component | Model | Interface | Status |
|---|---|---|---|
| `<exact model>` | ... | ... | PASS/FAIL |

### 3. Telemetry system assessment

- pulse sensor status
- ESP32 status
- wireless status
- backend ingestion status
- dashboard rendering status

### 4. Camera system assessment

- detected camera hardware
- interface (CSI/USB)
- driver
- streaming framework
- supported resolutions
- supported frame rates
- measured latency
- CPU usage
- memory usage
- frame loss
- detected issues
- fixes applied
- remaining risks

### 5. Issue log

| # | Severity | Phase | Finding | Command / Evidence | Fix |
|---|---|---|---|---|---|

### 6. Recommendations

List minimal, prioritized next steps.

## Evidence rules

For every PASS or FAIL, include:

- the exact command or test performed
- the actual output or observed behavior
- the expected output or behavior
- the minimal fix or validation
