-- Brain quests: one row per finished quiz. The stars themselves go in quest_claims (approved), like bonus quests.
CREATE TABLE IF NOT EXISTS quiz_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, week TEXT NOT NULL, kid TEXT NOT NULL, subject TEXT NOT NULL, grade INTEGER NOT NULL,
  score INTEGER NOT NULL, total INTEGER NOT NULL, stars INTEGER NOT NULL,
  missed TEXT, asked TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS quiz_runs_kid ON quiz_runs(kid, date);
