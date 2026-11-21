-- Notifications follow the person and the device that turned them on. When a grown-up is removed, or a phone
-- is signed out, its notifications stop too. Phones set up before this have neither and stay as they were
-- until a grown-up removes them under Notifications.
ALTER TABLE push_subs ADD COLUMN session_id TEXT;
ALTER TABLE push_subs ADD COLUMN user_id INTEGER;
