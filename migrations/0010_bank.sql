-- Kids' bank: a kid can ask for cash from their bank any time, and a grown-up says yes once it's handed over.
-- Money in and out of the bank goes in the ledger (kind 'jar' in, 'cashout' out), so the savings jar a kid
-- already has becomes their bank balance.
CREATE TABLE IF NOT EXISTS cash_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL DEFAULT 1,
  kid TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  requested_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS cash_requests_hh ON cash_requests(household_id, kid, status);
