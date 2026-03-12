-- Run this in the Supabase SQL Editor to set up the database

CREATE TABLE IF NOT EXISTS leaderboard (
  username TEXT PRIMARY KEY,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  games_played INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  max_streak INT DEFAULT 0,
  tower_best INT DEFAULT 0,
  reaction_best INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_created ON chat_messages (created_at DESC);

-- Keep only the latest 200 messages via a trigger
CREATE OR REPLACE FUNCTION trim_chat_messages() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM chat_messages WHERE id NOT IN (
    SELECT id FROM chat_messages ORDER BY created_at DESC LIMIT 200
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trim_chat ON chat_messages;
CREATE TRIGGER trg_trim_chat
  AFTER INSERT ON chat_messages
  FOR EACH STATEMENT EXECUTE FUNCTION trim_chat_messages();

-- Enable Row Level Security but allow all operations via service key
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON leaderboard FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
