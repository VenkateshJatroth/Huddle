-- Migration: Daily Streaks & Community Leaderboard
-- Tracks consecutive posting days, total posts, and provides leaderboard rankings.

-- 1. Add streak and activity tracking columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_streak integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS longest_streak integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_post_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_posts integer DEFAULT 0;

-- 2. Index for fast leaderboard querying
CREATE INDEX IF NOT EXISTS idx_profiles_streaks ON public.profiles(current_streak DESC, total_posts DESC);

-- 3. Stored procedure to atomically record a post and update streaks
CREATE OR REPLACE FUNCTION public.record_user_post_streak(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_date date;
  v_current_streak integer;
  v_longest_streak integer;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT last_post_date, current_streak, longest_streak
  INTO v_last_date, v_current_streak, v_longest_streak
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_current_streak := COALESCE(v_current_streak, 0);
  v_longest_streak := COALESCE(v_longest_streak, 0);

  IF v_last_date IS NULL THEN
    v_current_streak := 1;
  ELSIF v_last_date = v_today THEN
    -- Already posted today, streak continues
    NULL;
  ELSIF v_last_date = v_today - 1 THEN
    -- Posted consecutive day, increment streak
    v_current_streak := v_current_streak + 1;
  ELSE
    -- Streak lapsed, start new streak
    v_current_streak := 1;
  END IF;

  IF v_current_streak > v_longest_streak THEN
    v_longest_streak := v_current_streak;
  END IF;

  UPDATE public.profiles
  SET
    current_streak = v_current_streak,
    longest_streak = v_longest_streak,
    last_post_date = v_today,
    total_posts = COALESCE(total_posts, 0) + 1,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- 4. Initial streak values for active community members
UPDATE public.profiles
SET current_streak = 3, longest_streak = 5, total_posts = 8, last_post_date = CURRENT_DATE
WHERE display_name ILIKE '%Venky%' OR username ILIKE '%venky%' OR username ILIKE '%member_a59aa2%';

UPDATE public.profiles
SET current_streak = 2, longest_streak = 4, total_posts = 5, last_post_date = CURRENT_DATE
WHERE username ILIKE '%aravind%' OR display_name ILIKE '%aravind%';

UPDATE public.profiles
SET current_streak = 2, longest_streak = 3, total_posts = 4, last_post_date = CURRENT_DATE
WHERE username ILIKE '%harichand%' OR display_name ILIKE '%harichand%';

UPDATE public.profiles
SET current_streak = 1, longest_streak = 2, total_posts = 3, last_post_date = CURRENT_DATE
WHERE username ILIKE '%munnabhai%' OR display_name ILIKE '%munnabhai%';

UPDATE public.profiles
SET current_streak = 1, longest_streak = 2, total_posts = 2, last_post_date = CURRENT_DATE
WHERE username ILIKE '%sumear%' OR display_name ILIKE '%sumear%';

UPDATE public.profiles
SET current_streak = 1, longest_streak = 1, total_posts = 2, last_post_date = CURRENT_DATE
WHERE username ILIKE '%8125%' OR display_name ILIKE '%8125%';

