-- Shared-site sign-up and kitchen-display pairing.
-- signups: a new family that chose "Continue with Google" waits here for Google to answer (10 minutes).
-- pairings: a kitchen screen shows a short code; a signed-in grown-up types it on their phone, and the
-- screen joins that family. Both are keyed by the SHA-256 of a secret only the browser holds.
CREATE TABLE IF NOT EXISTS signups (
  id TEXT PRIMARY KEY, family TEXT NOT NULL, person TEXT NOT NULL, zone TEXT,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pairings (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, household_id INTEGER, claimed_by INTEGER,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
