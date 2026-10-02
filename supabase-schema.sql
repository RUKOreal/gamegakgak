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
-- Since we use the service role key for API routes, these policies
-- allow the anon key (used by clients) to read data for real-time subscriptions.

-- Rooms: anyone can read
CREATE POLICY "Allow read rooms" ON rooms
  FOR SELECT USING (true);

-- Players: anyone can read
CREATE POLICY "Allow read players" ON players
  FOR SELECT USING (true);

-- Answers: anyone can read
CREATE POLICY "Allow read answers" ON answers
  FOR SELECT USING (true);

-- 7. Enable Realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE answers;

-- ============================================================
-- Done! Your database is ready.
-- ============================================================
