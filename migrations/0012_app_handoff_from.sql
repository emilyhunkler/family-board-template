-- Get the app: which browser made each one-time code (its session's SHA-256 id). Once the new iPhone or iPad
-- app has used the code, that browser stops offering "Get the app", since it can't see the app's own storage.
ALTER TABLE app_handoffs ADD COLUMN from_session TEXT;
