-- ==============================================================================
-- GorMati Migration: Posts Table & Community Feed
-- ==============================================================================

-- 1. Community Posts Table
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) <= 500),
  audience TEXT NOT NULL DEFAULT 'Everyone' CHECK (audience IN ('Everyone', 'Connections', 'Only me')),
  image_url TEXT,
  likes_count INTEGER NOT NULL DEFAULT 0,
  replies_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_author ON public.posts (author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts (created_at DESC);

-- Enable RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Post Policies
DROP POLICY IF EXISTS "Public posts can be read by everyone" ON public.posts;
CREATE POLICY "Public posts can be read by everyone"
  ON public.posts FOR SELECT
  USING (audience = 'Everyone' OR auth.uid() = author_id);

DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.posts;
CREATE POLICY "Authenticated users can create posts"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can update their own posts" ON public.posts;
CREATE POLICY "Authors can update their own posts"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can delete their own posts" ON public.posts;
CREATE POLICY "Authors can delete their own posts"
  ON public.posts FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

-- 2. Follow Relationships RLS Policies (using live column names follower_id & following_id)
DROP POLICY IF EXISTS "Users can view relationships involving them" ON public.follow_relationships;
CREATE POLICY "Users can view relationships involving them"
  ON public.follow_relationships FOR SELECT
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

DROP POLICY IF EXISTS "Users can insert follow relationships" ON public.follow_relationships;
CREATE POLICY "Users can insert follow relationships"
  ON public.follow_relationships FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can update their follow relationships" ON public.follow_relationships;
CREATE POLICY "Users can update their follow relationships"
  ON public.follow_relationships FOR UPDATE
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

DROP POLICY IF EXISTS "Users can delete their follow relationships" ON public.follow_relationships;
CREATE POLICY "Users can delete their follow relationships"
  ON public.follow_relationships FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

