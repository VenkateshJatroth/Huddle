-- ==============================================================================
-- Migration: 20261104_chat_and_media_hardening.sql
-- Description:
--   1. Hardens public.direct_messages with client-side idempotency (client_id),
--      delivery timestamp (delivered_at), and media metadata.
--   2. Strict tamper-proofing triggers preventing message content modifications
--      and preventing senders from forging delivery/read receipts.
--   3. Dedicated private storage bucket `chat_media` with strict RLS
--      policies ensuring only unblocked conversation participants can access attachments.
--   4. Index optimizations for fast cursor-based pagination.
-- ==============================================================================

-- 1. Extend direct_messages table
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS client_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'text' CHECK (media_type IN ('text', 'image', 'audio', 'video')),
  ADD COLUMN IF NOT EXISTS media_duration INTEGER,
  ADD COLUMN IF NOT EXISTS is_failed BOOLEAN DEFAULT false;

-- Add partial unique index for idempotency (prevent duplicate inserts for the same client_id from sender)
CREATE UNIQUE INDEX IF NOT EXISTS idx_direct_messages_client_id
  ON public.direct_messages (sender_id, client_id)
  WHERE client_id IS NOT NULL;

-- Fast index for cursor-based pagination (created_at DESC on conversation pair)
CREATE INDEX IF NOT EXISTS idx_direct_messages_cursor
  ON public.direct_messages (sender_id, receiver_id, created_at DESC, id DESC);

-- 2. Clean up legacy UPDATE policies and install strict RLS policy
DROP POLICY IF EXISTS "Users can update read or delivery status on their messages" ON public.direct_messages;
DROP POLICY IF EXISTS "Users can update read status on their received or sent messages" ON public.direct_messages;

CREATE POLICY "Users can update read or delivery status on their messages"
  ON public.direct_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid()::text = receiver_id)
  WITH CHECK (auth.uid() = sender_id OR auth.uid()::text = receiver_id);

-- Enforce zero-forgery on new message creation
CREATE OR REPLACE FUNCTION public.validate_direct_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Guarantee that newly sent messages always begin unread and undelivered
  NEW.read_at := NULL;
  NEW.delivered_at := NULL;
  RETURN NEW;
END;
$$;

-- Restrict direct execution from public roles; grant execution to authenticated and service_role
REVOKE ALL ON FUNCTION public.validate_direct_message_insert() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_direct_message_insert() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validate_direct_message_insert ON public.direct_messages;
CREATE TRIGGER trg_validate_direct_message_insert
  BEFORE INSERT ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_direct_message_insert();

-- Enforce strict immutability and role permissions on direct_messages updates
CREATE OR REPLACE FUNCTION public.validate_direct_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Strict guard against message content tampering using null-safe comparisons
  IF (NEW.id IS DISTINCT FROM OLD.id) OR
     (NEW.sender_id IS DISTINCT FROM OLD.sender_id) OR
     (NEW.receiver_id IS DISTINCT FROM OLD.receiver_id) OR
     (NEW.content IS DISTINCT FROM OLD.content) OR
     (NEW.created_at IS DISTINCT FROM OLD.created_at) OR
     (NEW.image_url IS DISTINCT FROM OLD.image_url) OR
     (NEW.media_type IS DISTINCT FROM OLD.media_type) OR
     (NEW.media_duration IS DISTINCT FROM OLD.media_duration) OR
     (NEW.client_id IS DISTINCT FROM OLD.client_id) THEN
    RAISE EXCEPTION 'Immutable fields of direct_messages cannot be modified';
  END IF;

  -- Role-based privilege enforcement:
  -- Case A: The sender is updating the row
  IF auth.uid() = OLD.sender_id THEN
    -- Sender can ONLY update the is_failed flag (cannot forge delivered_at or read_at)
    IF (NEW.delivered_at IS DISTINCT FROM OLD.delivered_at) OR (NEW.read_at IS DISTINCT FROM OLD.read_at) THEN
      RAISE EXCEPTION 'Senders cannot forge recipient delivery or read receipts';
    END IF;
  -- Case B: The recipient is updating the row
  ELSIF auth.uid()::text = OLD.receiver_id THEN
    -- Recipient can ONLY update delivered_at and read_at (cannot modify is_failed)
    IF (NEW.is_failed IS DISTINCT FROM OLD.is_failed) THEN
      RAISE EXCEPTION 'Recipients cannot alter message is_failed status';
    END IF;

    -- Monotonic progression enforcement: timestamps cannot be cleared or moved backward
    IF (OLD.delivered_at IS NOT NULL AND (NEW.delivered_at IS NULL OR NEW.delivered_at < OLD.delivered_at)) THEN
      RAISE EXCEPTION 'delivered_at timestamp cannot be cleared or moved backwards';
    END IF;
    IF (OLD.read_at IS NOT NULL AND (NEW.read_at IS NULL OR NEW.read_at < OLD.read_at)) THEN
      RAISE EXCEPTION 'read_at timestamp cannot be cleared or moved backwards';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized to update this direct message';
  END IF;

  RETURN NEW;
END;
$$;

-- Restrict direct execution from public roles; grant execution to authenticated and service_role
REVOKE ALL ON FUNCTION public.validate_direct_message_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_direct_message_update() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validate_direct_message_update ON public.direct_messages;
CREATE TRIGGER trg_validate_direct_message_update
  BEFORE UPDATE ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_direct_message_update();

-- 3. Dedicated Private Storage Bucket: `chat_media`
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat_media',
  'chat_media',
  false, -- STRICTLY PRIVATE: Requires short-lived signed URLs
  52428800, -- 50 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800;

-- Storage RLS: Ensure only authenticated users can upload to chat_media in their own folder
DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat_media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Helper: Bidirectional block check with exception-safe parsing and SECURITY DEFINER privileges.
-- Ensures Storage RLS can check whether either participant has blocked the other,
-- independent of caller-side table visibility rules on public.blocked_users.
-- Privacy guard: Enforces user_a = auth.uid() so authenticated users cannot probe arbitrary third-party relationships.
CREATE OR REPLACE FUNCTION public.is_blocked_bidirectional(user_a UUID, user_b_text TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parsed_b UUID;
BEGIN
  -- Strict privacy guard: Callers can ONLY query blocking relationships involving their own authenticated identity.
  -- Prevents third-party users (e.g. Charlie) from discovering whether Alice and Bob have blocked each other.
  IF auth.uid() IS NULL OR (user_a IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: callers may only check blocking relationships involving their own authenticated identity';
  END IF;

  BEGIN
    parsed_b := user_b_text::UUID;
  EXCEPTION WHEN OTHERS THEN
    -- If user_b_text is not a valid UUID (e.g. demo string), it cannot match public.blocked_users
    RETURN FALSE;
  END;

  RETURN EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = user_a AND blocked_user_id = parsed_b)
       OR (blocker_id = parsed_b AND blocked_user_id = user_a)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_blocked_bidirectional(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_bidirectional(UUID, TEXT) TO authenticated, service_role;

-- Storage RLS: Allow participants to read chat media objects only if unblocked
-- Strict enforcement:
--   1. Zero uploader bypass: uploader exception removed so blocking is enforced on both parties.
--   2. Exact object path matching: dm.image_url = name (no SQL LIKE substring matching).
--   3. Bidirectional block checks: caller blocked partner OR partner blocked caller denies access.
DROP POLICY IF EXISTS "Conversation participants can read chat media" ON storage.objects;
CREATE POLICY "Conversation participants can read chat media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat_media' AND EXISTS (
      SELECT 1 FROM public.direct_messages dm
      WHERE dm.image_url = name
        AND (dm.sender_id = auth.uid() OR dm.receiver_id = auth.uid()::text)
        AND NOT public.is_blocked_bidirectional(
          auth.uid(),
          CASE
            WHEN dm.sender_id = auth.uid() THEN dm.receiver_id
            ELSE dm.sender_id::text
          END
        )
    )
  );

-- Storage RLS: Users can delete their own uploaded chat media
DROP POLICY IF EXISTS "Users can delete their own chat media" ON storage.objects;
CREATE POLICY "Users can delete their own chat media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat_media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ==============================================================================
-- PRODUCTION DISASTER RECOVERY & ROLLBACK PLAN (SECURITY- & DATA-PRESERVING)
-- ==============================================================================
--
-- LEVEL 1: APPLICATION-LEVEL ROLLBACK
--   Roll back mobile bundle via EAS Update or redeploy prior client commit.
--   The database schema is backwards-compatible: columns client_id, delivered_at,
--   and media_type are nullable or have defaults, so previous app versions continue
--   functioning without database rollback.
--
-- LEVEL 2: FUNCTION / TRIGGER ROLLBACK (IF LOGIC REVISION REQUIRED)
--   NEVER DROP security triggers as an ad-hoc debugging step; dropping them exposes
--   the table to arbitrary content and receipt tampering.
--   Instead, re-apply a vetted prior definition with SECURITY DEFINER and search_path = '':
--     CREATE OR REPLACE FUNCTION public.validate_direct_message_update() ...
--
-- LEVEL 3: STORAGE POLICY TROUBLESHOOTING & RECOVERY
--   DO NOT delete the 'chat_media' storage bucket or its contents.
--   DO NOT switch the bucket to public ('public = true').
--   DO NOT remove or weaken the bidirectional blocking check.
--   DO NOT replace exact matching with SQL LIKE '%...%'.
--   If media attachment authorization issues occur during staging triage:
--     1. Verify exact path match: Ensure direct_messages.image_url stores the exact
--        relative object path (e.g. 'uploader_uuid/filename.ext') matching storage.objects.name.
--     2. Inspect blocking relationships: Run:
--          SELECT * FROM public.blocked_users
--          WHERE blocker_id = :uid OR blocked_user_id = :uid;
--     3. Re-apply the canonical hardened policy with zero authorization dilution:
--          DROP POLICY IF EXISTS "Conversation participants can read chat media" ON storage.objects;
--          CREATE POLICY "Conversation participants can read chat media"
--            ON storage.objects FOR SELECT TO authenticated
--            USING (
--              bucket_id = 'chat_media' AND EXISTS (
--                SELECT 1 FROM public.direct_messages dm
--                WHERE dm.image_url = name
--                  AND (dm.sender_id = auth.uid() OR dm.receiver_id = auth.uid()::text)
--                  AND NOT public.is_blocked_bidirectional(
--                    auth.uid(),
--                    CASE WHEN dm.sender_id = auth.uid() THEN dm.receiver_id ELSE dm.sender_id::text END
--                  )
--              )
--            );
--
-- LEVEL 4: STRUCTURAL / INDEX ROLLBACK
--   If indexes need to be removed to reduce write overhead:
--     DROP INDEX IF EXISTS idx_direct_messages_cursor;
--     DROP INDEX IF EXISTS idx_direct_messages_client_id;
--   DO NOT run ALTER TABLE ... DROP COLUMN client_id / delivered_at in production,
--   as this causes permanent data loss of historical receipts.
-- ==============================================================================
