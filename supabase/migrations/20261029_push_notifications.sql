-- ==============================================================================
-- GORMATI PUSH NOTIFICATIONS CONFIGURATION
-- Provision push_token column on public.profiles and webhook trigger documentation
-- ==============================================================================

-- 1. Ensure push_token column exists on public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Index for token queries
CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON public.profiles (push_token);

-- 2. Verify that authenticated users can update their own push_token
-- The existing policy "Users can update their own profile" covers all columns for auth.uid() = id.

-- 3. Database Webhooks to Edge Function:
-- In Supabase Dashboard (Database -> Webhooks):
--
-- Hook 1: "on_new_message"
--   Table: public.messages
--   Events: INSERT
--   Type: Webhook -> HTTP Request
--   URL: https://<project-ref>.supabase.co/functions/v1/push-notifications
--   HTTP Method: POST
--   Headers: Content-Type: application/json, Authorization: Bearer <service_role_key>
--
-- Hook 2: "on_mutual_match"
--   Table: public.follow_relationships
--   Events: INSERT, UPDATE
--   Type: Webhook -> HTTP Request
--   URL: https://<project-ref>.supabase.co/functions/v1/push-notifications
--   HTTP Method: POST
--   Headers: Content-Type: application/json, Authorization: Bearer <service_role_key>

