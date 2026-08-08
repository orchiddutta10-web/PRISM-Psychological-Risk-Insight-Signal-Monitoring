"""
State Tracker for PRISM Edge Behaviour Node.

Maintains rolling windows of instantaneous features to compute time-series
behavioral metadata (e.g., blink frequency, presence duration, restlessness).
No diagnosis or prediction — strictly measurable frequencies and durations.
"""

import time
from collections import deque
from typing import Dict, Any


class StateTracker:
    def __init__(self):
        # Time windows (e.g., 60 seconds)
        self.history_window_sec = 60.0

        # Blink tracking
        self.blink_timestamps = deque()
        self.is_blinking_currently = False
        self.blink_threshold_ratio = 0.7  # When blink_ratio > 0.7, eye is mostly closed

        # Presence tracking
        self.first_seen_time = 0.0
        self.last_seen_time = 0.0

        # Slouching tracking
        self.slouching_start_time = 0.0

        # Restlessness (motion spikes)
        self.motion_spikes = deque()

    def update(
        self,
        face_feats: Dict[str, Any],
        pose_feats: Dict[str, Any],
        motion_feats: Dict[str, Any],
        voice_feats: Dict[str, Any],
        timestamp: float,
    ) -> Dict[str, Any]:
        """Process current frame features and return time-series aggregated state."""
        state = {
            "blink_detected": False,
            "blink_frequency_bpm": 0.0,
            "presence_duration": 0.0,
            "body_posture": "unknown",
            "restlessness": False,
            "silence_ratio": 1.0,
            "speech_segments": 0,
        }

        # ── 1. Presence Duration ────────────────────────────
        face_present = face_feats.get("present", False)
        if face_present:
            if self.first_seen_time == 0.0:
                self.first_seen_time = timestamp
            self.last_seen_time = timestamp
            state["presence_duration"] = round(timestamp - self.first_seen_time, 2)
        else:
            if timestamp - self.last_seen_time > 10.0:  # Reset if absent for 10s
                self.first_seen_time = 0.0

        # ── 2. Blink Detection & Frequency ──────────────────
        blink_ratio = face_feats.get("blink_ratio", 0.0)
        if blink_ratio > self.blink_threshold_ratio:
            if not self.is_blinking_currently:
                self.is_blinking_currently = True
                state["blink_detected"] = True
                self.blink_timestamps.append(timestamp)
        else:
            self.is_blinking_currently = False

        # Prune old blinks
        while self.blink_timestamps and (
            timestamp - self.blink_timestamps[0] > self.history_window_sec
        ):
            self.blink_timestamps.popleft()

        # Blinks per minute (normalized if window < 60s)
        time_observed = min(
            timestamp - self.first_seen_time if self.first_seen_time > 0 else 0,
            self.history_window_sec,
        )
        if time_observed > 5.0:  # Need at least 5s to estimate BPM
            state["blink_frequency_bpm"] = round(
                (len(self.blink_timestamps) / time_observed) * 60.0, 1
            )

        # ── 3. Advanced Posture (Slouching) ─────────────────
        raw_posture = pose_feats.get("posture", "unknown")
        torso_angle = pose_feats.get("torso_angle_deg", 0.0)
        spine_angle = pose_feats.get("spine_angle_deg", 0.0)

        state["body_posture"] = raw_posture
        if raw_posture == "seated":
            # If leaning forward/curved spine significantly
            if torso_angle > 20.0 or spine_angle > 20.0:
                if self.slouching_start_time == 0.0:
                    self.slouching_start_time = timestamp
                elif timestamp - self.slouching_start_time > 5.0:
                    state["body_posture"] = "slouching"
            else:
                self.slouching_start_time = 0.0
        else:
            self.slouching_start_time = 0.0

        # ── 4. Restlessness ─────────────────────────────────
        motion_mag = motion_feats.get("motion_magnitude", 0.0)
        if motion_mag > 0.15:  # Arbitrary threshold for significant movement
            self.motion_spikes.append(timestamp)

        while self.motion_spikes and (
            timestamp - self.motion_spikes[0] > self.history_window_sec
        ):
            self.motion_spikes.popleft()

        # If more than 10 significant movements in 60s, flag as restless
        if len(self.motion_spikes) > 10:
            state["restlessness"] = True

        # ── 5. Audio Tracking (Silence Ratio & Segments) ────
        if not hasattr(self, "audio_speech_windows"):
            self.audio_speech_windows = deque()
            self.was_speaking = False
            self.speech_segments_count = 0

        is_speaking = voice_feats.get("voice_active", False)

        # Track total active vs inactive in 60s window (each call is roughly a frame interval)
        self.audio_speech_windows.append((timestamp, is_speaking))
        while self.audio_speech_windows and (
            timestamp - self.audio_speech_windows[0][0] > self.history_window_sec
        ):
            popped_ts, popped_speaking = self.audio_speech_windows.popleft()

        # Compute silence ratio based on the window
        if self.audio_speech_windows:
            speaking_frames = sum(
                1 for _, active in self.audio_speech_windows if active
            )
            silence_ratio = 1.0 - (speaking_frames / len(self.audio_speech_windows))
            state["silence_ratio"] = round(silence_ratio, 2)

        # Count distinct speech segments
        if is_speaking and not self.was_speaking:
            self.speech_segments_count += 1

        state["speech_segments"] = self.speech_segments_count
        self.was_speaking = is_speaking

        return state
