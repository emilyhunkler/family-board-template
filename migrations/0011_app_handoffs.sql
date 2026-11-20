-- Get the app: on iPhones and iPads an app added to the home screen starts with its own empty storage, so it
-- would open signed out. A one-time code (only its SHA-256 is kept) lets the new app sign in to the same family
-- once, within 20 minutes. Used and expired codes are tidied up when new ones are made.
CREATE TABLE IF NOT EXISTS app_handoffs (
  id TEXT PRIMARY KEY,
  household_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER,
  kind TEXT NOT NULL,
  device TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS app_handoffs_exp ON app_handoffs(expires_at);
