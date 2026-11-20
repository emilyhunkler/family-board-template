-- Each day's chore list, saved as the day goes. Once a day is over the board scores it from this
-- list, so adding, removing or reordering chores later doesn't change stars already earned or missed.
CREATE TABLE IF NOT EXISTS day_plans (
  household_id INTEGER NOT NULL DEFAULT 1, date TEXT NOT NULL, plan TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, date)
);
