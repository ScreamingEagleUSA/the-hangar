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

CREATE INDEX IF NOT EXISTS idx_room_msg_room ON chat_room_messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_expires ON chat_rooms (expires_at);

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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_rooms' AND policyname = 'Allow all for anon') THEN
    CREATE POLICY "Allow all for anon" ON chat_rooms FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_room_messages' AND policyname = 'Allow all for anon') THEN
    CREATE POLICY "Allow all for anon" ON chat_room_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
