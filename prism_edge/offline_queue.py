"""
Offline Queue — SQLite-backed temporary queue for offline operation.

Provides:
  - OfflineQueue: CRUD operations on the offline_queue table
  - SyncEngine: background thread that drains the queue to the API when online

SQLite is used ONLY as a temporary offline buffer. The cloud PostgreSQL
database remains the permanent source of truth.
"""

import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

import requests

from prism_edge import config

logger = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS offline_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT NOT NULL,
    source          TEXT NOT NULL,
    device_id       TEXT NOT NULL,
    payload_json    TEXT NOT NULL,
    sequence        INTEGER DEFAULT 0,
    sync_status     TEXT NOT NULL DEFAULT 'pending',
    retry_count     INTEGER DEFAULT 0,
    max_retries     INTEGER DEFAULT 5,
    last_error      TEXT,
    last_error_code INTEGER,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_status ON offline_queue(sync_status, created_at);
CREATE INDEX IF NOT EXISTS idx_sequence ON offline_queue(sequence);
CREATE INDEX IF NOT EXISTS idx_created_at ON offline_queue(created_at);
"""

NumpyEncoder = None


def _get_numpy_encoder():
    global NumpyEncoder
    if NumpyEncoder is None:
        try:
            import numpy as np

            class _NumpyEncoder(json.JSONEncoder):
                def default(self, obj):
                    if isinstance(obj, np.integer):
                        return int(obj)
                    if isinstance(obj, np.floating):
                        return float(obj)
                    if isinstance(obj, np.bool_):
                        return bool(obj)
                    if isinstance(obj, np.ndarray):
                        return obj.tolist()
                    return super().default(obj)

            NumpyEncoder = _NumpyEncoder
        except ImportError:
            NumpyEncoder = json.JSONEncoder
    return NumpyEncoder


class OfflineQueue:
    """
    Thread-safe SQLite queue for offline sensor data.

    Usage:
        queue = OfflineQueue("/var/lib/prism-edge/offline_queue.db")
        row_id = queue.insert(ts, "esp32_pulse", "dev-001", payload)
        pending = queue.get_pending(limit=100)
        queue.mark_synced(row_id)
    """

    def __init__(self, db_path: str | Path):
        self._db_path = Path(db_path)
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        with self._lock:
            conn = sqlite3.connect(str(self._db_path))
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)
            conn.commit()
            conn.close()
        logger.info("Offline queue initialized at %s (WAL mode)", self._db_path)

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path))
        conn.execute("PRAGMA busy_timeout=5000")
        conn.row_factory = sqlite3.Row
        return conn

    def check_disk_space(self) -> bool:
        """Return False if free disk space is critically low."""
        try:
            stat = os.statvfs(str(self._db_path.parent))
            free_mb = (stat.f_frsize * stat.f_bavail) / (1024 * 1024)
            if free_mb < config.OFFLINE_QUEUE_MIN_FREE_MB:
                logger.critical("Disk critically low: %.1f MB free", free_mb)
                return False
            return True
        except Exception:
            return True

    def insert(
        self,
        timestamp: str,
        source: str,
        device_id: str,
        payload: dict[str, Any],
        sequence: int = 0,
    ) -> Optional[int]:
        """
        Insert a record into the offline queue. Returns row ID or None if disk full.

        Duplicate check: skips if a record with same (timestamp, source, device_id)
        exists and is not permanently failed.
        """
        if not self.check_disk_space():
            logger.critical("Offline queue: disk full — rejecting insert")
            return None

        encoder = _get_numpy_encoder()
        payload_json = json.dumps(payload, cls=encoder)

        with self._lock:
            conn = self._get_conn()
            try:
                existing = conn.execute(
                    "SELECT id FROM offline_queue WHERE timestamp=? AND source=? AND device_id=? AND sync_status!='permanent_fail'",
                    (timestamp, source, device_id),
                ).fetchone()
                if existing:
                    logger.debug(
                        "Offline queue: duplicate skipped (id=%d)", existing["id"]
                    )
                    return existing["id"]

                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")
                cursor = conn.execute(
                    "INSERT INTO offline_queue (timestamp, source, device_id, payload_json, sequence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (timestamp, source, device_id, payload_json, sequence, now, now),
                )
                conn.commit()
                row_id = cursor.lastrowid
                return row_id
            except Exception as e:
                logger.error("Offline queue insert error: %s", e)
                return None
            finally:
                conn.close()

    def get_pending(self, limit: int = 100) -> list[dict[str, Any]]:
        """Get oldest pending or failed records, ordered by created_at."""
        with self._lock:
            conn = self._get_conn()
            try:
                rows = conn.execute(
                    "SELECT * FROM offline_queue WHERE sync_status IN ('pending', 'failed') ORDER BY created_at ASC LIMIT ?",
                    (limit,),
                ).fetchall()
                return [dict(r) for r in rows]
            finally:
                conn.close()

    def mark_syncing(self, row_ids: list[int]) -> None:
        """Mark records as being synced (in-flight)."""
        if not row_ids:
            return
        with self._lock:
            conn = self._get_conn()
            try:
                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")
                conn.executemany(
                    "UPDATE offline_queue SET sync_status='syncing', updated_at=? WHERE id=?",
                    [(now, rid) for rid in row_ids],
                )
                conn.commit()
            finally:
                conn.close()

    def mark_synced(self, row_id: int) -> None:
        with self._lock:
            conn = self._get_conn()
            try:
                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")
                conn.execute(
                    "UPDATE offline_queue SET sync_status='synced', updated_at=? WHERE id=?",
                    (now, row_id),
                )
                conn.commit()
            finally:
                conn.close()

    def mark_failed(self, row_id: int, error: str, error_code: int = 0) -> None:
        with self._lock:
            conn = self._get_conn()
            try:
                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")
                conn.execute(
                    "UPDATE offline_queue SET sync_status='failed', retry_count=retry_count+1, last_error=?, last_error_code=?, updated_at=? WHERE id=?",
                    (error, error_code, now, row_id),
                )
                conn.commit()
            finally:
                conn.close()

    def mark_permanent_fail(self, row_id: int, error: str, error_code: int = 0) -> None:
        with self._lock:
            conn = self._get_conn()
            try:
                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")
                conn.execute(
                    "UPDATE offline_queue SET sync_status='permanent_fail', last_error=?, last_error_code=?, updated_at=? WHERE id=?",
                    (error, error_code, now, row_id),
                )
                conn.commit()
                logger.critical(
                    "Permanent failure: row=%d error=%s code=%d",
                    row_id,
                    error,
                    error_code,
                )
            finally:
                conn.close()

    def reset_stale_syncing(self) -> int:
        """Reset any records stuck in 'syncing' state (e.g., from crashed sync)."""
        with self._lock:
            conn = self._get_conn()
            try:
                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")
                cursor = conn.execute(
                    "UPDATE offline_queue SET sync_status='pending', updated_at=? WHERE sync_status='syncing'",
                    (now,),
                )
                conn.commit()
                return cursor.rowcount
            finally:
                conn.close()

    def count_by_status(self) -> dict[str, int]:
        with self._lock:
            conn = self._get_conn()
            try:
                rows = conn.execute(
                    "SELECT sync_status, COUNT(*) as cnt FROM offline_queue GROUP BY sync_status"
                ).fetchall()
                return {r["sync_status"]: r["cnt"] for r in rows}
            finally:
                conn.close()

    def purge_synced(self, older_than_hours: int = 24) -> int:
        from datetime import timedelta

        with self._lock:
            conn = self._get_conn()
            try:
                cutoff = (
                    datetime.now(timezone.utc) - timedelta(hours=older_than_hours)
                ).strftime("%Y-%m-%dT%H:%M:%S.%f")
                cursor = conn.execute(
                    "DELETE FROM offline_queue WHERE sync_status='synced' AND created_at < ?",
                    (cutoff,),
                )
                conn.commit()
                count = cursor.rowcount
                if count > 100:
                    conn.execute("PRAGMA optimize")
                return count
            finally:
                conn.close()

    def get_stats(self) -> dict[str, Any]:
        with self._lock:
            conn = self._get_conn()
            try:
                counts = self.count_by_status()
                stats = conn.execute(
                    "SELECT COUNT(*) as total, MIN(created_at) as oldest, MAX(created_at) as newest FROM offline_queue"
                ).fetchone()
                return {
                    "total": stats["total"],
                    "oldest": stats["oldest"],
                    "newest": stats["newest"],
                    "by_status": counts,
                }
            finally:
                conn.close()

    def verify_integrity(self) -> bool:
        try:
            conn = sqlite3.connect(str(self._db_path))
            result = conn.execute("PRAGMA integrity_check").fetchone()
            conn.close()
            ok = result[0] == "ok"
            if not ok:
                logger.error("SQLite integrity check FAILED: %s", result[0])
            return ok
        except Exception as e:
            logger.error("SQLite integrity check error: %s", e)
            return False

    def vacuum(self) -> None:
        with self._lock:
            conn = self._get_conn()
            try:
                conn.execute("VACUUM")
            finally:
                conn.close()


# ── SyncEngine ─────────────────────────────────────────────────────────────


class SyncEngine:
    """
    Background thread that drains the offline queue to the cloud API.

    Requires a ConnectivityMonitor for online/offline awareness and
    an OfflineQueue instance for data access.

    Usage:
        sync = SyncEngine(queue, connectivity, api_base_url, api_jwt)
        sync.start()
        sync.stop()
    """

    def __init__(
        self,
        queue: OfflineQueue,
        connectivity,  # ConnectivityMonitor
        api_base_url: str,
        api_jwt: str,
        device_id: str,
    ):
        self._queue = queue
        self._connectivity = connectivity
        self._base_url = api_base_url.rstrip("/")
        self._jwt = api_jwt
        self._device_id = device_id
        self._batch_size: int = config.OFFLINE_SYNC_BATCH_SIZE
        self._max_retries: int = config.OFFLINE_SYNC_MAX_RETRIES
        self._purge_hours: int = config.OFFLINE_SYNC_PURGE_HOURS
        self._purge_aggressive: int = config.OFFLINE_SYNC_PURGE_AGGRESSIVE

        self._running: bool = False
        self._thread: Optional[threading.Thread] = None
        self._session: Optional[requests.Session] = None
        self._active: bool = False
        self._lock: threading.Lock = threading.Lock()
        self._on_status_callbacks: list[Callable[[str], None]] = []

    @property
    def active(self) -> bool:
        with self._lock:
            return self._active

    def on_status(self, callback: Callable[[str], None]) -> None:
        self._on_status_callbacks.append(callback)

    def start(self) -> None:
        self._queue.reset_stale_syncing()
        self._running = True
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._jwt}",
            }
        )
        self._thread = threading.Thread(
            target=self._loop, name="sync-engine", daemon=True
        )
        self._thread.start()
        logger.info("SyncEngine started (batch_size=%d)", self._batch_size)

    def stop(self) -> None:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=10.0)
        if self._session:
            self._session.close()
            self._session = None
        logger.info("SyncEngine stopped")

    def _loop(self) -> None:
        while self._running:
            if not self._connectivity.is_online():
                time.sleep(5)
                continue

            records = self._queue.get_pending(limit=self._batch_size)
            if not records:
                with self._lock:
                    self._active = False
                self._notify_status("IDLE")
                time.sleep(30)
                continue

            with self._lock:
                self._active = True
            self._notify_status("SYNCING")
            self._sync_batch(records)

    def _sync_batch(self, records: list[dict[str, Any]]) -> None:
        row_ids = [r["id"] for r in records]
        self._queue.mark_syncing(row_ids)
        batch_id = str(uuid.uuid4())

        pending_count = sum(1 for s in self._queue.count_by_status().values())
        logger.info(
            "Sync batch %s: %d records, %d total pending",
            batch_id,
            len(records),
            pending_count,
        )

        events = []
        for i, rec in enumerate(records):
            try:
                payload = json.loads(rec["payload_json"])
            except json.JSONDecodeError:
                self._queue.mark_permanent_fail(rec["id"], "Corrupted JSON payload", 0)
                continue
            events.append(
                {
                    "row_index": i,
                    "timestamp": rec["timestamp"],
                    "source": rec["source"],
                    "payload": payload,
                }
            )

        if not events:
            return

        body = {
            "batch_id": batch_id,
            "device_id": self._device_id,
            "events": [
                {
                    "timestamp": e["timestamp"],
                    "source": e["source"],
                    "payload": e["payload"],
                }
                for e in events
            ],
        }

        try:
            resp = self._session.post(
                f"{self._base_url}/api/v1/events/ingest/batch",
                json=body,
                timeout=60.0,
            )

            if resp.status_code in (200, 201):
                data = resp.json()
                accepted = data.get("accepted", 0)
                rejected = data.get("rejected", 0)
                results = data.get("results", [])

                for result in results:
                    rec_index = result.get("row_index", -1)
                    if 0 <= rec_index < len(records):
                        rid = records[rec_index]["id"]
                        if result.get("status") == "synced":
                            self._queue.mark_synced(rid)
                        else:
                            err = result.get("error", "rejected")
                            code = result.get("code", "unknown")
                            rec = records[rec_index]
                            if rec["retry_count"] >= rec.get(
                                "max_retries", self._max_retries
                            ):
                                self._queue.mark_permanent_fail(rid, err, 400)
                            else:
                                self._queue.mark_failed(rid, err, 400)

                logger.info(
                    "Sync batch %s complete: accepted=%d rejected=%d",
                    batch_id,
                    accepted,
                    rejected,
                )

            elif resp.status_code == 401:
                for rid in row_ids:
                    self._queue.mark_permanent_fail(
                        rid, "Authentication rejected (401)", 401
                    )
                logger.error("Sync batch %s: permanent auth failure", batch_id)
                self._notify_status("ERROR")

            elif resp.status_code == 400:
                for rid in row_ids:
                    self._queue.mark_permanent_fail(
                        rid, f"Bad request: {resp.text[:200]}", 400
                    )
                logger.error("Sync batch %s: permanent bad request", batch_id)

            else:
                err_msg = f"HTTP {resp.status_code}: {resp.text[:200]}"
                for rec in records:
                    if rec["retry_count"] >= rec.get("max_retries", self._max_retries):
                        self._queue.mark_permanent_fail(
                            rec["id"], err_msg, resp.status_code
                        )
                    else:
                        self._queue.mark_failed(rec["id"], err_msg, resp.status_code)
                logger.warning("Sync batch %s failed: %s", batch_id, err_msg)

        except requests.exceptions.Timeout:
            for rec in records:
                self._queue.mark_failed(rec["id"], "Request timeout", 0)
            logger.warning("Sync batch %s: timeout", batch_id)

        except requests.exceptions.ConnectionError:
            for rec in records:
                self._queue.mark_failed(rec["id"], "Connection refused", 0)
            logger.warning("Sync batch %s: connection error", batch_id)

        except Exception as e:
            for rec in records:
                self._queue.mark_failed(rec["id"], str(e), 0)
            logger.error("Sync batch %s: unexpected error: %s", batch_id, e)

        self._purge_if_needed()

    def _purge_if_needed(self) -> None:
        counts = self._queue.count_by_status()
        total = sum(counts.values())

        if total > self._purge_aggressive:
            deleted = self._queue.purge_synced(older_than_hours=1)
            if deleted:
                logger.info(
                    "Aggressive purge: deleted %d synced records (queue=%d)",
                    deleted,
                    total,
                )
        else:
            self._queue.purge_synced(older_than_hours=self._purge_hours)

    def _notify_status(self, status: str) -> None:
        for cb in self._on_status_callbacks:
            try:
                cb(status)
            except Exception:
                pass
