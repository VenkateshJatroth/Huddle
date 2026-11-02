-- Migration: Add Agora Channel and Token to public.call_sessions
-- Supports Realtime Voice & Video Calling Signaling

DO $$ BEGIN
  ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS agora_channel TEXT;
  ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS agora_token TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Ensure RLS policy permits participants to view and update agora channels
DO $$ BEGIN
  DROP POLICY IF EXISTS "Call participants can view, insert and update calls" ON public.call_sessions;
  CREATE POLICY "Call participants can view, insert and update calls"
    ON public.call_sessions FOR ALL
    USING (auth.uid()::text = caller_id OR auth.uid()::text = receiver_id)
    WITH CHECK (auth.uid()::text = caller_id OR auth.uid()::text = receiver_id);
END $$;

-- Verify Realtime publication for call_sessions
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

