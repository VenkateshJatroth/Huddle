-- Migration: 20261102_v1_2_8_features.sql
-- Description: Add audio & poll support to posts, community events, event RSVPs, and saved bookmarks

-- 1. Extend posts table with audio and poll fields
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS audio_duration int,
  ADD COLUMN IF NOT EXISTS poll_question text,
  ADD COLUMN IF NOT EXISTS poll_options jsonb;

-- 2. Interactive Poll Votes table
CREATE TABLE IF NOT EXISTS public.poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  option_index int NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_poll_post_user UNIQUE (post_id, user_id)
);

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poll_votes' AND policyname = 'Allow read poll_votes') THEN
    CREATE POLICY "Allow read poll_votes" ON public.poll_votes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poll_votes' AND policyname = 'Allow insert own poll_votes') THEN
    CREATE POLICY "Allow insert own poll_votes" ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poll_votes' AND policyname = 'Allow update own poll_votes') THEN
    CREATE POLICY "Allow update own poll_votes" ON public.poll_votes FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poll_votes' AND policyname = 'Allow delete own poll_votes') THEN
    CREATE POLICY "Allow delete own poll_votes" ON public.poll_votes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. Community Meetups & Events
CREATE TABLE IF NOT EXISTS public.community_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  location text NOT NULL,
  city text,
  event_date timestamptz NOT NULL,
  creator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_events' AND policyname = 'Allow read community_events') THEN
    CREATE POLICY "Allow read community_events" ON public.community_events FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_events' AND policyname = 'Allow insert community_events') THEN
    CREATE POLICY "Allow insert community_events" ON public.community_events FOR INSERT WITH CHECK (auth.uid() = creator_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_events' AND policyname = 'Allow update community_events') THEN
    CREATE POLICY "Allow update community_events" ON public.community_events FOR UPDATE USING (auth.uid() = creator_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_events' AND policyname = 'Allow delete community_events') THEN
    CREATE POLICY "Allow delete community_events" ON public.community_events FOR DELETE USING (auth.uid() = creator_id);
  END IF;
END $$;

-- 4. Event RSVPs
CREATE TABLE IF NOT EXISTS public.event_rsvps (
  event_id uuid REFERENCES public.community_events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'going',
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_rsvps' AND policyname = 'Allow read event_rsvps') THEN
    CREATE POLICY "Allow read event_rsvps" ON public.event_rsvps FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_rsvps' AND policyname = 'Allow insert own event_rsvps') THEN
    CREATE POLICY "Allow insert own event_rsvps" ON public.event_rsvps FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_rsvps' AND policyname = 'Allow update own event_rsvps') THEN
    CREATE POLICY "Allow update own event_rsvps" ON public.event_rsvps FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_rsvps' AND policyname = 'Allow delete own event_rsvps') THEN
    CREATE POLICY "Allow delete own event_rsvps" ON public.event_rsvps FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. Saved Posts & Bookmarks
CREATE TABLE IF NOT EXISTS public.saved_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_saved_user_post UNIQUE (user_id, post_id)
);

ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_posts' AND policyname = 'Allow read own saved_posts') THEN
    CREATE POLICY "Allow read own saved_posts" ON public.saved_posts FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_posts' AND policyname = 'Allow insert own saved_posts') THEN
    CREATE POLICY "Allow insert own saved_posts" ON public.saved_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_posts' AND policyname = 'Allow delete own saved_posts') THEN
    CREATE POLICY "Allow delete own saved_posts" ON public.saved_posts FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Realtime publication for poll votes, events, and RSVPs
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes, public.community_events, public.event_rsvps;
  EXCEPTION WHEN OTHERS THEN
    -- If already in publication or publication doesn't exist, ignore
    NULL;
  END;
END $$;
