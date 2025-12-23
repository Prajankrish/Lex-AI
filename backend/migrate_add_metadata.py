# backend/migrate_add_metadata.py
import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), "lexai.db")
if not os.path.exists(DB):
    print("DB file not found:", DB)
    raise SystemExit(1)

conn = sqlite3.connect(DB)
cur = conn.cursor()

# Check columns first
cur.execute("PRAGMA table_info(messages);")
cols = [row[1] for row in cur.fetchall()]
print("Existing columns in messages:", cols)

if "metadata" in cols:
    print("Column 'metadata' already exists — nothing to do.")
else:
    print("Adding 'metadata' column to messages table...")
    cur.execute("ALTER TABLE messages ADD COLUMN metadata TEXT;")
    conn.commit()
    print("Done. New columns:")
    cur.execute("PRAGMA table_info(messages);")
    print([row[1] for row in cur.fetchall()])

conn.close()
