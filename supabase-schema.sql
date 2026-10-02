-- ============================================================
-- Kamen Rider Song Guessing Game — Supabase Database Setup
-- Run this SQL in your Supabase SQL Editor
-- ============================================================

-- 1. Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'round_end', 'finished')),
  current_round INT DEFAULT 0,
  total_rounds INT DEFAULT 10,
  current_question_index INT DEFAULT -1,
  round_start_time BIGINT,
  question_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create players table
CREATE TABLE IF NOT EXISTS players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  score INT DEFAULT 0,
  is_host BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, player_id)
);

-- 3. Create answers table
CREATE TABLE IF NOT EXISTS answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  round INT NOT NULL,
  answer_index INT NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  time_taken_ms INT NOT NULL,
  score_earned INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, player_id, round)
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_player_id ON players(player_id);
CREATE INDEX IF NOT EXISTS idx_answers_room_round ON answers(room_id, round);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- 6. Create permissive policies (for game functionality)
-- Allow full access for anon and service_role keys to create/join rooms, answer questions, and sync
DROP POLICY IF EXISTS "Allow read rooms" ON rooms;
DROP POLICY IF EXISTS "Allow all rooms" ON rooms;
CREATE POLICY "Allow all rooms" ON rooms
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read players" ON players;
DROP POLICY IF EXISTS "Allow all players" ON players;
CREATE POLICY "Allow all players" ON players
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read answers" ON answers;
DROP POLICY IF EXISTS "Allow all answers" ON answers;
CREATE POLICY "Allow all answers" ON answers
  FOR ALL USING (true) WITH CHECK (true);

-- 7. Enable Realtime for tables (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE players;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'answers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE answers;
  END IF;
END $$;

-- ============================================================
-- Done! Your database is ready.
-- ============================================================
