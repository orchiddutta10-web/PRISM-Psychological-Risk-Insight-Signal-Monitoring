"""
Feature Packer — collects latest features from all pipelines and builds
the unified JSON payload for transmission to the PRISM AI Server.
"""

import json
import logging
import queue
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Any

from prism_edge import config
from prism_edge.utils.health_monitor import get_health_snapshot

logger = logging.getLogger(__name__)


class FeaturePacker:
    """
    Periodically collects features from shared state and pushes JSON payloads
    into a thread-safe transmission queue.

    Usage:
        packer = FeaturePacker(shared_state, state_lock, tx_queue)
        packer.start()
        packer.stop()
    """

    def __init__(
        self,
        shared_state: Dict[str, Any],
        state_lock: threading.Lock,
        tx_queue,
        subject_id: str = "",
    ):
        self._shared = shared_state
        self._lock = state_lock
        self._tx_queue = tx_queue
        self._interval: float = config.FEATURE_INTERVAL_SEC
        self._subject_id: str = subject_id or config.API_DEVICE_ID
        self._version: str = config.EDGE_VERSION
        self._device_type: str = config.DEVICE_TYPE
        self._running: bool = False
        self._thread: threading.Thread | None = None
        self._seq: int = 0

    def start(self) -> None:
        self._running = True
        self._thread = threading.Thread(target=self._loop, name="feature-packer", daemon=True)
        self._thread.start()
        logger.info("Feature packer started (interval=%.1fs)", self._interval)

    def stop(self) -> None:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
        logger.info("Feature packer stopped")

    def _loop(self) -> None:
        while self._running:
            cycle_start = time.time()

            payload = self._build_payload()
            try:
                self._tx_queue.put_nowait(payload)
            except queue.Full:
                logger.warning("TX queue full — dropping oldest payload")
                try:
                    while not self._tx_queue.empty():
                        self._tx_queue.get_nowait()
                except queue.Empty:
                    pass
                try:
                    self._tx_queue.put_nowait(payload)
                except queue.Full:
                    logger.error("TX queue still full after clearing — payload lost")

            elapsed = time.time() - cycle_start
            sleep_time = max(0.0, self._interval - elapsed)
            time.sleep(sleep_time)

    def _build_payload(self) -> Dict[str, Any]:
        self._seq += 1
        now = datetime.now(timezone.utc)

        # Snapshot latest features from all pipelines
        with self._lock:
            face = self._shared.get("face", {})
            pose = self._shared.get("pose", {})
            motion = self._shared.get("motion", {})
            voice = self._shared.get("voice", {})
            esp32_pulse = self._shared.get("esp32_pulse", {})

        # Compute aggregate confidence (mean of present pipelines)
        confs = []
        if face.get("present"):
            confs.append(face.get("confidence", 0))
        if pose.get("present"):
            confs.append(pose.get("confidence", 0))
        if voice.get("voice_active"):
            confs.append(0.8)

        confidence = round(sum(confs) / max(len(confs), 1), 3)

        health = get_health_snapshot()

        raw_features = {
            "face": face,
            "pose": pose,
            "motion": motion,
            "voice": voice,
            "esp32_pulse": esp32_pulse,
            "system_health": health,
        }
        
        # Phase 11: Local AI Integration - Clean, normalize, engineer, sessionize
        from prism_edge.packer.preprocessor import FeaturePreprocessor
        if not hasattr(self, "_preprocessor"):
            self._preprocessor = FeaturePreprocessor()
            
        processed_features = self._preprocessor.process(raw_features)

        return {
            "subject_id": self._subject_id,
            "timestamp": now.isoformat(),
            "modality": "edge_behaviour",
            "confidence": confidence,
            "sequence": self._seq,
            "value": processed_features,
            "edge_version": self._version,
            "device_type": self._device_type,
        }
