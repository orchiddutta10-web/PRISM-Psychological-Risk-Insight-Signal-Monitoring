"""
API Client — transmits feature payloads to the PRISM AI Server.

Supports: REST (HTTP POST with JWT auth), automatic retry with exponential
backoff, offline disk queuing, and configurable endpoint routing.
"""

import json
import logging
import os
import queue
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests

from prism_edge import config

logger = logging.getLogger(__name__)


class ApiClient:
    """
    Drains the transmission queue and POSTs payloads to the PRISM API.

    Handles:
        - JWT Bearer auth
        - Exponential backoff (2s → 4s → 8s → 16s → 32s max)
        - Offline disk queue spillover
        - Duplicate detection (by sequence number)

    Usage:
        client = ApiClient(tx_queue)
        client.start()
        client.stop()
    """

    def __init__(self, tx_queue):
        self._queue = tx_queue
        self._base_url: str = config.API_BASE_URL
        self._jwt: str = config.API_DEVICE_JWT
        self._device_id: str = config.API_DEVICE_ID
        self._ingest_endpoint: str = config.API_INGEST_ENDPOINT
        self._pulse_endpoint: str = config.API_PULSE_ENDPOINT
        self._timeout: float = config.RECONNECT_TIMEOUT_SEC
        self._max_retries: int = config.MAX_RETRIES
        self._backoff_base: float = config.RETRY_BACKOFF_BASE
        self._max_queue: int = config.MAX_QUEUE_SIZE

        self._running: bool = False
        self._thread: Optional[threading.Thread] = None
        self._session: Optional[requests.Session] = None
        self._consecutive_failures: int = 0
        self._last_success: float = 0.0
        self._offline_dir: Path = config.OFFLINE_QUEUE_DIR
        self._last_seq: int = 0
        self._lock: threading.Lock = threading.Lock()

    def start(self) -> None:
        self._running = True
        self._session = requests.Session()
        if not self._jwt:
            logger.warning("API_DEVICE_JWT is empty — API requests will be unauthenticated and likely rejected")
        self._session.headers.update(
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._jwt}",
            }
        )
        self._thread = threading.Thread(
            target=self._loop, name="api-writer", daemon=True
        )
        self._thread.start()
        logger.info("API client started → %s%s", self._base_url, self._ingest_endpoint)

    def stop(self) -> None:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5.0)
        if self._session:
            self._session.close()
            self._session = None
        logger.info("API client stopped (failures=%d)", self._consecutive_failures)

    @property
    def connected(self) -> bool:
        return self._consecutive_failures == 0

    @property
    def consecutive_failures(self) -> int:
        return self._consecutive_failures

    # ── Internal ────────────────────────────────────────────────────

    def _loop(self) -> None:
        # Replay any offline-queued payloads in the background thread
        # (not in start() — to avoid blocking the main thread on network retries)
        self._drain_offline_queue()

        while self._running:
            try:
                payload = self._queue.get(timeout=1.0)
                self._send(payload)
            except queue.Empty:
                continue
            except Exception as e:
                logger.error("API writer loop error: %s", e)

    def _send(self, payload: dict) -> None:
        """Send one payload with retry and backoff."""
        seq = payload.get("sequence", 0)

        # Skip duplicates (may happen after offline queue replay)
        if seq > 0 and seq <= self._last_seq:
            logger.debug("Skipping duplicate sequence %d", seq)
            return

        data = json.dumps(payload)
        backoff = self._backoff_base

        # Relay ESP32 PRISM PULSE telemetry to the dedicated physio endpoint
        # (architecture doc §2: ESP32 bridge → ApiClient → /physio/pulse/ingest).
        pulse = payload.get("value", {}).get("esp32_pulse")
        if pulse:
            self._send_pulse(pulse)

        for attempt in range(1, self._max_retries + 1):
            try:
                resp = self._session.post(
                    f"{self._base_url}{self._ingest_endpoint}",
                    data=data,
                    timeout=self._timeout,
                )
                if resp.status_code in (200, 201):
                    self._consecutive_failures = 0
                    self._last_seq = max(self._last_seq, seq)
                    self._last_success = time.time()
                    return
                elif resp.status_code == 401:
                    logger.error("API auth rejected (401) — check DEVICE_JWT")
                    self._on_failure(payload, permanent=True)
                    return
                elif resp.status_code == 403:
                    logger.error("API permission denied (403) — check consent grants")
                    self._on_failure(payload, permanent=True)
                    return
                else:
                    logger.warning(
                        "API returned %d (attempt %d/%d)",
                        resp.status_code,
                        attempt,
                        self._max_retries,
                    )
            except requests.exceptions.Timeout:
                logger.warning(
                    "API timeout (attempt %d/%d)", attempt, self._max_retries
                )
            except requests.exceptions.ConnectionError:
                logger.warning(
                    "API unreachable (attempt %d/%d)", attempt, self._max_retries
                )
            except Exception as e:
                logger.warning(
                    "API send error: %s (attempt %d/%d)", e, attempt, self._max_retries
                )

            if attempt < self._max_retries:
                time.sleep(backoff)
                backoff = min(backoff * 2.0, 32.0)  # exponential backoff, capped at 32s

        # All retries exhausted
        self._on_failure(payload, permanent=False)

    def _send_pulse(self, pulse: dict) -> None:
        """Relay one ESP32 PRISM PULSE reading to the physio endpoint with retry."""
        data = json.dumps(pulse)
        backoff = self._backoff_base
        for attempt in range(1, self._max_retries + 1):
            try:
                resp = self._session.post(
                    f"{self._base_url}{self._pulse_endpoint}",
                    data=data,
                    headers={"Content-Type": "application/json"},
                    timeout=self._timeout,
                )
                if resp.status_code in (200, 201):
                    logger.info(
                        "ESP32 pulse relayed: bpm=%s status=%s",
                        pulse.get("bpm"),
                        pulse.get("alert_status"),
                    )
                    return
                elif resp.status_code in (401, 403):
                    logger.error(
                        "ESP32 pulse relay authz rejected (%d) — check DEVICE_JWT/consent",
                        resp.status_code,
                    )
                    return
                else:
                    logger.warning(
                        "ESP32 pulse relay returned %d (attempt %d/%d)",
                        resp.status_code,
                        attempt,
                        self._max_retries,
                    )
            except requests.exceptions.Timeout:
                logger.warning(
                    "ESP32 pulse relay timeout (attempt %d/%d)", attempt, self._max_retries
                )
            except requests.exceptions.ConnectionError:
                logger.warning(
                    "ESP32 pulse relay unreachable (attempt %d/%d)", attempt, self._max_retries
                )
            except Exception as e:
                logger.warning(
                    "ESP32 pulse relay error: %s (attempt %d/%d)", e, attempt, self._max_retries
                )

            if attempt < self._max_retries:
                time.sleep(backoff)
                backoff = min(backoff * 2.0, 32.0)

        logger.warning("ESP32 pulse relay exhausted retries")

    def _on_failure(self, payload: dict, permanent: bool) -> None:
        self._consecutive_failures += 1
        if permanent:
            logger.warning(
                "Permanent failure — payload discarded (seq=%d)",
                payload.get("sequence"),
            )
        else:
            self._save_offline(payload)

    def _save_offline(self, payload: dict) -> None:
        """Write failed payload to disk for later replay."""
        try:
            self._offline_dir.mkdir(parents=True, exist_ok=True)
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
            fname = (
                self._offline_dir / f"offline_{ts}_{payload.get('sequence', 0)}.json"
            )
            with open(fname, "w") as f:
                json.dump(payload, f)
            logger.debug("Offline queue: saved %s", fname)
        except Exception as e:
            logger.error("Failed to write offline payload: %s", e)

    def _drain_offline_queue(self) -> None:
        """Replay any saved offline payloads."""
        if not self._offline_dir.exists():
            return

        files = sorted(self._offline_dir.glob("offline_*.json"))
        if not files:
            return

        logger.info("Replaying %d offline payloads...", len(files))
        for fpath in files:
            try:
                with open(fpath, "r") as f:
                    payload = json.load(f)
                self._send(payload)
                fpath.unlink()  # remove on success
            except Exception as e:
                logger.warning("Failed to replay %s: %s", fpath.name, e)
                break  # stop if we hit a problem — retry next start
