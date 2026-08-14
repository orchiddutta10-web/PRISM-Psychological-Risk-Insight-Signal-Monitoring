import sqlite3

def check():
    conn = sqlite3.connect('services/api/prism.db')
    cursor = conn.cursor()
    cursor.execute("SELECT signal_type, rolling_mean, rolling_variance FROM baseline_profiles WHERE device_id='cc571fcd-cb82-4a39-a584-fcafc9de1c00'")
    print("Baselines:", cursor.fetchall())
    cursor.execute("SELECT model_name, score FROM risk_scores WHERE device_id='cc571fcd-cb82-4a39-a584-fcafc9de1c00'")
    print("Scores:", cursor.fetchall())

check()
