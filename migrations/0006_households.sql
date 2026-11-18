-- Every row belongs to one family (household). Existing rows become household 1, so a board
-- that was set up before this keeps all its data. Tables whose keys were "one per board"
-- (settings, meals, cache, checks) are rebuilt so each family gets its own keys.

INSERT OR IGNORE INTO households(id, name, created_at) VALUES (1, 'Family', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE settings_new (household_id INTEGER NOT NULL DEFAULT 1, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT, PRIMARY KEY (household_id, key));
INSERT INTO settings_new(household_id, key, value, updated_at) SELECT 1, key, value, updated_at FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;

CREATE TABLE meals_new (household_id INTEGER NOT NULL DEFAULT 1, date TEXT NOT NULL, text TEXT NOT NULL, who TEXT, emoji TEXT, ingredients TEXT, PRIMARY KEY (household_id, date));
INSERT INTO meals_new(household_id, date, text, who, emoji, ingredients) SELECT 1, date, text, who, emoji, ingredients FROM meals;
DROP TABLE meals;
ALTER TABLE meals_new RENAME TO meals;

CREATE TABLE cache_new (household_id INTEGER NOT NULL DEFAULT 1, key TEXT NOT NULL, value TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY (household_id, key));
INSERT INTO cache_new(household_id, key, value, fetched_at) SELECT 1, key, value, fetched_at FROM cache;
DROP TABLE cache;
ALTER TABLE cache_new RENAME TO cache;

CREATE TABLE checks_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT, household_id INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL, kid TEXT NOT NULL, task TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1, kind TEXT NOT NULL DEFAULT 'chore',
  done_at TEXT NOT NULL, by TEXT,
  UNIQUE(household_id, date, kid, task)
);
INSERT INTO checks_new(id, household_id, date, kid, task, points, kind, done_at, by) SELECT id, 1, date, kid, task, points, kind, done_at, by FROM checks;
DROP TABLE checks;
ALTER TABLE checks_new RENAME TO checks;
CREATE INDEX checks_hh_date ON checks(household_id, date);

ALTER TABLE quest_claims ADD COLUMN household_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE todos ADD COLUMN household_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ledger ADD COLUMN household_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE groceries ADD COLUMN household_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notes ADD COLUMN household_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events_log ADD COLUMN household_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE feedback ADD COLUMN household_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reward_requests ADD COLUMN household_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE photos ADD COLUMN household_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_subs ADD COLUMN household_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE quiz_runs ADD COLUMN household_id INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS quest_claims_hh ON quest_claims(household_id, date);
CREATE INDEX IF NOT EXISTS todos_hh ON todos(household_id, date);
CREATE INDEX IF NOT EXISTS ledger_hh ON ledger(household_id, kid);
CREATE INDEX IF NOT EXISTS groceries_hh ON groceries(household_id);
CREATE INDEX IF NOT EXISTS notes_hh ON notes(household_id);
CREATE INDEX IF NOT EXISTS events_log_hh ON events_log(household_id, id);
CREATE INDEX IF NOT EXISTS feedback_hh ON feedback(household_id);
CREATE INDEX IF NOT EXISTS reward_requests_hh ON reward_requests(household_id);
CREATE INDEX IF NOT EXISTS photos_hh ON photos(household_id, hidden);
CREATE INDEX IF NOT EXISTS push_subs_hh ON push_subs(household_id);
CREATE INDEX IF NOT EXISTS quiz_runs_hh ON quiz_runs(household_id, kid, date);
CREATE INDEX IF NOT EXISTS users_hh ON users(household_id);
CREATE INDEX IF NOT EXISTS sessions_hh ON sessions(household_id);
