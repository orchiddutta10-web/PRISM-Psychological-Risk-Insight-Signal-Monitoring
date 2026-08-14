import sqlite3

def check():
    conn = sqlite3.connect('services/api/prism.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, guardian_id FROM child_devices")
    print("Devices:", cursor.fetchall())
    cursor.execute("SELECT id, email, full_name FROM guardians")
    print("Guardians:", cursor.fetchall())

check()
