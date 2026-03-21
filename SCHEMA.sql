-- 1. Create a matches table to store overall match data
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT UNIQUE NOT NULL,
  video_url TEXT NOT NULL,
  title TEXT,
  duration_sec INTEGER,
  summary TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'analyzed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create a jobs table for the Agent Queue
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'skimming', 'scouting', 'completed', 'failed'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Update the existing highlights table (if needed)
-- Assuming highlights already has: video_id, start_sec, end_sec, text, audio_url
-- We'll add a match_id for better indexing if it doesn't exist
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES matches(id);

-- 4. Enable Realtime for these tables so the Frontend can "listen"
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE highlights;
