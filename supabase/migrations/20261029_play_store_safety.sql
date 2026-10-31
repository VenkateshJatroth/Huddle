-- ==============================================================================
-- GORMATI PLAY STORE SAFETY & COMPLIANCE MIGRATION
-- In-app Account Deletion, Blocked Users, and User Reports
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Blocked Users Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON public.blocked_users (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON public.blocked_users (blocked_user_id);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own blocked users" ON public.blocked_users;
CREATE POLICY "Users can view their own blocked users"
  ON public.blocked_users FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Users can block other users" ON public.blocked_users;
CREATE POLICY "Users can block other users"
  ON public.blocked_users FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Users can unblock users" ON public.blocked_users;
CREATE POLICY "Users can unblock users"
  ON public.blocked_users FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 2. User Reports Table (Content & Member Moderation)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  reported_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_reports_status ON public.user_reports (status);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can submit reports" ON public.user_reports;
CREATE POLICY "Users can submit reports"
  ON public.user_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 3. In-App User Account Deletion Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete user messages
  DELETE FROM public.messages WHERE sender_id = v_uid OR receiver_id = v_uid;

  -- Delete follow relationships
  DELETE FROM public.follow_relationships WHERE requester_id = v_uid OR target_id = v_uid;

  -- Delete blocked users records
  DELETE FROM public.blocked_users WHERE blocker_id = v_uid OR blocked_user_id = v_uid;

  -- Delete user profile
  DELETE FROM public.profiles WHERE id = v_uid;

  -- Finally delete from auth.users (requires security definer)
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

