-- Saved voice clips, so each sentence is only made once by the AI voice (it has a daily free limit).
-- Shared by all families on a board: a clip is just a voice saying some text.
CREATE TABLE IF NOT EXISTS tts_cache (
  voice TEXT NOT NULL, text TEXT NOT NULL, audio BLOB NOT NULL, created_at TEXT NOT NULL, used_at TEXT NOT NULL,
  PRIMARY KEY (voice, text)
);
