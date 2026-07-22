import os
import shutil
import sqlite3
import time
import logging
from datetime import datetime

def perform_point_in_time_backup(db_path: str, backup_dir: str) -> str:
    """
    Creates a point-in-time snapshot of the SQLite database.
    Uses sqlite3's backup API to copy tables cleanly even while database writes are active.
    """
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Source database path not found: {db_path}")
        
    os.makedirs(backup_dir, exist_ok=True)
    
    from datetime import timezone
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_filename = f"prism_backup_{timestamp}.db"
    backup_filepath = os.path.join(backup_dir, backup_filename)
    
    try:
        # Source connection
        src_conn = sqlite3.connect(db_path)
        # Target backup connection
        dest_conn = sqlite3.connect(backup_filepath)
        
        # Lock database and perform online backup
        with dest_conn:
            src_conn.backup(dest_conn, pages=100, progress=None)
            
        dest_conn.close()
        src_conn.close()
        
        logging.info(f"Database point-in-time backup successfully created at: {backup_filepath}")
        return backup_filepath
    except Exception as e:
        logging.error(f"Backup failed: {str(e)}")
        raise e

def restore_disaster_recovery_rollback(backup_filepath: str, db_path: str):
    """
    Restores the database to a specific point-in-time snapshot (disaster recovery rollback).
    """
    if not os.path.exists(backup_filepath):
        raise FileNotFoundError(f"Backup snapshot file not found: {backup_filepath}")
        
    try:
        # If target database exists, make a temporary copy before restoring
        if os.path.exists(db_path):
            temp_safety_copy = f"{db_path}.safety_tmp"
            shutil.copy2(db_path, temp_safety_copy)
            
        # Copy the backup file to the target DB location
        shutil.copy2(backup_filepath, db_path)
        
        # Remove safety temp copy on success
        if os.path.exists(f"{db_path}.safety_tmp"):
            os.remove(f"{db_path}.safety_tmp")
            
        logging.info(f"Disaster recovery rollback successful. Restored database to snapshot: {backup_filepath}")
    except Exception as e:
        logging.error(f"Disaster recovery rollback failed: {str(e)}")
        # Restore safety temporary copy if available
        if os.path.exists(f"{db_path}.safety_tmp"):
            shutil.move(f"{db_path}.safety_tmp", db_path)
        raise e
