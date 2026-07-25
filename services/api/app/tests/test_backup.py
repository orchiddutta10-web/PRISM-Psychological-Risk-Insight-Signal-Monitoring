import os
import tempfile
import sqlite3
import pytest
from app.utils.backup_manager import (
    perform_point_in_time_backup,
    restore_disaster_recovery_rollback,
)


def test_backup_and_disaster_recovery_restore():
    """
    E2E test verifying:
    1. Creating a point-in-time snapshot.
    2. Simulating a disaster (corruption/accidental deletes).
    3. Rolling back to restore DB to the precise snapshot state.
    """
    # Create temp directory for testing environment
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_prism.db")
        backup_dir = os.path.join(tmpdir, "backups")

        # 1. Initialize DB and seed dummy entries
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        cursor.execute("INSERT INTO users (name) VALUES ('Alice')")
        cursor.execute("INSERT INTO users (name) VALUES ('Bob')")
        conn.commit()
        conn.close()

        # Verify initial state
        conn = sqlite3.connect(db_path)
        res = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        assert res == 2
        conn.close()

        # 2. Perform point-in-time backup
        backup_file = perform_point_in_time_backup(db_path, backup_dir)
        assert os.path.exists(backup_file)

        # 3. Simulate disaster (accidental deletes / data corruption)
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE name = 'Alice'")
        cursor.execute("INSERT INTO users (name) VALUES ('CorruptUser')")
        conn.commit()

        # Verify data is currently corrupted
        res = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        assert res == 2  # Bob and CorruptUser
        alice_check = conn.execute(
            "SELECT COUNT(*) FROM users WHERE name='Alice'"
        ).fetchone()[0]
        assert alice_check == 0
        conn.close()

        # 4. Execute disaster recovery rollback
        restore_disaster_recovery_rollback(backup_file, db_path)

        # 5. Verify database has been completely restored to backup snapshot state
        conn = sqlite3.connect(db_path)
        res = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        assert res == 2

        # Verify Alice is back and CorruptUser is gone
        alice_check = conn.execute(
            "SELECT COUNT(*) FROM users WHERE name='Alice'"
        ).fetchone()[0]
        assert alice_check == 1
        corrupt_check = conn.execute(
            "SELECT COUNT(*) FROM users WHERE name='CorruptUser'"
        ).fetchone()[0]
        assert corrupt_check == 0
        conn.close()
