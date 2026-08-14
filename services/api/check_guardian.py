import sqlite3
conn = sqlite3.connect('C:\\Users\\Win 10\\Documents\\PRISM-Psychological-Risk-Insight-Signal-Monitoring\\services\\api\\prism.db')
c = conn.cursor()
c.execute("SELECT id, email, role FROM guardians WHERE id='0ad2f62a-e779-41cd-978c-23a0954379a3'")
print(c.fetchall())
