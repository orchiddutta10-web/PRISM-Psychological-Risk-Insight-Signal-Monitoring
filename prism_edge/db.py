import sqlite3
import threading
import logging
from pathlib import Path
from datetime import datetime, timezone
import json

from prism_edge import config

logger = logging.getLogger(__name__)

DB_PATH = Path(config.OFFLINE_QUEUE_DIR).parent / "edge_gateway.db"
_local_local = threading.local()

def get_db():
    if not hasattr(_local_local, "conn"):
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _local_local.conn = sqlite3.connect(DB_PATH, timeout=5.0)
        _local_local.conn.row_factory = sqlite3.Row
        _init_db(_local_local.conn)
    return _local_local.conn

def _init_db(conn):
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                device_id TEXT PRIMARY KEY,
                device_type TEXT NOT NULL,
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP,
                status TEXT,
                guardian_id TEXT,
                battery_level INTEGER,
                firmware_version TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS telemetry_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                payload TEXT,
                synced BOOLEAN DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS risk_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                event_type TEXT,
                severity TEXT,
                payload TEXT,
                synced BOOLEAN DEFAULT 0
            )
        """)

def register_device(device_id: str, device_type: str, guardian_id: str = None, firmware_version: str = None):
    conn = get_db()
    with conn:
        conn.execute("""
            INSERT INTO devices (device_id, device_type, guardian_id, status, firmware_version)
            VALUES (?, ?, ?, 'online', ?)
            ON CONFLICT(device_id) DO UPDATE SET
                last_seen = CURRENT_TIMESTAMP,
                status = 'online',
                firmware_version = excluded.firmware_version,
                guardian_id = COALESCE(excluded.guardian_id, devices.guardian_id)
        """, (device_id, device_type, guardian_id, firmware_version))

def update_device_status(device_id: str, battery_level: int = None):
    conn = get_db()
    with conn:
        if battery_level is not None:
            conn.execute("UPDATE devices SET last_seen = CURRENT_TIMESTAMP, battery_level = ? WHERE device_id = ?", (battery_level, device_id))
        else:
            conn.execute("UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE device_id = ?", (device_id,))

def get_all_devices():
    conn = get_db()
    cur = conn.execute("SELECT * FROM devices")
    return [dict(row) for row in cur.fetchall()]

def save_telemetry(device_id: str, payload: dict):
    conn = get_db()
    with conn:
        conn.execute("INSERT INTO telemetry_cache (device_id, payload) VALUES (?, ?)", (device_id, json.dumps(payload)))

def get_unsynced_telemetry(limit: int = 100):
    conn = get_db()
    cur = conn.execute("SELECT id, device_id, payload FROM telemetry_cache WHERE synced = 0 LIMIT ?", (limit,))
    return [dict(row) for row in cur.fetchall()]

def mark_telemetry_synced(ids: list):
    if not ids: return
    conn = get_db()
    with conn:
        placeholders = ','.join('?' * len(ids))
        conn.execute(f"UPDATE telemetry_cache SET synced = 1 WHERE id IN ({placeholders})", ids)
