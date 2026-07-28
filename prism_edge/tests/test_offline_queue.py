"""
Tests for offline_queue.py — OfflineQueue and SyncEngine.
"""
import json
import os
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add prism_edge to path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prism_edge.config import (
    OFFLINE_SYNC_BATCH_SIZE, OFFLINE_SYNC_MAX_RETRIES,
    OFFLINE_SYNC_PURGE_HOURS, OFFLINE_SYNC_PURGE_AGGRESSIVE,
)
from prism_edge.offline_queue import OfflineQueue, SyncEngine


@pytest.fixture
def temp_db():
    """Create a temporary SQLite database for testing."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    queue = OfflineQueue(path)
    yield queue
    queue.vacuum()
    if os.path.exists(path):
        os.unlink(path)
    wal = path + "-wal"
    shm = path + "-shm"
    for f in (wal, shm):
        if os.path.exists(f):
            os.unlink(f)


class TestOfflineQueue:
    def test_insert_and_get_pending(self, temp_db):
        ts = datetime.now(timezone.utc).isoformat()
        row_id = temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 72, "g_force": 1.05})
        assert row_id is not None
        assert row_id > 0

        pending = temp_db.get_pending(limit=10)
        assert len(pending) == 1
        assert pending[0]["source"] == "esp32_pulse"
        assert pending[0]["device_id"] == "dev-001"
        assert pending[0]["sync_status"] == "pending"

    def test_fifo_ordering(self, temp_db):
        for i in range(5):
            ts = datetime.now(timezone.utc).isoformat()
            temp_db.insert(ts, "esp32_pulse", "dev-001", {"seq": i})
            time.sleep(0.01)

        pending = temp_db.get_pending(limit=5)
        seqs = [json.loads(r["payload_json"])["seq"] for r in pending]
        assert seqs == [0, 1, 2, 3, 4]

    def test_mark_synced(self, temp_db):
        ts = datetime.now(timezone.utc).isoformat()
        row_id = temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 72})
        temp_db.mark_synced(row_id)

        pending = temp_db.get_pending()
        assert len(pending) == 0

    def test_mark_failed(self, temp_db):
        ts = datetime.now(timezone.utc).isoformat()
        row_id = temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 72})
        temp_db.mark_failed(row_id, "Connection timeout", 0)

        pending = temp_db.get_pending()
        assert len(pending) == 1
        assert pending[0]["sync_status"] == "failed"
        assert pending[0]["retry_count"] == 1

    def test_mark_permanent_fail(self, temp_db):
        ts = datetime.now(timezone.utc).isoformat()
        row_id = temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 72})
        temp_db.mark_permanent_fail(row_id, "Auth rejected", 401)

        pending = temp_db.get_pending()
        assert len(pending) == 0  # permanent_fail not returned as pending

    def test_dedup_skips_existing(self, temp_db):
        ts = "2026-07-28T12:00:00.000000"
        row1 = temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 72})
        row2 = temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 73})  # same key

        assert row1 is not None
        assert row2 == row1  # dedup returns existing id

    def test_count_by_status(self, temp_db):
        ts_base = datetime.now(timezone.utc)
        for i in range(3):
            r = temp_db.insert(
                ts_base.replace(microsecond=i * 1000).isoformat(),
                "esp32_pulse", "dev-001", {"seq": i},
            )
        temp_db.mark_synced(r)

        counts = temp_db.count_by_status()
        total = sum(counts.values())
        assert total >= 3

    def test_purge_synced(self, temp_db):
        ts = datetime.now(timezone.utc).isoformat()
        row_id = temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 72})
        temp_db.mark_synced(row_id)

        deleted = temp_db.purge_synced(older_than_hours=0)
        assert deleted >= 1

    def test_reset_stale_syncing(self, temp_db):
        ts = datetime.now(timezone.utc).isoformat()
        row_id = temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 72})
        temp_db.mark_syncing([row_id])

        count = temp_db.reset_stale_syncing()
        assert count >= 1

        pending = temp_db.get_pending()
        assert len(pending) >= 1
        assert pending[0]["sync_status"] == "pending"

    def test_verify_integrity(self, temp_db):
        assert temp_db.verify_integrity() is True

    def test_numpy_serialization(self, temp_db):
        try:
            import numpy as np
            ts = datetime.now(timezone.utc).isoformat()
            payload = {"value": np.float64(3.14), "count": np.int32(42), "arr": np.array([1, 2, 3])}
            row_id = temp_db.insert(ts, "test", "dev-001", payload)
            assert row_id is not None
        except ImportError:
            pytest.skip("NumPy not installed")


class TestSyncEngine:
    @pytest.fixture
    def mock_connectivity(self):
        monitor = MagicMock()
        monitor.is_online.return_value = True
        return monitor

    @pytest.fixture
    def mock_session(self):
        session = MagicMock()
        session.post.return_value.status_code = 200
        session.post.return_value.json.return_value = {
            "batch_id": str(uuid.uuid4()),
            "accepted": 1,
            "rejected": 0,
            "results": [{"row_index": 0, "status": "synced", "cloud_id": str(uuid.uuid4())}],
        }
        return session

    def test_sync_drains_pending(self, temp_db, mock_connectivity, mock_session):
        ts = datetime.now(timezone.utc).isoformat()
        row_id = temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 72, "g_force": 1.05})

        engine = SyncEngine(
            temp_db, mock_connectivity,
            "http://localhost:8000", "fake-jwt", "dev-001",
        )
        engine._session = mock_session
        engine._running = False  # Don't loop

        records = temp_db.get_pending(limit=10)
        assert len(records) == 1

        engine._sync_batch(records)

        mock_session.post.assert_called_once()
        pending = temp_db.get_pending()
        assert len(pending) == 0

    def test_sync_handles_401(self, temp_db, mock_connectivity, mock_session):
        mock_session.post.return_value.status_code = 401

        ts = datetime.now(timezone.utc).isoformat()
        row_id = temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 72})

        engine = SyncEngine(
            temp_db, mock_connectivity,
            "http://localhost:8000", "fake-jwt", "dev-001",
        )
        engine._session = mock_session
        engine._running = False

        records = temp_db.get_pending(limit=10)
        engine._sync_batch(records)

        pending = temp_db.get_pending()
        assert len(pending) == 0  # permanent_fail not pending

    def test_sync_handles_500(self, temp_db, mock_connectivity, mock_session):
        mock_session.post.return_value.status_code = 500
        mock_session.post.return_value.text = "Internal Server Error"

        ts = datetime.now(timezone.utc).isoformat()
        row_id = temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 72})

        engine = SyncEngine(
            temp_db, mock_connectivity,
            "http://localhost:8000", "fake-jwt", "dev-001",
        )
        engine._session = mock_session
        engine._running = False

        records = temp_db.get_pending(limit=10)
        engine._sync_batch(records)

        pending = temp_db.get_pending()
        assert len(pending) == 1  # failed status, still pending for retry
        assert pending[0]["sync_status"] == "failed"
        assert pending[0]["retry_count"] == 1

    def test_sync_stops_when_offline(self, temp_db, mock_connectivity, mock_session):
        mock_connectivity.is_online.return_value = False

        ts = datetime.now(timezone.utc).isoformat()
        temp_db.insert(ts, "esp32_pulse", "dev-001", {"bpm": 72})

        engine = SyncEngine(
            temp_db, mock_connectivity,
            "http://localhost:8000", "fake-jwt", "dev-001",
        )
        engine._session = mock_session
        engine._running = True

        def stop_after_check():
            time.sleep(0.1)
            engine._running = False

        t = threading.Thread(target=stop_after_check)
        t.start()
        engine._loop()
        t.join()

        mock_session.post.assert_not_called()

    def test_corrupted_json_handled(self, temp_db, mock_connectivity, mock_session):
        """Insert corrupted payload directly then try to sync."""
        import sqlite3
        ts = datetime.now(timezone.utc).isoformat()
        # Insert via raw SQL with bad JSON
        conn = sqlite3.connect(str(temp_db._db_path))
        conn.execute(
            "INSERT INTO offline_queue (timestamp, source, device_id, payload_json) VALUES (?, ?, ?, ?)",
            (ts, "esp32_pulse", "dev-001", "{bad json"),
        )
        conn.commit()
        conn.close()

        engine = SyncEngine(
            temp_db, mock_connectivity,
            "http://localhost:8000", "fake-jwt", "dev-001",
        )
        engine._session = mock_session
        engine._running = False

        records = temp_db.get_pending(limit=10)
        engine._sync_batch(records)

        # Corrupted record should be marked permanent_fail
        pending = temp_db.get_pending()
        assert len(pending) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
