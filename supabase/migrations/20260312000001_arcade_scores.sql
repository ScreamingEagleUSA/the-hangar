CREATE TABLE IF NOT EXISTS arcade_scores (
  username TEXT NOT NULL,
  game TEXT NOT NULL,
  score INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (username, game)
);

ALTER TABLE arcade_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'arcade_scores' AND policyname = 'Allow all for anon'
  ) THEN
    CREATE POLICY "Allow all for anon" ON arcade_scores FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
