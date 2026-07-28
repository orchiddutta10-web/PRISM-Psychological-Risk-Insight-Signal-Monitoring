"""
API Client — transmits feature payloads to the PRISM AI Server.

Supports: REST (HTTP POST with JWT auth), automatic retry with exponential
backoff, SQLite offline queuing, and configurable endpoint routing.
"""

import json
import logging
import queue
import threading
import time
from datetime import datetime, timezone
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
        - SQLite offline queue spillover (replaced JSON file queue)
        - Duplicate detection (by sequence number)
        - Connectivity-aware sending

    Usage:
        client = ApiClient(tx_queue)
        client.start()
        client.stop()
    """

    def __init__(self, tx_queue, offline_queue=None, connectivity_monitor=None):
        self._queue = tx_queue
        self._base_url: str = config.API_BASE_URL
        self._jwt: str = config.API_DEVICE_JWT
        self._device_id: str = config.API_DEVICE_ID
        self._ingest_endpoint: str = config.API_INGEST_ENDPOINT
        self._timeout: float = config.RECONNECT_TIMEOUT_SEC
        self._max_retries: int = config.MAX_RETRIES
        self._backoff_base: float = config.RETRY_BACKOFF_BASE
        self._max_queue: int = config.MAX_QUEUE_SIZE

        self._offline_queue = offline_queue
        self._connectivity = connectivity_monitor

        self._running: bool = False
        self._thread: Optional[threading.Thread] = None
        self._session: Optional[requests.Session] = None
        self._consecutive_failures: int = 0
        self._last_success: float = 0.0
        self._last_seq: int = 0
        self._lock: threading.Lock = threading.Lock()

    def start(self) -> None:
        self._running = True
        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._jwt}",
        })

        self._thread = threading.Thread(target=self._loop, name="api-writer", daemon=True)
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
        while self._running:
            try:
                payload = self._queue.get(timeout=1.0)
                self._send(payload)
            except queue.Empty:
                continue
            except Exception as e:
                logger.error("API writer loop error: %s", e)

    def _send(self, payload: dict) -> None:
        """Send one payload with retry and backoff. Queues to SQLite offline on failure."""
        seq = payload.get("sequence", 0)

        if seq > 0 and seq <= self._last_seq:
            logger.debug("Skipping duplicate sequence %d", seq)
            return

        timestamp = payload.get("timestamp", datetime.now(timezone.utc).isoformat())
        source = payload.get("modality", payload.get("source", "edge_behaviour"))

        if self._connectivity is not None and not self._connectivity.is_online():
            self._queue_to_sqlite(payload, timestamp, source)
            return

        import numpy as np
        class NumpyEncoder(json.JSONEncoder):
            def default(self, obj):
                if isinstance(obj, np.integer): return int(obj)
                if isinstance(obj, np.floating): return float(obj)
                if isinstance(obj, np.bool_): return bool(obj)
                if isinstance(obj, np.ndarray): return obj.tolist()
                return super(NumpyEncoder, self).default(obj)

        data = json.dumps(payload, cls=NumpyEncoder)
        backoff = self._backoff_base

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
                    self._on_failure(payload, timestamp, source, permanent=True)
                    return
                elif resp.status_code == 403:
                    logger.error("API permission denied (403) — check consent grants")
                    self._on_failure(payload, timestamp, source, permanent=True)
                    return
                else:
                    logger.warning("API returned %d (attempt %d/%d)", resp.status_code, attempt, self._max_retries)
            except requests.exceptions.Timeout:
                logger.warning("API timeout (attempt %d/%d)", attempt, self._max_retries)
            except requests.exceptions.ConnectionError:
                logger.warning("API unreachable (attempt %d/%d)", attempt, self._max_retries)
            except Exception as e:
                logger.warning("API send error: %s (attempt %d/%d)", e, attempt, self._max_retries)

            if attempt < self._max_retries:
                time.sleep(backoff)
                backoff = min(backoff * 2.0, 32.0)

        self._on_failure(payload, timestamp, source, permanent=False)

    def _queue_to_sqlite(self, payload: dict, timestamp: str, source: str) -> None:
        if self._offline_queue is None:
            logger.warning("No offline queue configured — payload dropped (seq=%d)", payload.get("sequence", 0))
            return
        self._offline_queue.insert(
            timestamp=timestamp,
            source=source,
            device_id=self._device_id,
            payload=payload,
            sequence=payload.get("sequence", 0),
        )

    def _on_failure(self, payload: dict, timestamp: str, source: str, permanent: bool) -> None:
        self._consecutive_failures += 1
        if permanent:
            logger.warning("Permanent failure — payload discarded (seq=%d)", payload.get("sequence"))
        else:
            self._queue_to_sqlite(payload, timestamp, source)
