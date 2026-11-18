CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL, from_who TEXT, page TEXT, created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', issue_url TEXT
);
