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

-- Arcade high scores (one best score per user per game)
CREATE TABLE IF NOT EXISTS arcade_scores (
  username TEXT NOT NULL,
  game TEXT NOT NULL,
  score INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (username, game)
);

ALTER TABLE arcade_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON arcade_scores FOR ALL USING (true) WITH CHECK (true);

-- Private chat rooms with 48-hour auto-delete
CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours')
);

CREATE TABLE IF NOT EXISTS chat_room_messages (
  id SERIAL PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_room_msg_room ON chat_room_messages (room_id, created_at DESC);
CREATE INDEX idx_chat_rooms_expires ON chat_rooms (expires_at);

-- Auto-delete expired chat rooms
CREATE OR REPLACE FUNCTION cleanup_expired_chat_rooms() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM chat_rooms WHERE expires_at < NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_rooms ON chat_rooms;
CREATE TRIGGER trg_cleanup_rooms
  AFTER INSERT ON chat_rooms
  FOR EACH STATEMENT EXECUTE FUNCTION cleanup_expired_chat_rooms();

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_room_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON chat_rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON chat_room_messages FOR ALL USING (true) WITH CHECK (true);
