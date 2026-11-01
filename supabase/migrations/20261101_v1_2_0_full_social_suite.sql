-- ==============================================================================
-- GorMati v1.2.0 Full Social Suite Migration
-- ==============================================================================

-- 1. Direct Messages Table (Persistent 1-on-1 Chat)
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON public.direct_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver ON public.direct_messages (receiver_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_pair ON public.direct_messages (sender_id, receiver_id, created_at DESC);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages involving them" ON public.direct_messages;
CREATE POLICY "Users can view messages involving them"
  ON public.direct_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid()::text = receiver_id);

DROP POLICY IF EXISTS "Users can send messages" ON public.direct_messages;
CREATE POLICY "Users can send messages"
  ON public.direct_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can update read status on their received or sent messages" ON public.direct_messages;
CREATE POLICY "Users can update read status on their received or sent messages"
  ON public.direct_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid()::text = receiver_id);

-- 2. In-App Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  actor_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('like', 'reply', 'follow', 'message')),
  reference_id TEXT,
  content TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
CREATE POLICY "Authenticated users can create notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Add Channel to Community Posts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'channel'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN channel TEXT NOT NULL DEFAULT 'General';
  END IF;
END $$;

-- 4. Add Voice Intro to Profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'voice_intro_url'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN voice_intro_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'voice_duration_sec'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN voice_duration_sec INTEGER NOT NULL DEFAULT 15;
  END IF;
END $$;

-- 5. Enable Realtime Replication for Direct Messages & Notifications
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

