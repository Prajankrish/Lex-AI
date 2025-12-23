# backend/db.py
"""
Simple SQLite persistence for LEXAI.

Provides:
- create_session(user_id) -> session_id (str)
- add_message(session_id, role, content, metadata=None)
- get_messages(session_id) -> list[dict]
- get_sessions_for_user(user_id) -> list[dict]
- delete_session(session_id) -> bool
- update_session_title(session_id, title) -> None

User persistence:
- get_user_by_id(user_id) -> Optional[dict]
- get_user_by_email(email) -> Optional[dict]
- create_email_user(user_id, email, name, hashed_password) -> None
- upsert_google_user(user_id, email, name, avatar, verified=True) -> None
- get_password_hash(user_id) -> Optional[str]
- update_last_login(user_id) -> None
 - update_user_name(user_id, name) -> None
 - set_password_hash(user_id, hashed_password) -> None
"""

import sqlite3
import uuid
import json
import os
from typing import Optional, List, Dict, Any
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "lexai.db")
# ensure folder exists
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def _get_conn():
    # row_factory for dict-like rows
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    conn = _get_conn()
    cur = conn.cursor()
    # sessions: id, user_id, title, created_at
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT,
            created_at TEXT NOT NULL
        )
        """
    )

    # messages: id (autoinc), session_id FK, role, content (TEXT), metadata(JSON TEXT), timestamp
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
        """
    )

    # index for faster lookups
    cur.execute("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")

    # users table for authentication persistence
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            email TEXT,
            name TEXT,
            avatar TEXT,
            hashed_password TEXT,
            verified INTEGER,
            created_at TEXT NOT NULL,
            last_login TEXT
        )
        """
    )
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)")

    conn.commit()
    conn.close()


# initialize on import
_init_db()


def create_session(user_id: str) -> str:
    """Create a new session for user and return session_id."""
    session_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO sessions (id, user_id, title, created_at) VALUES (?, ?, ?, ?)",
        (session_id, user_id, None, created_at),
    )
    conn.commit()
    conn.close()
    return session_id


def update_session_title(session_id: str, title: str) -> None:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE sessions SET title = ? WHERE id = ?", (title, session_id))
    conn.commit()
    conn.close()


def add_message(session_id: str, role: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    """
    Add a message to messages table.
    - content must be a string (we call str(content) to be safe).
    - metadata is serialized to JSON string if provided.
    """
    if content is None:
        content = ""
    content_text = str(content)
    meta_text = None
    if metadata is not None:
        try:
            meta_text = json.dumps(metadata, ensure_ascii=False)
        except Exception:
            # Fallback: store a simple string
            meta_text = json.dumps({"note": "metadata serialization failed"})

    timestamp = datetime.utcnow().isoformat()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO messages (session_id, role, content, metadata, timestamp) VALUES (?, ?, ?, ?, ?)",
        (session_id, role, content_text, meta_text, timestamp),
    )
    conn.commit()
    conn.close()


def get_messages(session_id: str) -> List[Dict[str, Any]]:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT role, content, metadata, timestamp FROM messages WHERE session_id = ? ORDER BY id ASC", (session_id,))
    rows = cur.fetchall()
    out = []
    for r in rows:
        meta = None
        if r["metadata"]:
            try:
                meta = json.loads(r["metadata"])
            except Exception:
                meta = {"raw": r["metadata"]}
        out.append({"role": r["role"], "content": r["content"], "metadata": meta, "timestamp": r["timestamp"]})
    conn.close()
    return out


def get_sessions_for_user(user_id: str) -> List[Dict[str, Any]]:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, title, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC", (user_id,))
    rows = cur.fetchall()
    out = []
    for r in rows:
        out.append({"id": r["id"], "title": r["title"], "created_at": r["created_at"]})
    conn.close()
    return out


def delete_session(session_id: str) -> bool:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
    cur.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    changed = conn.total_changes
    conn.commit()
    conn.close()
    # return True if anything was removed
    return changed > 0


# -------------------------
# Users (Auth) Persistence
# -------------------------

def _row_to_dict(row) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    return {k: row[k] for k in row.keys()}


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    conn.close()
    return _row_to_dict(row)


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = ?", (email,))
    row = cur.fetchone()
    conn.close()
    return _row_to_dict(row)


def create_email_user(user_id: str, email: str, name: str, hashed_password: str) -> None:
    now = datetime.utcnow().isoformat()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (id, provider, email, name, avatar, hashed_password, verified, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, "email", email, name, None, hashed_password, 1, now, now),
    )
    conn.commit()
    conn.close()


def upsert_google_user(user_id: str, email: str, name: str, avatar: Optional[str], verified: bool = True) -> str:
    """Upsert a Google user. If another user exists with the same email, merge into that user and return its id.

    Returns the user_id that should be used going forward.
    """
    now = datetime.utcnow().isoformat()
    conn = _get_conn()
    cur = conn.cursor()

    # Try update by id first
    cur.execute(
        "UPDATE users SET provider = ?, email = ?, name = ?, avatar = ?, verified = ?, last_login = ? WHERE id = ?",
        ("google", email, name, avatar, 1 if verified else 0, now, user_id),
    )
    if cur.rowcount > 0:
        conn.commit()
        conn.close()
        return user_id

    # If not found by id, check if there's an existing account by email
    cur.execute("SELECT id FROM users WHERE email = ?", (email,))
    row = cur.fetchone()
    if row:
        existing_id = row[0]
        # Merge: update existing user with Google details
        cur.execute(
            "UPDATE users SET provider = ?, name = ?, avatar = ?, verified = ?, last_login = ? WHERE id = ?",
            ("google", name, avatar, 1 if verified else 0, now, existing_id),
        )
        conn.commit()
        conn.close()
        return existing_id

    # Otherwise, insert new user with provided user_id
    cur.execute(
        "INSERT INTO users (id, provider, email, name, avatar, hashed_password, verified, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, "google", email, name, avatar, None, 1 if verified else 0, now, now),
    )
    conn.commit()
    conn.close()
    return user_id


def get_password_hash(user_id: str) -> Optional[str]:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT hashed_password FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    conn.close()
    if row and row["hashed_password"]:
        return row["hashed_password"]
    return None


def update_last_login(user_id: str) -> None:
    now = datetime.utcnow().isoformat()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user_id))
    conn.commit()
    conn.close()


def update_user_name(user_id: str, name: str) -> None:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE users SET name = ? WHERE id = ?", (name, user_id))
    conn.commit()
    conn.close()


def set_password_hash(user_id: str, hashed_password: str) -> None:
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE users SET hashed_password = ? WHERE id = ?", (hashed_password, user_id))
    conn.commit()
    conn.close()
