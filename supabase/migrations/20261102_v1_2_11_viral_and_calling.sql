-- =============================================================================
-- Migration: 20261102_v1_2_11_viral_and_calling.sql
-- Features:
-- 1. Anonymous Confessions column on public.posts
-- 2. Secret Sparks table & mutual detection trigger
-- 3. Daily Hot Takes & Responses tables
-- 4. Vibe Check Speed Matching sessions
-- 5. Call Sessions table with Realtime enabled
-- =============================================================================

-- 1. Posts Anonymous Masking
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS anonymous_alias TEXT;

-- 2. Secret Sparks Table
CREATE TABLE IF NOT EXISTS public.secret_sparks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  compliment_text TEXT NOT NULL,
  is_mutual BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_secret_sparks_sender_receiver UNIQUE (sender_id, receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_secret_sparks_receiver ON public.secret_sparks (receiver_id);
CREATE INDEX IF NOT EXISTS idx_secret_sparks_sender ON public.secret_sparks (sender_id);

ALTER TABLE public.secret_sparks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read sparks they sent or received" ON public.secret_sparks;
  CREATE POLICY "Users can read sparks they sent or received"
    ON public.secret_sparks FOR SELECT
    USING (auth.uid()::text = sender_id OR auth.uid()::text = receiver_id);

  DROP POLICY IF EXISTS "Users can send sparks" ON public.secret_sparks;
  CREATE POLICY "Users can send sparks"
    ON public.secret_sparks FOR INSERT
    WITH CHECK (auth.uid()::text = sender_id);

  DROP POLICY IF EXISTS "Users can update mutual status" ON public.secret_sparks;
  CREATE POLICY "Users can update mutual status"
    ON public.secret_sparks FOR UPDATE
    USING (auth.uid()::text = sender_id OR auth.uid()::text = receiver_id);
END $$;

-- Trigger to automatically detect mutual sparks
CREATE OR REPLACE FUNCTION public.handle_mutual_secret_spark()
RETURNS TRIGGER AS $$
BEGIN
  -- If reciprocal spark exists from receiver to sender, mark both as mutual
  IF EXISTS (
    SELECT 1 FROM public.secret_sparks
    WHERE sender_id = NEW.receiver_id AND receiver_id = NEW.sender_id
  ) THEN
    NEW.is_mutual := true;
    UPDATE public.secret_sparks
    SET is_mutual = true
    WHERE sender_id = NEW.receiver_id AND receiver_id = NEW.sender_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_mutual_secret_spark ON public.secret_sparks;
CREATE TRIGGER trg_mutual_secret_spark
  BEFORE INSERT ON public.secret_sparks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_mutual_secret_spark();

-- 3. Daily Hot Takes & Responses
CREATE TABLE IF NOT EXISTS public.daily_hot_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  category TEXT DEFAULT 'Community',
  active_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_hot_takes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view hot takes" ON public.daily_hot_takes;
  CREATE POLICY "Anyone can view hot takes"
    ON public.daily_hot_takes FOR SELECT
    USING (true);
END $$;

CREATE TABLE IF NOT EXISTS public.hot_take_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hot_take_id UUID NOT NULL REFERENCES public.daily_hot_takes (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  selected_option TEXT NOT NULL CHECK (selected_option IN ('A', 'B')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_hot_take_user UNIQUE (hot_take_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hot_take_responses ON public.hot_take_responses (hot_take_id);

ALTER TABLE public.hot_take_responses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view hot take responses" ON public.hot_take_responses;
  CREATE POLICY "Anyone can view hot take responses"
    ON public.hot_take_responses FOR SELECT
    USING (true);

  DROP POLICY IF EXISTS "Users can vote on hot takes" ON public.hot_take_responses;
  CREATE POLICY "Users can vote on hot takes"
    ON public.hot_take_responses FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

  DROP POLICY IF EXISTS "Users can update their hot take vote" ON public.hot_take_responses;
  CREATE POLICY "Users can update their hot take vote"
    ON public.hot_take_responses FOR UPDATE
    USING (auth.uid()::text = user_id);
END $$;

-- Seed 5 Engaging Hot Takes
INSERT INTO public.daily_hot_takes (question, option_a, option_b, category, active_date)
VALUES
  ('Chai vs Filter Coffee: Which one truly fuels an evening conversation with your special someone?', 'Cutting Chai ☕', 'Madras Filter Coffee 🫗', 'Lifestyle', CURRENT_DATE),
  ('First date spot: Cozy aesthetic coffee shop or bustling evening street-food crawl?', 'Cozy Coffee Shop ☕', 'Street-Food Crawl 🌮', 'Dating', CURRENT_DATE + 1),
  ('Should your partner have the same exact music taste as you, or completely different genres?', 'Exact Same Playlist 🎵', 'Opposite Genres 🎸', 'Romance', CURRENT_DATE + 2),
  ('Spontaneous road trip with zero bookings vs hyper-detailed 3-day itinerary?', 'Spontaneous Adventure 🚗', 'Planned Itinerary 🗺️', 'Travel', CURRENT_DATE + 3),
  ('Texting all day vs 1 uninterrupted 30-minute late night phone call?', 'All-Day Texting 💬', 'Night Phone Call 📞', 'Connection', CURRENT_DATE + 4)
ON CONFLICT DO NOTHING;

-- 4. Vibe Check Speed Matching Sessions
CREATE TABLE IF NOT EXISTS public.vibe_check_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a TEXT NOT NULL,
  user_b TEXT NOT NULL,
  icebreaker TEXT NOT NULL,
  user_a_reveal BOOLEAN NOT NULL DEFAULT false,
  user_b_reveal BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('waiting', 'active', 'matched', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vibe_check_users ON public.vibe_check_sessions (user_a, user_b);

ALTER TABLE public.vibe_check_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Participants can view and update their vibe check session" ON public.vibe_check_sessions;
  CREATE POLICY "Participants can view and update their vibe check session"
    ON public.vibe_check_sessions FOR ALL
    USING (auth.uid()::text = user_a OR auth.uid()::text = user_b);
END $$;

-- 5. Call Sessions Table
CREATE TABLE IF NOT EXISTS public.call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('voice', 'video')),
  status TEXT NOT NULL CHECK (status IN ('ringing', 'connected', 'ended', 'declined', 'missed')),
  room_url TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_parties ON public.call_sessions (caller_id, receiver_id, status);

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Call participants can view, insert and update calls" ON public.call_sessions;
  CREATE POLICY "Call participants can view, insert and update calls"
    ON public.call_sessions FOR ALL
    USING (auth.uid()::text = caller_id OR auth.uid()::text = receiver_id)
    WITH CHECK (auth.uid()::text = caller_id OR auth.uid()::text = receiver_id);
END $$;

-- Enable Realtime for call_sessions
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

