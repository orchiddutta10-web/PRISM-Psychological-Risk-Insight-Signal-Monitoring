"""
phone.py — Ingestion endpoint for privacy-preserving phone behavioral logs.

Accepts aggregated feature vectors from the smartphone client, buffers
them per-device, and serves them to the fusion ML pipeline.

Privacy guarantees (enforced on-device, verified server-side):
  - No raw keystroke sequences or typed content ever transmitted.
  - No raw GPS coordinate pairs ever transmitted.
  - No installed-app package names ever transmitted.
  - All features are window-aggregated (default 5 min resolution).
"""

from __future__ import annotations

import time
import numpy as np
from collections import defaultdict, deque
from flask import Blueprint, jsonify, request, current_app

from app.core.exceptions import InvalidPayloadException
from app.ml.behavioral_schema import (
    KeystrokeWindow, AppActivityWindow, GPSTelemetryWindow,
    PhoneLogPayload, FusedDailyTensor,
    N_KEYSTROKE, N_APP, N_GPS, N_BIOMETRIC,
    CLASSES, CLASS_TO_IDX,
)

phone_bp = Blueprint("phone", __name__)

# ═══════════════════════════════════════════════════════════════════
# In-memory ring buffers per device
# ═══════════════════════════════════════════════════════════════════

MAX_WINDOWS_PER_DEVICE = 288 * 7  # 7 days at 5-min resolution
device_buffers: dict[str, deque[PhoneLogPayload]] = defaultdict(
    lambda: deque(maxlen=MAX_WINDOWS_PER_DEVICE)
)

WINDOW_DURATION_S = 300  # 5 minutes


# ═══════════════════════════════════════════════════════════════════
# Field validators
# ═══════════════════════════════════════════════════════════════════

_REQUIRED_FIELDS = {"device_id", "window_start_unix", "window_end_unix"}
_OPTIONAL_FIELDS = {"timezone_offset_hours", "keystroke", "app", "gps"}

_KEYSTROKE_FIELDS = {
    "flight_time_mean_ms", "flight_time_std_ms",
    "dwell_time_mean_ms",  "dwell_time_std_ms",
    "backspace_rate", "typing_speed_cps",
    "pause_frequency", "total_keystrokes",
}
_APP_FIELDS = {
    "usage_social_min", "usage_productivity_min",
    "usage_game_min", "usage_health_min",
    "usage_communication_min", "usage_entertainment_min",
    "screen_on_min", "late_night_min",
    "app_switch_count", "longest_session_min",
}
_GPS_FIELDS = {
    "total_distance_km", "location_variance",
    "mobility_radius_km", "n_unique_places",
    "home_time_ratio", "entropy_transitions",
    "avg_flight_length_m",
}


def _parse_keystroke(body: dict) -> KeystrokeWindow:
    ks = body.get("keystroke") or {}
    return KeystrokeWindow(
        flight_time_mean_ms =float(ks.get("flight_time_mean_ms", 0)),
        flight_time_std_ms  =float(ks.get("flight_time_std_ms", 0)),
        dwell_time_mean_ms  =float(ks.get("dwell_time_mean_ms", 0)),
        dwell_time_std_ms   =float(ks.get("dwell_time_std_ms", 0)),
        backspace_rate      =float(ks.get("backspace_rate", 0)),
        typing_speed_cps    =float(ks.get("typing_speed_cps", 0)),
        pause_frequency     =float(ks.get("pause_frequency", 0)),
        total_keystrokes     =int(ks.get("total_keystrokes", 0)),
    )


def _parse_app(body: dict) -> AppActivityWindow:
    ap = body.get("app") or {}
    return AppActivityWindow(
        usage_social_min        =float(ap.get("usage_social_min", 0)),
        usage_productivity_min  =float(ap.get("usage_productivity_min", 0)),
        usage_game_min          =float(ap.get("usage_game_min", 0)),
        usage_health_min        =float(ap.get("usage_health_min", 0)),
        usage_communication_min =float(ap.get("usage_communication_min", 0)),
        usage_entertainment_min =float(ap.get("usage_entertainment_min", 0)),
        screen_on_min           =float(ap.get("screen_on_min", 0)),
        late_night_min          =float(ap.get("late_night_min", 0)),
        app_switch_count        =int(ap.get("app_switch_count", 0)),
        longest_session_min     =float(ap.get("longest_session_min", 0)),
    )


def _parse_gps(body: dict) -> GPSTelemetryWindow:
    gs = body.get("gps") or {}
    return GPSTelemetryWindow(
        total_distance_km  =float(gs.get("total_distance_km", 0)),
        location_variance  =float(gs.get("location_variance", 0)),
        mobility_radius_km =float(gs.get("mobility_radius_km", 0)),
        n_unique_places    =int(gs.get("n_unique_places", 1)),
        home_time_ratio    =float(gs.get("home_time_ratio", 1)),
        entropy_transitions=float(gs.get("entropy_transitions", 0)),
        avg_flight_length_m=float(gs.get("avg_flight_length_m", 0)),
    )


# ═══════════════════════════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════════════════════════

@phone_bp.route("/log", methods=["POST"])
def ingest_phone_log():
    """
    Accept a single 5-minute aggregated window from a phone.

    Payload structure (example):
    ```json
    {
      "device_id": "phone-abc123",
      "window_start_unix": 1710700000,
      "window_end_unix":   1710700300,
      "timezone_offset_hours": -4,
      "keystroke": {
        "flight_time_mean_ms": 185.2,
        "flight_time_std_ms": 92.1,
        "dwell_time_mean_ms": 78.4,
        "dwell_time_std_ms": 35.0,
        "backspace_rate": 0.07,
        "typing_speed_cps": 4.8,
        "pause_frequency": 0.3,
        "total_keystrokes": 142
      },
      "app": {
        "usage_social_min": 2.5,
        "usage_productivity_min": 8.0,
        "usage_game_min": 0,
        "usage_health_min": 0.5,
        "usage_communication_min": 3.0,
        "usage_entertainment_min": 1.0,
        "screen_on_min": 12.0,
        "late_night_min": 0,
        "app_switch_count": 18,
        "longest_session_min": 6.2
      },
      "gps": {
        "total_distance_km": 0.8,
        "location_variance": 0.12,
        "mobility_radius_km": 0.4,
        "n_unique_places": 2,
        "home_time_ratio": 0.85,
        "entropy_transitions": 0.45,
        "avg_flight_length_m": 150.0
      }
    }
    ```
    """
    body = request.get_json(silent=True)
    if not body:
        raise InvalidPayloadException("Request body must be valid JSON.")

    # ── Validate required fields ──────────────────────────────
    missing = _REQUIRED_FIELDS - body.keys()
    if missing:
        raise InvalidPayloadException(f"Missing required fields: {missing}")

    device_id = str(body["device_id"])

    # ── Parse sub-structs ─────────────────────────────────────
    try:
        payload = PhoneLogPayload(
            device_id           = device_id,
            window_start_unix   = float(body["window_start_unix"]),
            window_end_unix     = float(body["window_end_unix"]),
            timezone_offset_hours = int(body.get("timezone_offset_hours", 0)),
            keystroke           = _parse_keystroke(body),
            app                 = _parse_app(body),
            gps                 = _parse_gps(body),
        )
    except (ValueError, TypeError) as e:
        raise InvalidPayloadException(f"Field parse error: {e}")

    # ── Sanity-check window duration ──────────────────────────
    actual_duration = payload.window_end_unix - payload.window_start_unix
    if not (60 <= actual_duration <= 3600):
        current_app.logger.warning(
            f"[Phone] {device_id}: window duration {actual_duration:.0f}s "
            f"outside expected 60–3600s range."
        )

    # ── Store ─────────────────────────────────────────────────
    buf = device_buffers[device_id]
    buf.append(payload)

    current_app.logger.info(
        f"[Phone] {device_id}: ingested window "
        f"{payload.window_start_unix:.0f}–{payload.window_end_unix:.0f}  "
        f"(buffer: {len(buf)} windows)"
    )

    # ── Anomaly hints from phone data ─────────────────────────
    _log_anomaly_hints(payload, device_id)

    return jsonify({
        "status":   "success",
        "device":   device_id,
        "buffered": len(buf),
    }), 200


@phone_bp.route("/daily-tensor", methods=["GET"])
def get_daily_tensor():
    """
    Retrieve the latest assembled 24 h fusion tensor for a device.
    Query param:  ?device_id=<id>

    This is used by the ML prediction pipeline to fetch input for
    the multi-modal fusion model.
    """
    device_id = request.args.get("device_id")
    if not device_id:
        raise InvalidPayloadException("Query parameter 'device_id' is required.")

    buf = device_buffers.get(device_id)
    if not buf or len(buf) < 12:   # need at least 1 hour
        return jsonify({
            "status": "error",
            "message": f"Insufficient data for {device_id} ({len(buf or [])} windows).",
        }), 422

    tensor = assemble_daily_tensor(device_id)
    if tensor is None:
        return jsonify({
            "status": "error",
            "message": f"No recent 24 h block available for {device_id}.",
        }), 422

    return jsonify({
        "status":     "success",
        "device":     device_id,
        "shape":      list(tensor.stacked.shape),
        "keystroke":  tensor.keystroke.shape,
        "app":        tensor.app.shape,
        "gps":        tensor.gps.shape,
        "biometric":  tensor.biometric.shape,
    }), 200


@phone_bp.route("/device-count", methods=["GET"])
def device_count():
    """Return number of active devices and their window counts (for monitoring)."""
    return jsonify({
        "status": "success",
        "devices": {
            dev: len(buf)
            for dev, buf in sorted(device_buffers.items())
        }
    }), 200


# ═══════════════════════════════════════════════════════════════════
# Tensor assembly
# ═══════════════════════════════════════════════════════════════════

def assemble_daily_tensor(device_id: str,
                          window_s: int = WINDOW_DURATION_S
                          ) -> FusedDailyTensor | None:
    """
    Build a (288 × 32) fusion tensor from the most recent 24 h of
    phone windows + the latest biometric data from SensorService.

    Returns ``None`` if insufficient data exists.
    """
    buf = device_buffers.get(device_id)
    if not buf:
        return None

    now = time.time()
    cutoff = now - 86400  # 24 h ago

    # Filter windows from the last 24 h
    recent = [p for p in buf if p.window_start_unix >= cutoff]
    if len(recent) < 12:
        return None

    # Sort chronologically
    recent.sort(key=lambda p: p.window_start_unix)

    n_steps = 288
    ks_tensor = np.zeros((n_steps, N_KEYSTROKE), dtype=np.float32)
    ap_tensor = np.zeros((n_steps, N_APP), dtype=np.float32)
    gs_tensor = np.zeros((n_steps, N_GPS), dtype=np.float32)

    for p in recent:
        idx = int((p.window_start_unix - cutoff) // window_s)
        if 0 <= idx < n_steps:
            ks_tensor[idx] = p.keystroke.to_array()
            ap_tensor[idx] = p.app.to_array()
            gs_tensor[idx] = p.gps.to_array()

    # ── Biometric tensor from SensorService ───────────────────
    bio_tensor = _build_biometric_tensor(n_steps)

    return FusedDailyTensor(
        keystroke=ks_tensor,
        app=ap_tensor,
        gps=gs_tensor,
        biometric=bio_tensor,
        device_id=device_id,
    )


def _build_biometric_tensor(n_steps: int) -> np.ndarray:
    """Build a (n_steps, N_BIOMETRIC) tensor from the sensor buffer."""
    from app.ml.feature_extractor import extract_gsr_features, extract_hrv_features, compile_model_features
    from app.services.sensor_service import SensorService

    sensor_svc = SensorService()
    history = sensor_svc.get_buffered_readings(count=n_steps)

    if len(history) == 0:
        return np.zeros((n_steps, N_BIOMETRIC), dtype=np.float32)

    # Subsample or pad to n_steps
    bio = np.zeros((n_steps, N_BIOMETRIC), dtype=np.float32)
    for i, r in enumerate(history[:n_steps]):
        gsr_feat = extract_gsr_features(
            np.array([r.get("gsr_microsiemens", 0)])
        )
        hrv_feat = extract_hrv_features(
            np.array([r.get("inter_beat_interval_ms", 600)])
        )
        feats = compile_model_features(gsr_feat, hrv_feat)
        bio[i] = np.array([
            feats.get("mean_hr", 70.0),
            feats.get("mean_gsr", 3.0),
            feats.get("mean_scl", 3.0),
            feats.get("max_scr", 0.0),
            feats.get("sdnn", 45.0),
            feats.get("rmssd", 35.0),
            0.0,  # placeholder for future bio feature
        ])

    return bio


# ═══════════════════════════════════════════════════════════════════
# Anomaly detection (phone-derived)
# ═══════════════════════════════════════════════════════════════════

def _log_anomaly_hints(payload: PhoneLogPayload, device_id: str) -> None:
    try:
        from app.services.log_service import LogService
        logs = LogService()

        k = payload.keystroke
        if k.total_keystrokes > 0 and k.backspace_rate > 0.25:
            logs.add_anomaly("HIGH_BACKSPACE_RATE",
                             f"[{device_id}] Backspace rate "
                             f"{k.backspace_rate:.0%} — possible cognitive "
                             f"fatigue or anxiety.",
                             severity="warning")

        g = payload.gps
        if g.home_time_ratio > 0.95 and g.mobility_radius_km < 0.1:
            logs.add_anomaly("ISOLATION_PATTERN",
                             f"[{device_id}] Minimal mobility "
                             f"(radius: {g.mobility_radius_km:.2f} km, "
                             f"home: {g.home_time_ratio:.0%}) — depressive "
                             f"isolation marker.",
                             severity="critical")

        a = payload.app
        if a.late_night_min > 30:
            logs.add_anomaly("LATE_NIGHT_USAGE",
                             f"[{device_id}] {a.late_night_min:.0f} min "
                             f"after 23:00 — possible sleep disruption.",
                             severity="warning")
    except Exception:
        pass
