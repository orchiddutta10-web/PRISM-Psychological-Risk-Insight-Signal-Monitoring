# Improved Prompt — Project Prism Hardware & Dashboard Integration Audit

## Role

You are a senior Embedded Systems Engineer, IoT Systems Engineer, Raspberry Pi Engineer, ESP32 Firmware Engineer, Backend Engineer, Frontend Engineer, DevOps Engineer, and Software Quality Auditor.

Your objective is to perform a comprehensive audit of the entire **Project Prism** codebase and deployment running on my Raspberry Pi 4 and ESP32.

Your priority is **correctness, reliability, traceability, and minimal changes**.

Never assume a component is working simply because code exists.

Every conclusion must be supported by evidence from the codebase, configuration, logs, build output, or runtime behavior.

---

## Primary Goal

Verify the complete hardware/software pipeline, treating the **Raspberry Pi camera subsystem as a first-class component** alongside the pulse-sensor telemetry pipeline:

```text
Pulse Sensor
      ↓
ESP32 Firmware
      ↓
Wireless Communication
      
Raspberry Pi Backend
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

Identify every failure point.

For every issue:

1. Identify it.
2. Explain the root cause.
3. Propose the smallest safe fix.
4. Implement the fix.
5. Verify the result.
6. Report any remaining risks.

Do **not** rewrite working code simply because a different implementation is possible.

Preserve the current architecture whenever feasible.

---

## Audit Methodology

Proceed sequentially.

Do not skip steps.

If information is missing, stop and request only the specific information required instead of making assumptions.

Whenever you modify code:

* explain why
* keep changes minimal
* preserve compatibility
* avoid regressions
* verify behavior after modification

---

# Phase 1 — Repository Discovery

Search the entire workspace.

Identify all relevant components including:

### ESP32

* Arduino projects
* PlatformIO projects
* firmware
* libraries
* hardware abstraction

### Raspberry Pi

* Python
* Flask
* FastAPI
* Django
* Node.js
* Express
* Go
* Rust
* C/C++

### Communication

* MQTT
* WebSocket
* HTTP
* REST
* TCP
* UDP
* BLE
* Serial
* I2C
* SPI

### Frontend

* React
* Vue
* Angular
* HTML
* JavaScript
* TypeScript
* Chart libraries

### Configuration

* .env
* YAML
* JSON
* TOML
* systemd
* Docker
* docker-compose
* nginx
* startup scripts

### Database

* SQLite
* PostgreSQL
* MySQL
* MariaDB
* MongoDB

### Documentation

* README
* setup guides
* hardware notes

Produce an architecture summary including:

* project structure
* detected technologies
* dependencies
* communication flow
* startup sequence
* hardware interfaces

---

# Phase 2 — ESP32 Firmware Audit

Locate the firmware.

Verify:

## Build

* compiles successfully
* libraries installed
* warnings
* errors
* SDK compatibility

## Initialization

Verify:

* setup()
* peripheral initialization
* watchdog configuration
* memory allocation
* error handling

## Runtime

Check:

* loop()
* blocking code
* delays
* timing
* task scheduling
* reconnect logic
* heap fragmentation
* memory leaks

## Pulse Sensor

Verify:

* ADC pin
* ADC attenuation
* sampling frequency
* filtering
* BPM algorithm
* calibration
* noise rejection
* invalid signal detection

Confirm readings are stable.

## LCD

Verify:

* interface
* I2C address
* initialization
* update frequency
* refresh logic
* formatting
* error recovery

## Buzzer

Verify:

* GPIO assignment
* PWM/tone generation
* alarm thresholds
* non-blocking behavior
* timing accuracy

---

# Phase 3 — Communication Layer

Determine automatically whether communication uses:

* MQTT
* HTTP
* WebSocket
* TCP
* UDP
* BLE
* another protocol

Audit:

* connection establishment
* reconnection
* retry logic
* packet format
* serialization
* latency
* duplicate packets
* packet loss
* timeout handling
* heartbeat mechanism

Validate payload structure.

If communication is unreliable, improve reliability while preserving the existing architecture whenever possible.

---

# Phase 4 — Raspberry Pi Backend

Locate backend services.

Verify:

* startup
* routing
* APIs
* WebSocket
* MQTT
* logging
* configuration
* exception handling
* graceful shutdown

Validate:

* incoming JSON
* malformed packets
* invalid sensor values
* timestamp handling
* database writes (if applicable)

---

# Phase 4A — Raspberry Pi Camera Audit

Treat the Raspberry Pi camera as a first-class component in the end-to-end audit.

Locate and verify the complete camera subsystem.

## Determine automatically

* camera model
* CSI or USB interface
* driver in use
* libcamera configuration
* V4L2 compatibility
* device permissions
* kernel modules
* startup configuration

## Hardware verification

* camera detected
* cable orientation
* interface enabled
* supported resolutions
* supported frame rates
* autofocus (if supported)
* image quality
* thermal stability

## Raspberry Pi configuration

* camera interface enabled
* firmware compatibility
* GPU memory allocation (if required)
* device tree configuration
* boot configuration
* permissions

## Camera pipeline

Determine automatically whether the project uses:

* libcamera
* Picamera2
* OpenCV
* FFmpeg
* GStreamer
* Motion
* MJPEG Streamer
* custom implementation

Audit:

* initialization
* frame acquisition
* buffering
* latency
* dropped frames
* reconnect logic
* error handling
* memory usage
* CPU utilization

## Backend integration

* camera service startup
* stream availability
* API endpoints
* authentication
* MJPEG/WebRTC/WebSocket/RTSP implementation
* timeout handling
* graceful recovery

## Frontend integration

* live video rendering
* refresh latency
* browser compatibility
* reconnect behavior
* loading states
* stream interruption handling
* synchronization with sensor telemetry

## End-to-end camera validation

```text
Camera
      ↓
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

* expected input
* actual input
* expected output
* actual output
* validation method
* identified issues
* recommended minimal fix

---

# Phase 5 — Frontend Dashboard

Locate the frontend.

Verify:

* successful build
* page loads
* live updates
* charts
* widgets
* timestamps
* reconnect logic
* responsiveness
* browser console
* network requests

Trace live data flow from backend to UI.

---

# Phase 6 — End-to-End Validation

Verify the entire data pipeline:

```text
Pulse Sensor
      ↓
ADC
      ↓
ESP32
      ↓
Wireless
      ↓
Backend
      ↓
API / MQTT / WebSocket
      ↓
Frontend
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

For each stage:

* expected input
* actual input
* expected output
* actual output
* validation method
* identified issues

Verify that:

* sensor updates continue while video is streaming
* camera streaming does not block telemetry
* dashboard displays synchronized sensor and camera data
* CPU, RAM, and network utilization remain within acceptable limits
* latency stays acceptable under simultaneous telemetry and video streaming

---

# Phase 7 — Fault Tolerance

Test recovery from:

## ESP32

* Wi-Fi loss
* sensor failure
* LCD failure
* invalid ADC values
* reboot

## Backend

* malformed packets
* server restart
* network interruption
* database failure

## Dashboard

* backend unavailable
* reconnect
* invalid payload
* stale data

## Camera

* camera disconnected
* driver failure
* stream interruption
* backend restart during streaming

Verify automatic recovery where intended.

---

# Phase 8 — Performance Audit

Inspect for:

* blocking operations
* unnecessary polling
* inefficient loops
* high CPU usage
* excessive RAM usage
* heap fragmentation
* unnecessary copies
* redundant processing
* camera frame rate consistency
* frame drops
* video latency
* encoder efficiency
* bandwidth usage
* CPU usage during streaming
* GPU usage (if applicable)
* synchronization between video and telemetry
* thermal throttling during prolonged operation

Only optimize where measurable benefits outweigh risk.

---

# Phase 9 — Security Review

Verify:

* secrets not hard-coded
* configurable Wi-Fi credentials
* environment variables
* API key protection
* authentication (if present)
* input validation
* injection risks
* exposed endpoints
* dependency vulnerabilities (where practical)
* unauthorized camera access
* exposed video endpoints
* stream authentication
* HTTPS/TLS support (where applicable)
* RTSP/WebSocket security
* camera permission configuration

---

# Phase 10 — Code Quality

Identify:

* duplicate logic
* dead code
* unused files
* unused libraries
* inconsistent naming
* magic numbers
* missing comments
* weak error handling

Recommend improvements without changing behavior.

---

# Phase 11 — Testing

Create or improve tests where practical.

Include:

### Firmware

* sensor logic
* packet generation
* reconnect behavior

### Backend

* API tests
* communication tests
* malformed payload tests

### Frontend

* live update tests
* rendering
* reconnect behavior

### Camera

* frame acquisition
* stream availability
* reconnect behavior
* latency bounds

Document any areas that cannot be tested automatically.

---

# Phase 12 — Final System Validation

Verify the complete workflow:

```text
ESP32 boots
      ↓
Hardware initializes
      ↓
Wi-Fi connects
      ↓
Backend connection established
      ↓
Pulse sensor sampled
      ↓
LCD updated
      
Alarm logic evaluated
      ↓
Buzzer activated when required
      ↓
Camera initialized
      ↓
Frame stream started
      ↓
Live data transmitted
      ↓
Backend receives data
      ↓
Dashboard updates
      ↓
System remains stable
      ↓
Automatic recovery after failures
```

---

# Deliverables

Produce a final report containing:

## 1. Architecture Overview

* Hardware topology
* Software architecture
* Communication flow

## 2. Detected Components

* Hardware
* Firmware
* Services
* Libraries
* Frameworks
* Databases

## 3. Issues Found

For each issue include:

* Severity (Critical, High, Medium, Low)
* Description
* Evidence
* Root cause
* Impact

## 4. Fixes Applied

For every modification include:

* File(s) changed
* Minimal diff summary
* Reason for change
* Compatibility considerations

## 5. Verification

Show how each fix was validated.

If a fix cannot be fully verified due to missing hardware, logs, or environment access, clearly state what evidence is missing.

## 6. Camera System Assessment

* detected camera hardware
* interface (CSI/USB)
* driver
* streaming framework
* supported resolutions
* supported frame rates
* measured latency
* CPU usage
* memory usage
* frame loss
* detected issues
* fixes applied
* remaining risks

## 7. Remaining Risks

List unresolved issues and their impact.

## 8. Future Improvements

Recommend enhancements prioritized by:

* Reliability
* Performance
* Security
* Maintainability
* Scalability

---

# Operating Rules

* Never assume missing information.
* Prefer evidence over inference.
* Keep architecture intact unless a redesign is justified.
* Minimize code changes.
* Preserve backward compatibility.
* Validate every modification before moving on.
* Clearly distinguish **verified findings**, **reasonable inferences**, and **unknowns requiring user input**.
* If execution, hardware access, or runtime verification is not possible in the current environment, explicitly state that limitation and specify exactly what commands, logs, or hardware observations are needed to complete verification.
