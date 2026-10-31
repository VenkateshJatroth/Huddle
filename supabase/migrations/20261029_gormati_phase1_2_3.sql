-- ==============================================================================
-- GORMATI FULL-STACK MASTER MIGRATION (PHASES 1, 2 & 3)
-- Complete Provisioning: Profiles, Follow Graph, RPCs, Messages, Realtime & Storage
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Create or Extend public.profiles
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Gormati member',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false,
  full_name TEXT,
  age INTEGER,
  location TEXT,
  dating_intention TEXT,
  interests TEXT[] DEFAULT '{}',
  prompts JSONB DEFAULT '[]'::jsonb,
  gallery_urls TEXT[] DEFAULT '{}',
  is_verified BOOLEAN DEFAULT false,
  push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_normalized CHECK (username = lower(username))
);

-- In case public.profiles existed with baseline columns, ensure all extended columns exist:
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS dating_intention TEXT,
  ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prompts JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uidx ON public.profiles (lower(username));
CREATE INDEX IF NOT EXISTS idx_profiles_location ON public.profiles (location);
CREATE INDEX IF NOT EXISTS idx_profiles_dating_intention ON public.profiles (dating_intention);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies on profiles
DROP POLICY IF EXISTS "Profiles are visible to authenticated users" ON public.profiles;
CREATE POLICY "Profiles are visible to authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR NOT is_private
    OR EXISTS (
      SELECT 1 FROM public.follow_relationships
      WHERE requester_id = auth.uid()
        AND target_id = profiles.id
        AND status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "Public profiles viewable by anon" ON public.profiles;
CREATE POLICY "Public profiles viewable by anon"
  ON public.profiles FOR SELECT
  TO anon
  USING (NOT is_private);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Trigger to automatically create profile row on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  base_username text;
  clean_username text;
BEGIN
  base_username := lower(split_part(new.email, '@', 1));
  clean_username := regexp_replace(base_username, '[^a-z0-9._]', '', 'g');
  IF length(clean_username) < 3 THEN
    clean_username := 'user_' || substr(new.id::text, 1, 8);
  END IF;

  INSERT INTO public.profiles (id, username, display_name, full_name, is_private)
  VALUES (
    new.id,
    clean_username,
    coalesce(new.raw_user_meta_data->>'full_name', 'Gormati Member'),
    new.raw_user_meta_data->>'full_name',
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
EXCEPTION
  WHEN unique_violation THEN
    -- If username collides, suffix with random characters
    INSERT INTO public.profiles (id, username, display_name, is_private)
    VALUES (
      new.id,
      clean_username || '_' || substr(new.id::text, 1, 4),
      'Gormati Member',
      false
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 2. Follow Relationships Table & Graph
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follow_relationships (
  requester_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_follow_target ON public.follow_relationships (target_id, status);
CREATE INDEX IF NOT EXISTS idx_follow_requester ON public.follow_relationships (requester_id, status);

ALTER TABLE public.follow_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view follow relationships" ON public.follow_relationships;
CREATE POLICY "Participants can view follow relationships"
  ON public.follow_relationships FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = target_id);

-- ------------------------------------------------------------------------------
-- 3. Social RPC Functions
-- ------------------------------------------------------------------------------

-- Follow / Connect RPC
CREATE OR REPLACE FUNCTION public.indiana_follow_profile(p_target_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id UUID := auth.uid();
  v_target_is_private BOOLEAN;
  v_status TEXT;
BEGIN
  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'A signed-in user is required.';
  END IF;
  IF p_target_id IS NULL OR p_target_id = v_requester_id THEN
    RAISE EXCEPTION 'Invalid target profile.';
  END IF;

  SELECT is_private INTO v_target_is_private
  FROM public.profiles
  WHERE id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile does not exist.';
  END IF;

  v_status := CASE WHEN v_target_is_private THEN 'pending' ELSE 'accepted' END;

  INSERT INTO public.follow_relationships (requester_id, target_id, status)
  VALUES (v_requester_id, p_target_id, v_status)
  ON CONFLICT (requester_id, target_id) DO UPDATE SET updated_at = now();

  SELECT status INTO v_status
  FROM public.follow_relationships
  WHERE requester_id = v_requester_id AND target_id = p_target_id;

  RETURN v_status;
END;
$$;

-- Approve follow request
CREATE OR REPLACE FUNCTION public.indiana_approve_follow_request(p_requester_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id UUID := auth.uid();
BEGIN
  IF v_target_id IS NULL OR p_requester_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.follow_relationships
  SET status = 'accepted', updated_at = now()
  WHERE requester_id = p_requester_id AND target_id = v_target_id AND status = 'pending';

  RETURN FOUND;
END;
$$;

-- Reject follow request
CREATE OR REPLACE FUNCTION public.indiana_reject_follow_request(p_requester_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id UUID := auth.uid();
BEGIN
  IF v_target_id IS NULL OR p_requester_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.follow_relationships
  WHERE requester_id = p_requester_id AND target_id = v_target_id AND status = 'pending';

  RETURN FOUND;
END;
$$;

-- Remove follow relationship (Unfollow)
CREATE OR REPLACE FUNCTION public.indiana_remove_follow_relationship(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id UUID := auth.uid();
BEGIN
  IF v_requester_id IS NULL OR p_target_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.follow_relationships
  WHERE requester_id = v_requester_id AND target_id = p_target_id;

  RETURN FOUND;
END;
$$;

-- Search profiles
CREATE OR REPLACE FUNCTION public.indiana_search_profiles(p_query TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  profile_id UUID,
  profile_username TEXT,
  profile_display_name TEXT,
  profile_is_private BOOLEAN,
  outgoing_status TEXT,
  follows_you BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_id UUID := auth.uid();
  v_query TEXT := lower(trim(coalesce(p_query, '')));
BEGIN
  IF v_viewer_id IS NULL OR length(v_query) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.is_private,
    rel.status,
    EXISTS (
      SELECT 1 FROM public.follow_relationships inb
      WHERE inb.requester_id = p.id AND inb.target_id = v_viewer_id AND inb.status = 'accepted'
    )
  FROM public.profiles p
  LEFT JOIN public.follow_relationships rel
    ON rel.requester_id = v_viewer_id AND rel.target_id = p.id
  WHERE p.id <> v_viewer_id
    AND (
      p.username ILIKE '%' || v_query || '%'
      OR p.display_name ILIKE '%' || v_query || '%'
      OR p.full_name ILIKE '%' || v_query || '%'
    )
  ORDER BY p.username
  LIMIT coalesce(p_limit, 20);
END;
$$;

-- Relationship Profile Summaries
CREATE OR REPLACE FUNCTION public.indiana_relationship_profile_summaries(p_profile_ids UUID[])
RETURNS TABLE (
  profile_id UUID,
  profile_username TEXT,
  profile_display_name TEXT,
  profile_is_private BOOLEAN,
  profile_bio TEXT,
  profile_avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.is_private,
    p.bio,
    p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY(p_profile_ids);
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. 1-on-1 Messages Table & Realtime Publication
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages (receiver_id, read_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their conversation messages" ON public.messages;
CREATE POLICY "Users can view their conversation messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.messages;
CREATE POLICY "Authenticated users can send messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Receivers can mark messages as read" ON public.messages;
CREATE POLICY "Receivers can mark messages as read"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Add public.messages to the Realtime publication (Idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 5. Public Storage Buckets: avatars & gallery
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('gallery', 'gallery', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Objects Policies
DROP POLICY IF EXISTS "Public can view avatar and gallery objects" ON storage.objects;
CREATE POLICY "Public can view avatar and gallery objects"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id IN ('avatars', 'gallery'));

DROP POLICY IF EXISTS "Authenticated users can upload avatar and gallery objects" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatar and gallery objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id IN ('avatars', 'gallery')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update their own avatar and gallery objects" ON storage.objects;
CREATE POLICY "Users can update their own avatar and gallery objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id IN ('avatars', 'gallery')
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('avatars', 'gallery')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own avatar and gallery objects" ON storage.objects;
CREATE POLICY "Users can delete their own avatar and gallery objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id IN ('avatars', 'gallery')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
