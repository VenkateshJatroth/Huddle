-- ==============================================================================
-- GorMati v1.1.0 Full Live Schema Migration
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

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

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

-- 2. Post Replies / Comments Table
CREATE TABLE IF NOT EXISTS public.post_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_replies_post ON public.post_replies (post_id, created_at ASC);

ALTER TABLE public.post_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Replies can be viewed by anyone" ON public.post_replies;
CREATE POLICY "Replies can be viewed by anyone"
  ON public.post_replies FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create replies" ON public.post_replies;
CREATE POLICY "Authenticated users can create replies"
  ON public.post_replies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can delete their own replies" ON public.post_replies;
CREATE POLICY "Authors can delete their own replies"
  ON public.post_replies FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

-- 3. Follow Relationships Table & RLS
CREATE TABLE IF NOT EXISTS public.follow_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_follow_pair UNIQUE (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follow_follower ON public.follow_relationships (follower_id, status);
CREATE INDEX IF NOT EXISTS idx_follow_following ON public.follow_relationships (following_id, status);

ALTER TABLE public.follow_relationships ENABLE ROW LEVEL SECURITY;

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

