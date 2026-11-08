-- Logged-in sessions: our cookie id -> Cozytouch tokens and per-device commands (JSON)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_expires_at ON sessions (expires_at);
