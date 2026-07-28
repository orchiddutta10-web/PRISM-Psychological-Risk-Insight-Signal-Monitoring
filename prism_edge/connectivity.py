"""
Connectivity Monitor — detects internet availability via multi-endpoint probing.

Probes the API health endpoint, plus DNS reachability to 8.8.8.8 and 1.1.1.1.
Uses a hysteresis state machine to avoid flapping:
  3 consecutive failures → offline
  2 consecutive successes → online
"""

import logging
import socket
import threading
import time
from typing import Callable, Optional

import requests

from prism_edge import config

logger = logging.getLogger(__name__)


class ConnectivityMonitor:
    """
    Background thread that probes internet connectivity at configurable intervals.

    Usage:
        monitor = ConnectivityMonitor()
        monitor.on_offline(lambda: print("Went offline"))
        monitor.on_online(lambda: print("Back online"))
        monitor.start()
        ...
        monitor.stop()
    """

    STATE_ONLINE = "online"
    STATE_OFFLINE = "offline"

    def __init__(self):
        self._api_url: str = config.API_BASE_URL.rstrip("/") + "/"
        self._probe_timeout: float = config.CONNECTIVITY_PROBE_TIMEOUT
        self._interval_online: float = config.CONNECTIVITY_PROBE_INTERVAL_ONLINE
        self._interval_offline: float = config.CONNECTIVITY_PROBE_INTERVAL_OFFLINE
        self._failures_to_offline: int = config.CONNECTIVITY_FAILURES_TO_OFFLINE
        self._successes_to_online: int = config.CONNECTIVITY_SUCCESSES_TO_ONLINE

        self._state: str = self.STATE_ONLINE
        self._consecutive_failures: int = 0
        self._consecutive_successes: int = 0
        self._last_change_time: float = time.time()
        self._running: bool = False
        self._thread: Optional[threading.Thread] = None
        self._lock: threading.Lock = threading.Lock()

        self._on_offline_callbacks: list[Callable[[], None]] = []
        self._on_online_callbacks: list[Callable[[], None]] = []

    @property
    def state(self) -> str:
        with self._lock:
            return self._state

    @property
    def last_change_time(self) -> float:
        with self._lock:
            return self._last_change_time

    def is_online(self) -> bool:
        return self.state == self.STATE_ONLINE

    def wait_for_online(self, timeout: Optional[float] = None) -> bool:
        """Block until connectivity is restored or timeout expires."""
        deadline = time.time() + timeout if timeout else float("inf")
        while time.time() < deadline:
            if self.is_online():
                return True
            time.sleep(min(1.0, max(0.1, deadline - time.time())))
        return self.is_online()

    def on_offline(self, callback: Callable[[], None]) -> None:
        self._on_offline_callbacks.append(callback)

    def on_online(self, callback: Callable[[], None]) -> None:
        self._on_online_callbacks.append(callback)

    def start(self) -> None:
        self._running = True
        self._thread = threading.Thread(target=self._probe_loop, name="connectivity-probe", daemon=True)
        self._thread.start()
        logger.info("Connectivity monitor started (state=%s)", self._state)

    def stop(self) -> None:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
        logger.info("Connectivity monitor stopped")

    # ── Internal ────────────────────────────────────────────────────────

    def _probe_loop(self) -> None:
        while self._running:
            online = self._check_all_probes()
            self._update_state(online)
            interval = self._interval_online if online else self._interval_offline
            time.sleep(interval)

    def _check_all_probes(self) -> bool:
        """Return True if ANY probe succeeds."""
        probes = [
            ("api", self._probe_api),
            ("dns_google", lambda: self._probe_dns("8.8.8.8", 53)),
            ("dns_cloudflare", lambda: self._probe_dns("1.1.1.1", 53)),
        ]
        for name, probe in probes:
            try:
                if probe():
                    return True
            except Exception:
                pass
        return False

    def _probe_api(self) -> bool:
        try:
            resp = requests.get(self._api_url, timeout=self._probe_timeout)
            return resp.status_code < 500
        except Exception:
            return False

    @staticmethod
    def _probe_dns(host: str, port: int) -> bool:
        try:
            sock = socket.create_connection((host, port), timeout=2.0)
            sock.close()
            return True
        except (socket.timeout, OSError):
            return False

    def _update_state(self, probe_success: bool) -> None:
        with self._lock:
            if probe_success:
                self._consecutive_failures = 0
                self._consecutive_successes += 1
            else:
                self._consecutive_successes = 0
                self._consecutive_failures += 1

            old_state = self._state

            if self._state == self.STATE_ONLINE and self._consecutive_failures >= self._failures_to_offline:
                self._state = self.STATE_OFFLINE
                self._last_change_time = time.time()
                logger.info("Connectivity lost — %d consecutive failures", self._consecutive_failures)
                for cb in self._on_offline_callbacks:
                    self._safe_call(cb)

            elif self._state == self.STATE_OFFLINE and self._consecutive_successes >= self._successes_to_online:
                self._state = self.STATE_ONLINE
                duration = time.time() - self._last_change_time
                self._last_change_time = time.time()
                logger.info("Connectivity restored — offline for %.0f seconds", duration)
                for cb in self._on_online_callbacks:
                    self._safe_call(cb)

    @staticmethod
    def _safe_call(callback: Callable[[], None]) -> None:
        try:
            callback()
        except Exception as e:
            logger.error("Connectivity callback error: %s", e)
