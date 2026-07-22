import sqlite3
import os

db_path = 'prism.db'
if not os.path.exists(db_path):
    print("prism.db does not exist!")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(audit_log_entries)")
    cols = cursor.fetchall()
    print("prism.db audit_log_entries columns:")
    for c in cols:
        print(c)
    conn.close()
